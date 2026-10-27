import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import * as hap from '@homebridge/hap-nodejs';
import {HarmonyPlatform} from '../harmonyPlatform.js';
import {HarmonyClient} from '../harmonyClient.js';
import HarmonyTools from '../harmonyTools.js';

const {Service, Characteristic: C} = hap;
class PlatformAccessory extends hap.Accessory {
  constructor(...args) {
    super(...args);
    this.context = {};
  }
}
const action = (command) => JSON.stringify({command, deviceId: 'test', type: 'IRCommand'});
const data = {
  data: {
    activity: [
      {
        id: '100',
        label: 'Watch TV',
        controlGroup: [
          {name: 'NavigationBasic', function: [{name: 'DirectionUp', action: action('Up')}]},
          {
            name: 'TransportBasic',
            function: ['Play', 'Pause'].map((name) => ({name, action: action(name)})),
          },
          {
            name: 'Volume',
            function: ['VolumeUp', 'VolumeDown', 'Mute'].map((name) => ({
              name,
              action: action(name),
            })),
          },
        ],
      },
    ],
    device: [],
    sequence: [],
  },
};
const flush = async () => {
  for (let n = 0; n < 60; n++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
};

function fixture(t, read = true) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const storage = mkdtempSync(join(tmpdir(), 'harmony-recovery-test-'));
  t.after(() => rmSync(storage, {recursive: true, force: true}));
  const logs = [];
  const log = (...args) => logs.push(args.join(' '));
  log.debug = () => {};
  const published = [];
  const api = Object.assign(new EventEmitter(), {
    hap,
    platformAccessory: PlatformAccessory,
    user: {storagePath: () => storage},
    publishExternalAccessories: (_, a) => published.push(...a),
    registerPlatformAccessories: () => {},
    unregisterPlatformAccessories: () => {},
  });
  const main = new HarmonyPlatform(
    log,
    {
      name: 'Test hub',
      hubIP: '192.0.2.10',
      mainActivity: 'Watch TV',
      publishAllTVAsExternalAccessory: true,
      publishGeneralVolumeSlider: true,
      linkVolumeControlToTV: true,
    },
    api
  );
  const p = main.platforms[0],
    b = p.harmonyBase,
    sent = [];
  b.harmony.isOpened = () => true;
  b.harmony.getCurrentActivity = async () => '100';
  b.harmony.sendCommand = async (command) => {
    sent.push(command);
    return {code: 200};
  };
  b.harmony.startActivity = async () => ({code: 200, msg: 'OK'});
  if (read) {
    p.readAccessories(structuredClone(data), {});
    p._currentActivity = '100';
    p.updateCurrentInputService();
    p._currentInputService.SetupCommand = action('Settings');
  }
  return {main, p, b, sent, logs, accessory: published[0]};
}

test('cleanup removes a moved service only from its old accessory and unlinks it', (t) => {
  const f = fixture(t, false);
  const old = new PlatformAccessory('Old', hap.uuid.generate('old'));
  const next = new PlatformAccessory('Next', hap.uuid.generate('next'));
  const tv = old.addService(new Service.Television('Old TV', 'tv'));
  const obsolete = old.addService(new Service.Lightbulb('Volume', 'GeneralVolumeSlider'));
  const wanted = next.addService(new Service.Lightbulb('Volume', 'GeneralVolumeSlider'));
  tv.addLinkedService(obsolete);
  f.p._foundAccessories = [old, next];
  f.p._confirmedServices = [tv, wanted];
  f.b.cleanServices(f.p);
  assert.ok(!old.services.includes(obsolete));
  assert.ok(!tv.linkedServices.includes(obsolete));
  assert.ok(old.services.includes(tv));
  assert.ok(next.services.includes(wanted));
  assert.ok(old.getService(Service.AccessoryInformation));
});

for (const failure of ['lookup', 'construction']) {
  test(`startup ${failure} failure reaches one retry, including duplicate init and close events`, async (t) => {
    const f = fixture(t, false);
    f.b.configureHarmonyAPI(f.p);
    let connections = 0,
      retries = 0;
    f.b.harmony.connect = async () => {
      connections++;
    };
    f.b.harmony.getConfig = async () => structuredClone(data);
    f.b.harmony.close = () => {
      f.b.harmony.emit('close');
      return false;
    };
    f.b.getHomeControlsAccessories = async () => {
      if (failure === 'lookup') throw new Error('synthetic lookup failure');
      return {};
    };
    f.p.readAccessories = () => {
      throw new Error('synthetic construction failure');
    };
    f.b.configureAccessories = () => {
      retries++;
    };
    const initialization = f.b.initHub(f.p);
    assert.equal(f.b.initHub(f.p), initialization);
    await initialization;
    assert.equal(connections, 1);
    assert.equal(f.b.numberAttemps, 1);
    assert.ok(f.logs.some((x) => x.includes('Error retrieving info')));
    t.mock.timers.tick(5000);
    await flush();
    assert.equal(retries, 1);
    assert.equal(connections, 1);
  });
}

test('shutdown prevents retry and accessory construction after a pending startup resolves', async (t) => {
  const f = fixture(t, false),
    pending = deferred();
  let built = 0,
    retries = 0;
  f.b.harmony.connect = async () => {};
  f.b.harmony.getConfig = () => pending.promise;
  f.b.harmony.close = () => false;
  f.p.readAccessories = () => {
    built++;
  };
  f.b.configureAccessories = () => {
    retries++;
  };
  const startup = f.b.initHub(f.p);
  await flush();
  f.main.api.emit('shutdown');
  pending.resolve(structuredClone(data));
  await startup;
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(built, 0);
  assert.equal(retries, 0);
});

test('shutdown clears an already scheduled initialization retry', async (t) => {
  const f = fixture(t, false);
  let retries = 0;
  f.b.harmony.connect = async () => {
    throw new Error('offline');
  };
  f.b.harmony.close = () => false;
  f.b.configureAccessories = () => {
    retries++;
  };
  await f.b.initHub(f.p);
  f.main.api.emit('shutdown');
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(retries, 0);
});

test('shutdown does not send a config request after an in-flight connection opens', async (t) => {
  const f = fixture(t, false),
    pending = deferred();
  let reads = 0;
  f.b.harmony.connect = () => pending.promise;
  f.b.harmony.getConfig = async () => {
    reads++;
    return data;
  };
  f.b.harmony.close = () => false;
  const startup = f.b.initHub(f.p);
  await flush();
  f.main.api.emit('shutdown');
  pending.resolve();
  await startup;
  assert.equal(reads, 0);
});

test('a socket closing during otherwise successful startup still reconnects', async (t) => {
  const f = fixture(t, false);
  let connections = 0;
  f.b.configureHarmonyAPI(f.p);
  f.b.harmony.connect = async () => {
    connections++;
  };
  f.b.harmony.getConfig = async () => {
    f.b.harmony.emit('close');
    return structuredClone(data);
  };
  f.b.harmony.isOpened = () => false;
  f.b.getHomeControlsAccessories = async () => ({});
  f.p.readAccessories = () => {};
  f.b.refreshCurrentActivity = () => {};
  await f.b.initHub(f.p);
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(connections, 2);
});

function transport(t) {
  const require = createRequire(import.meta.url);
  const transportRequire = createRequire(require.resolve('harmony-websocket'));
  const WSP = transportRequire('websocket-as-promised');
  t.mock.method(WSP.prototype, 'open', async () => {});
  t.mock.method(WSP.prototype, 'sendPacked', () => {});
  const client = new HarmonyClient();
  client._heartbeat = () => {};
  client._ip = '192.0.2.10';
  client._domain = 'example.invalid';
  client._remoteId = 'synthetic';
  return client;
}

test('configured timeout rejects and releases all unanswered transport requests', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const client = transport(t);
  client.sendTimeout = 25;
  await client._connect();
  const requests = Array.from({length: 30}, () =>
    assert.rejects(client.sendCommand('synthetic'), /timeout/)
  );
  await flush();
  assert.equal(client._client._requests._items.size, 30);
  t.mock.timers.tick(25);
  await Promise.all(requests);
  assert.equal(client._client._requests._items.size, 0);
  client.sendTimeout = 50;
  await client._connect();
  assert.equal(client._client._options.timeout, 50);
});

test('a normal transport acknowledgement resolves and releases its request', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const client = transport(t);
  client.sendTimeout = 25;
  await client._connect();
  client._client.sendPacked = (payload) =>
    client._client._requests.resolve(payload.hbus.id, {code: 200});
  assert.deepEqual(await client.sendCommand('synthetic'), {code: 200});
  assert.equal(client._client._requests._items.size, 0);
});

test('invalid transport timeout cannot silently disable request expiration', async (t) => {
  const client = transport(t);
  for (const value of [0, -1, NaN, Infinity, 'invalid']) {
    client.sendTimeout = value;
    await client._connect();
    assert.equal(client._client._options.timeout, 30000);
  }
});

test('access-control changes log protection status without logging the password', (t) => {
  const f = fixture(t, false);
  const a = new PlatformAccessory('Access', hap.uuid.generate('access'));
  t.mock.method(hap.AccessControlManagement.prototype, 'on', function (event, handler) {
    if (event === hap.AccessControlEvent.PASSWORD_SETTING_UPDATED)
      handler('synthetic-secret-marker', true);
    return this;
  });
  f.p.configureAccessControlService(a);
  assert.ok(f.logs.some((line) => line.includes('Password required')));
  assert.ok(!f.logs.some((line) => line.includes('synthetic-secret-marker')));
});

const controls = [
  ['navigation', Service.Television, C.RemoteKey, C.RemoteKey.ARROW_UP],
  ['playback', Service.Television, C.RemoteKey, C.RemoteKey.PLAY_PAUSE],
  ['mute', Service.TelevisionSpeaker, C.Mute, true],
  ['settings', Service.Television, C.PowerModeSelection, 0],
  ['legacy native volume', Service.TelevisionSpeaker, C.VolumeSelector, 0],
];
for (const [name, service, characteristic, value] of controls) {
  test(`${name} waits for command acknowledgement and reports transport rejection`, async (t) => {
    const f = fixture(t),
      pending = deferred();
    let settled = false;
    f.b.harmony.sendCommand = () => pending.promise;
    const write = f.accessory
      .getService(service)
      .getCharacteristic(characteristic)
      .handleSetRequest(value);
    write.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    const rejected = assert.rejects(write);
    await flush();
    assert.equal(settled, false);
    pending.reject(new Error('synthetic transport rejection'));
    await rejected;
  });
}

test('a rejected or missing command response reaches HomeKit', async (t) => {
  const f = fixture(t),
    remote = f.p.mainService.getCharacteristic(C.RemoteKey);
  for (const response of [undefined, {}, {code: 500}]) {
    f.b.harmony.sendCommand = async () => response;
    await assert.rejects(remote.handleSetRequest(C.RemoteKey.ARROW_UP));
  }
});

test('a failed Play command does not advance alternating playback state', async (t) => {
  const f = fixture(t);
  f.p.playPauseBehavior = true;
  f.b.harmony.sendCommand = async () => {
    throw new Error('offline');
  };
  await assert.rejects(
    f.p.mainService.getCharacteristic(C.RemoteKey).handleSetRequest(C.RemoteKey.PLAY_PAUSE)
  );
  assert.equal(f.p.playStatus['100'], undefined);
});

test('remote macros wait for acknowledgements, preserve delays and stop at failure', async (t) => {
  const f = fixture(t),
    first = deferred(),
    sent = [];
  f.b.harmony.sendCommand = (command) => {
    sent.push(command);
    return sent.length === 1 ? first.promise : Promise.reject(new Error('failed second command'));
  };
  f.p.keysMap[C.RemoteKey.ARROW_UP] = ['one|100', 'two|100', 'three'];
  const write = f.p.mainService
    .getCharacteristic(C.RemoteKey)
    .handleSetRequest(C.RemoteKey.ARROW_UP);
  const rejected = assert.rejects(write);
  await flush();
  assert.deepEqual(sent, ['one']);
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(sent, ['one']);
  first.resolve({code: 200});
  await flush();
  t.mock.timers.tick(99);
  await flush();
  assert.deepEqual(sent, ['one']);
  t.mock.timers.tick(1);
  await rejected;
  assert.deepEqual(sent, ['one', 'two']);
});

test('a timed-out remote macro cannot send its next command after a late acknowledgement', async (t) => {
  const f = fixture(t),
    pending = deferred(),
    sent = [];
  f.b.harmony.sendCommand = (command) => {
    sent.push(command);
    return pending.promise;
  };
  f.p.keysMap[C.RemoteKey.ARROW_UP] = ['one', 'two'];
  const rejected = assert.rejects(
    f.p.mainService.getCharacteristic(C.RemoteKey).handleSetRequest(C.RemoteKey.ARROW_UP)
  );
  await flush();
  t.mock.timers.tick(6000);
  await rejected;
  pending.resolve({code: 200});
  await flush();
  assert.deepEqual(sent, ['one']);
});

test('command repeats stop after a failure and reject unbounded counts', async (t) => {
  const f = fixture(t),
    sent = [];
  f.b.harmony.sendCommand = async (command) => {
    sent.push(command);
    throw new Error('offline');
  };
  await assert.rejects(f.b.sendCommand(f.p, 'one|3'));
  await assert.rejects(f.b.sendCommand(f.p, 'one|1000000'));
  assert.deepEqual(sent, ['one']);
});

for (const [name, characteristic, value] of [
  ['power off', C.Active, 0],
  ['input selection', C.ActiveIdentifier, 1],
]) {
  test(`${name} awaits the activity response and reports rejection`, async (t) => {
    const f = fixture(t),
      pending = deferred();
    let settled = false;
    f.b.harmony.startActivity = () => pending.promise;
    const write = f.p.mainService.getCharacteristic(characteristic).handleSetRequest(value);
    write.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    const rejected = assert.rejects(write);
    await flush();
    assert.equal(settled, false);
    pending.reject(new Error('activity failed'));
    await rejected;
    assert.equal(f.p._currentActivity, '100');
  });
}

test('power on waits through the input-selection delay and propagates rejection', async (t) => {
  const f = fixture(t);
  f.p.refreshCurrentActivityOnSubPlatform('-1');
  f.b.harmony.startActivity = async () => {
    throw new Error('activity failed');
  };
  const rejected = assert.rejects(f.p.mainService.getCharacteristic(C.Active).handleSetRequest(1));
  await flush();
  t.mock.timers.tick(500);
  await rejected;
});

test('simultaneous power-on and input writes send one activity and both report its failure', async (t) => {
  const f = fixture(t),
    pending = deferred(),
    sent = [];
  f.p.refreshCurrentActivityOnSubPlatform('-1');
  f.b.harmony.startActivity = (id) => {
    sent.push(id);
    return pending.promise;
  };
  const active = assert.rejects(f.p.mainService.getCharacteristic(C.Active).handleSetRequest(1));
  const input = assert.rejects(
    f.p.mainService.getCharacteristic(C.ActiveIdentifier).handleSetRequest(1)
  );
  await flush();
  t.mock.timers.tick(500);
  await flush();
  pending.reject(new Error('activity failed'));
  await Promise.all([active, input]);
  assert.deepEqual(sent, ['100']);
});

test('busy activity responses retry within the write budget and stop after success', async (t) => {
  const f = fixture(t),
    sent = [];
  f.b.harmony.startActivity = async (id) => {
    sent.push(id);
    return sent.length === 1 ? {code: 202} : {code: 200, msg: 'OK'};
  };
  const write = f.p.mainService.getCharacteristic(C.Active).handleSetRequest(0);
  await flush();
  assert.deepEqual(sent, ['-1']);
  t.mock.timers.tick(2000);
  await write;
  assert.deepEqual(sent, ['-1', '-1']);
  assert.equal(f.p._currentActivity, '-1');
});

test('busy activity retries expire and do not continue in the background', async (t) => {
  const f = fixture(t),
    sent = [];
  f.b.harmony.startActivity = async (id) => {
    sent.push(id);
    return {code: 202};
  };
  const rejected = assert.rejects(f.p.mainService.getCharacteristic(C.Active).handleSetRequest(0));
  await flush();
  for (let n = 0; n < 3; n++) {
    t.mock.timers.tick(2000);
    await flush();
  }
  await rejected;
  const count = sent.length;
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(sent.length, count);
});

test('invalid input identifiers cannot power off the TV', async (t) => {
  const f = fixture(t);
  let calls = 0;
  f.b.harmony.startActivity = async () => {
    calls++;
    return {code: 200, msg: 'OK'};
  };
  await assert.rejects(f.p.mainService.getCharacteristic(C.ActiveIdentifier).handleSetRequest(99));
  assert.equal(calls, 0);
});

test('expired command budgets reject before dispatch', async (t) => {
  fixture(t);
  let sent = false;
  await assert.rejects(
    HarmonyTools.withDeadline(() => {
      sent = true;
    }, Date.now())
  );
  assert.equal(sent, false);
});
