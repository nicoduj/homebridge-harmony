import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import * as hap from '@homebridge/hap-nodejs';
import {HarmonyPlatform} from '../harmonyPlatform.js';

const {Accessory, Categories, Characteristic: C, Service} = hap;
class PlatformAccessory extends Accessory {
  constructor(...args) {
    super(...args);
    this.context = {};
  }
}
const action = (command) => JSON.stringify({command, deviceId: 'bedroom-tv', type: 'IRCommand'});
const data = {
  data: {
    activity: [
      {
        id: '100',
        label: 'Watch Apple TV',
        controlGroup: [
          {
            name: 'NavigationBasic',
            function: [
              'DirectionUp',
              'DirectionDown',
              'DirectionLeft',
              'DirectionRight',
              'Select',
            ].map((name) => ({name, action: action(name)})),
          },
          {
            name: 'NavigationDVD',
            function: ['Back', 'Menu'].map((name) => ({name, action: action(name)})),
          },
          {name: 'GameType3', function: [{name: 'Home', action: action('Home')}]},
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
      {id: '-1', label: 'PowerOff', controlGroup: []},
    ],
    device: [],
    sequence: [],
  },
};

function fixture(t, enabled = true) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const storage = mkdtempSync(join(tmpdir(), 'harmony-volume-test-'));
  t.after(() => rmSync(storage, {recursive: true, force: true}));
  const log = () => {};
  log.debug = log;
  const published = [];
  const api = Object.assign(new EventEmitter(), {
    hap,
    platformAccessory: PlatformAccessory,
    user: {storagePath: () => storage},
    publishExternalAccessories: (_plugin, accessories) => published.push(...accessories),
    registerPlatformAccessories: () => {},
    unregisterPlatformAccessories: () => {},
  });
  const main = new HarmonyPlatform(
    log,
    {
      name: 'Bedroom',
      mainActivity: 'Watch Apple TV',
      publishAllTVAsExternalAccessory: true,
      publishGeneralVolumeSlider: true,
      linkVolumeControlToTV: true,
      relativeVolumeControl: enabled,
    },
    api
  );
  const p = main.platforms[0];
  const sent = [];
  p.harmonyBase.harmony.isOpened = () => true;
  p.harmonyBase.harmony.getCurrentActivity = async () => '100';
  p.harmonyBase.harmony.sendCommand = async (command) => {
    sent.push(JSON.parse(command).command);
    return {code: 200};
  };
  p.readAccessories(data, {});
  p._currentActivity = '100';
  p.updateCurrentInputService();
  const accessory = published[0];
  const slider = accessory.getService(Service.Lightbulb);
  const speaker = accessory.getService(Service.TelevisionSpeaker);
  const volume = slider.getCharacteristic(C.Brightness);
  const selector = speaker.getCharacteristic(C.VolumeSelector);
  return {p, main, accessory, slider, speaker, volume, selector, sent};
}

test('relative controls preserve TV category and combined TV/input/speaker/slider', (t) => {
  const f = fixture(t);
  assert.equal(f.accessory.category, Categories.TELEVISION);
  const tv = f.accessory.getService(Service.Television);
  assert.ok(tv.linkedServices.includes(f.speaker));
  assert.ok(tv.linkedServices.includes(f.accessory.getService(Service.InputSource)));
  assert.ok(f.slider);
  assert.equal(
    f.speaker.getCharacteristic(C.VolumeControlType).value,
    C.VolumeControlType.RELATIVE
  );
  assert.equal(
    f.speaker.characteristics.some((c) => c.UUID === C.Volume.UUID),
    false
  );
  assert.equal(f.p.mainActivityId, '100');
});

test('other hubs retain legacy volume behavior unless explicitly enabled', (t) => {
  const f = fixture(t, false);
  assert.equal(
    f.speaker.getCharacteristic(C.VolumeControlType).value,
    C.VolumeControlType.ABSOLUTE
  );
  assert.ok(f.speaker.characteristics.some((c) => c.UUID === C.Volume.UUID));
  assert.equal(f.p.volumeControl, undefined);
});

test('native volume up/down await real command acceptance', async (t) => {
  const f = fixture(t);
  await f.selector.handleSetRequest(C.VolumeSelector.INCREMENT);
  await f.selector.handleSetRequest(C.VolumeSelector.DECREMENT);
  assert.deepEqual(f.sent, ['VolumeUp', 'VolumeDown']);
});

test('successive slider positions send only additional movement and recenter', async (t) => {
  const f = fixture(t);
  await Promise.all([55, 60, 65].map((value) => f.volume.handleSetRequest(value)));
  assert.deepEqual(f.sent, ['VolumeUp', 'VolumeUp', 'VolumeUp']);
  assert.equal(await f.volume.handleGetRequest(), 65);
  t.mock.timers.tick(501);
  assert.equal(f.volume.value, 50);
  assert.equal(await f.volume.handleGetRequest(), 50);
  await f.volume.handleSetRequest(55);
  assert.equal(f.sent.length, 4);
});

test('duplicate positions, midpoint and tiny movements do not send spurious commands', async (t) => {
  const f = fixture(t);
  for (const value of [50, 51, 49, 50]) await f.volume.handleSetRequest(value);
  assert.equal(f.sent.length, 0);
  for (const value of [55, 55, 55]) await f.volume.handleSetRequest(value);
  assert.deepEqual(f.sent, ['VolumeUp']);
});

test('slider reversal sends the measured downward correction', async (t) => {
  const f = fixture(t);
  await f.volume.handleSetRequest(65);
  await f.volume.handleSetRequest(55);
  assert.deepEqual(f.sent, ['VolumeUp', 'VolumeUp', 'VolumeUp', 'VolumeDown', 'VolumeDown']);
});

test('no commands are sent while off, disconnected or unmapped', async (t) => {
  const f = fixture(t);
  f.p._currentActivity = '-1';
  await assert.rejects(f.selector.handleSetRequest(0));
  await assert.rejects(f.volume.handleSetRequest(55));
  assert.equal(await f.volume.handleGetRequest(), 0);
  f.p._currentActivity = '100';
  f.p.harmonyBase.harmony.isOpened = () => false;
  await assert.rejects(f.selector.handleSetRequest(0));
  f.p.harmonyBase.harmony.isOpened = () => true;
  delete f.p._currentInputService.VolumeUpCommand;
  await assert.rejects(f.selector.handleSetRequest(0));
  assert.deepEqual(f.sent, []);
});

test('command failures reach HomeKit instead of returning false success', async (t) => {
  const f = fixture(t);
  f.p.harmonyBase.harmony.sendCommand = async () => {
    throw Error('offline');
  };
  await assert.rejects(f.selector.handleSetRequest(0));
  await assert.rejects(f.volume.handleSetRequest(55));
  assert.equal(f.p.volumeControl.pending, 0);
  f.p.harmonyBase.harmony.sendCommand = async () => ({code: 500});
  await assert.rejects(f.selector.handleSetRequest(0));
});

test('queued commands stop if the active activity changes', async (t) => {
  const f = fixture(t);
  let release;
  f.p.harmonyBase.harmony.sendCommand = (command) => {
    f.sent.push(JSON.parse(command).command);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const operation = f.p.volumeControl.step(3);
  await Promise.resolve();
  f.p._currentActivity = '-1';
  release({code: 200});
  await assert.rejects(operation);
  assert.deepEqual(f.sent, ['VolumeUp']);
});

test('volume command overrides apply to both the remote and linked slider', async (t) => {
  const f = fixture(t);
  f.p.remoteOverrideCommandsList = {'Watch Apple TV': {VOLUME_UP: 'Receiver;VolumeUp'}};
  f.p.harmonyBase.deviceCommands = {['Receiver,VolumeUp']: action('ReceiverUp')};
  await f.selector.handleSetRequest(0);
  await f.volume.handleSetRequest(55);
  assert.deepEqual(f.sent, ['ReceiverUp', 'ReceiverUp']);
});

test('invalid values and excessive queue sizes are rejected', async (t) => {
  const f = fixture(t);
  for (const value of [NaN, -1, 101, 55.5]) {
    await assert.rejects(f.p.volumeControl.setSlider(f.slider, value));
  }
  f.p.volumeControl.pending = 20;
  await assert.rejects(f.p.volumeControl.step(1));
  assert.deepEqual(f.sent, []);
});

test('cached accessory and services are reused when enabling relative volume', (t) => {
  const f = fixture(t);
  f.speaker.addCharacteristic(C.Volume);
  const cached = Accessory.deserialize(Accessory.serialize(f.accessory));
  cached.context = {...f.accessory.context};
  const services = [...cached.services];
  f.main.configureAccessory(cached);
  f.p.readAccessories(data, {});
  assert.equal(f.p.TVFoundAccessory, cached);
  assert.deepEqual(cached.services, services);
  const speaker = cached.getService(Service.TelevisionSpeaker);
  assert.equal(
    speaker.characteristics.some((c) => c.UUID === C.Volume.UUID),
    false
  );
  assert.equal(speaker.getCharacteristic(C.VolumeControlType).value, C.VolumeControlType.RELATIVE);
});

test('an unacknowledged command times out and cancels queued volume work', async (t) => {
  const f = fixture(t);
  f.p.harmonyBase.harmony.sendCommand = (command) => {
    f.sent.push(JSON.parse(command).command);
    return new Promise(() => {});
  };
  const first = f.p.volumeControl.step(1);
  const second = f.p.volumeControl.step(1);
  const firstRejected = assert.rejects(first);
  const secondRejected = assert.rejects(second);
  await Promise.resolve();
  t.mock.timers.tick(4001);
  await Promise.all([firstRejected, secondRejected]);
  assert.deepEqual(f.sent, ['VolumeUp']);
  assert.equal(f.p.volumeControl.pending, 0);
});

test('external combined slider receives activity changes without reopening Home', async (t) => {
  const f = fixture(t);
  f.p.refreshCurrentActivityOnSubPlatform('-1');
  assert.equal(f.volume.value, 0);
  assert.equal(f.slider.getCharacteristic(C.On).value, false);
  f.p.refreshCurrentActivityOnSubPlatform('100');
  assert.equal(f.volume.value, 50);
  assert.equal(f.slider.getCharacteristic(C.On).value, true);
  await f.volume.handleSetRequest(60);
  f.p.refreshCurrentActivityOnSubPlatform('100');
  assert.equal(f.volume.value, 60);
  f.p.refreshCurrentActivityOnSubPlatform('-1');
  assert.equal(f.volume.value, 0);
  t.mock.timers.tick(501);
  assert.equal(f.volume.value, 0);
});

test('native Remote routes its D-pad, select, back and info keys to the mapped device commands', async (t) => {
  const f = fixture(t);
  const remote = f.accessory.getService(Service.Television).getCharacteristic(C.RemoteKey);
  for (const key of [
    C.RemoteKey.ARROW_UP,
    C.RemoteKey.ARROW_DOWN,
    C.RemoteKey.ARROW_LEFT,
    C.RemoteKey.ARROW_RIGHT,
    C.RemoteKey.SELECT,
    C.RemoteKey.BACK,
    C.RemoteKey.INFORMATION,
    C.RemoteKey.EXIT,
  ]) {
    await remote.handleSetRequest(key);
  }
  assert.deepEqual(f.sent, [
    'DirectionUp',
    'DirectionDown',
    'DirectionLeft',
    'DirectionRight',
    'Select',
    'Back',
    'Menu',
    'Home',
  ]);
  assert.equal(f.accessory.services.filter((s) => s.UUID === Service.Switch.UUID).length, 0);
});

test('native Remote play/pause sends an ordinary mapped command instead of dropping a string', async (t) => {
  const f = fixture(t);
  const remote = f.accessory.getService(Service.Television).getCharacteristic(C.RemoteKey);
  await remote.handleSetRequest(C.RemoteKey.PLAY_PAUSE);
  assert.deepEqual(f.sent, ['Play']);
});

test('native Remote playback keeps configured macro overrides and alternating pause behaviour', async (t) => {
  const f = fixture(t);
  const remote = f.accessory.getService(Service.Television).getCharacteristic(C.RemoteKey);
  f.p.remoteOverrideCommandsList = {'Watch Apple TV': {PLAY: 'Player;Play'}};
  f.p.harmonyBase.deviceCommands = {['Player,Play']: action('OverridePlay')};
  f.p.updateCurrentInputService();
  await remote.handleSetRequest(C.RemoteKey.PLAY_PAUSE);
  assert.deepEqual(f.sent, ['OverridePlay']);
  f.p.playPauseBehavior = true;
  await remote.handleSetRequest(C.RemoteKey.PLAY_PAUSE);
  assert.deepEqual(f.sent, ['OverridePlay', 'Pause']);
});

test('an unresolved volume override reports unavailable instead of sending the default device command', async (t) => {
  const f = fixture(t);
  f.p.remoteOverrideCommandsList = {'Watch Apple TV': {VOLUME_UP: 'Missing;VolumeUp'}};
  f.p.harmonyBase.deviceCommands = {};
  await assert.rejects(f.selector.handleSetRequest(0));
  assert.equal(await f.volume.handleGetRequest(), 0);
  assert.deepEqual(f.sent, []);
});

test('ordinary playback also works when relative volume is disabled', async (t) => {
  const f = fixture(t, false);
  const remote = f.accessory.getService(Service.Television).getCharacteristic(C.RemoteKey);
  await remote.handleSetRequest(C.RemoteKey.PLAY_PAUSE);
  assert.deepEqual(f.sent, ['Play']);
});

test('a full slider reversal sends twenty downward steps as one bounded adjustment', async (t) => {
  const f = fixture(t);
  await f.volume.handleSetRequest(100);
  await f.volume.handleSetRequest(0);
  assert.deepEqual(f.sent, [...Array(10).fill('VolumeUp'), ...Array(20).fill('VolumeDown')]);
  assert.equal(f.p.volumeControl.pending, 0);
});

test('volume override macros preserve their ordering and delay', async (t) => {
  const f = fixture(t);
  f.p.remoteOverrideCommandsList = {'Watch Apple TV': {VOLUME_UP: 'Receiver;First|100;Second'}};
  f.p.harmonyBase.deviceCommands = {
    'Receiver,First': action('First'),
    'Receiver,Second': action('Second'),
  };
  const operation = f.selector.handleSetRequest(0);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.deepEqual(f.sent, ['First']);
  t.mock.timers.tick(99);
  await Promise.resolve();
  assert.deepEqual(f.sent, ['First']);
  t.mock.timers.tick(1);
  await operation;
  assert.deepEqual(f.sent, ['First', 'Second']);
});

test('override-only volume mappings remain available during bridged service refresh', async (t) => {
  const f = fixture(t);
  f.slider.volumeUpCommands = {};
  f.slider.volumeDownCommands = {};
  f.p.remoteOverrideCommandsList = {
    'Watch Apple TV': {VOLUME_UP: 'Receiver;Up', VOLUME_DOWN: 'Receiver;Down'},
  };
  f.p.harmonyBase.deviceCommands = {'Receiver,Up': action('Up'), 'Receiver,Down': action('Down')};
  f.p._foundAccessories = [f.accessory];
  f.p.localRefresh();
  assert.equal(f.slider.getCharacteristic(C.On).value, true);
  assert.equal(await f.volume.handleGetRequest(), 50);
  await f.volume.handleSetRequest(55);
  assert.deepEqual(f.sent, ['Up']);
});

test('a disconnect invalidates queued work even if the connection comes back before acknowledgement', async (t) => {
  const f = fixture(t);
  f.p.harmonyBase.configureHarmonyAPI(f.p);
  let release;
  f.p.harmonyBase.harmony.sendCommand = (command) => {
    f.sent.push(JSON.parse(command).command);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const operation = f.p.volumeControl.step(3);
  const rejected = assert.rejects(operation);
  await Promise.resolve();
  f.p.harmonyBase.harmony.emit('close');
  release({code: 200});
  await rejected;
  assert.deepEqual(f.sent, ['VolumeUp']);
});

test('shutdown clears slider reset timers and rejects subsequent volume writes', async (t) => {
  const f = fixture(t);
  let closed = false;
  f.p.harmonyBase.harmony.close = () => {
    closed = true;
  };
  await f.volume.handleSetRequest(55);
  f.main.api.emit('shutdown');
  assert.equal(closed, true);
  assert.equal(f.p.volumeControl.sliders.size, 0);
  t.mock.timers.tick(501);
  assert.equal(f.volume.value, 55);
  await assert.rejects(f.selector.handleSetRequest(0));
  assert.deepEqual(f.sent, ['VolumeUp']);
});

test('volume writes require a successful hub response', async (t) => {
  const f = fixture(t);
  for (const response of [undefined, {}, {code: 100}, {code: 500}]) {
    f.p.harmonyBase.harmony.sendCommand = async () => response;
    await assert.rejects(f.selector.handleSetRequest(0));
  }
  assert.equal(f.p.volumeControl.pending, 0);
});

test('rapid button writes apply backpressure and drain without an unbounded volume burst', async (t) => {
  const f = fixture(t);
  let release;
  f.p.harmonyBase.harmony.sendCommand = (command) => {
    f.sent.push(JSON.parse(command).command);
    return f.sent.length === 1
      ? new Promise((resolve) => {
          release = resolve;
        })
      : Promise.resolve({code: 200});
  };
  const requests = Array.from({length: 100}, () => f.selector.handleSetRequest(0));
  const settled = Promise.allSettled(requests);
  await Promise.resolve();
  assert.equal(f.p.volumeControl.pending, 20);
  release({code: 200});
  const results = await settled;
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 20);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 80);
  assert.equal(f.sent.length, 20);
  assert.equal(f.p.volumeControl.pending, 0);
});

test(
  'a quick activity change away and back still cancels the old volume burst',
  {timeout: 1000},
  async (t) => {
    const f = fixture(t);
    let release;
    f.p.harmonyBase.harmony.sendCommand = (command) => {
      f.sent.push(JSON.parse(command).command);
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const operation = f.p.volumeControl.step(3);
    const rejected = assert.rejects(operation);
    await Promise.resolve();
    f.p.refreshCurrentActivityOnSubPlatform('-1');
    f.p.refreshCurrentActivityOnSubPlatform('100');
    release({code: 200});
    await rejected;
    assert.deepEqual(f.sent, ['VolumeUp']);
  }
);

test(
  'a slow burst stops within one HomeKit request budget, even when each command responds',
  {timeout: 1000},
  async (t) => {
    const f = fixture(t);
    f.p.harmonyBase.harmony.sendCommand = (command) => {
      f.sent.push(JSON.parse(command).command);
      return new Promise((resolve) => setTimeout(() => resolve({code: 200}), 3500));
    };
    const operation = f.p.volumeControl.step(3);
    const rejected = assert.rejects(operation);
    await Promise.resolve();
    t.mock.timers.tick(3500);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    t.mock.timers.tick(2501);
    await rejected;
    assert.deepEqual(f.sent, ['VolumeUp', 'VolumeUp']);
    t.mock.timers.tick(10000);
    assert.equal(f.sent.length, 2);
  }
);
