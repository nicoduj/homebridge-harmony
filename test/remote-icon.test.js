import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import * as hap from '@homebridge/hap-nodejs';
import {HarmonyPlatform} from '../harmonyPlatform.js';

const {Accessory, Categories, Characteristic, Service} = hap;

// Homebridge's platform accessory exposes these HAP methods plus plugin context.
class PlatformAccessory extends Accessory {
  constructor(...args) {
    super(...args);
    this.context = {};
  }
}

function fixture(t, config = {}) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const storage = mkdtempSync(join(tmpdir(), 'harmony-icon-'));
  t.after(() => rmSync(storage, {recursive: true, force: true}));
  const log = () => {};
  log.debug = log;
  const published = [];
  const registered = [];
  const removed = [];
  const api = Object.assign(new EventEmitter(), {
    hap,
    platformAccessory: PlatformAccessory,
    user: {storagePath: () => storage},
    publishExternalAccessories: (_plugin, accessories) => published.push(...accessories),
    registerPlatformAccessories: (_plugin, _platform, accessories) =>
      registered.push(...accessories),
    unregisterPlatformAccessories: (_plugin, _platform, accessories) =>
      removed.push(...accessories),
  });
  const main = new HarmonyPlatform(log, {name: 'Test Hub', ...config}, api);
  return {main, platform: main.platforms[0], api, log, published, registered, removed};
}

function data() {
  return {
    data: {
      activity: [
        {
          id: '100',
          label: 'Watch TV',
          controlGroup: [
            {
              name: 'Volume',
              function: [
                {name: 'VolumeUp', action: 'test-volume-up'},
                {name: 'VolumeDown', action: 'test-volume-down'},
                {name: 'Mute', action: 'test-mute'},
              ],
            },
          ],
        },
      ],
      device: [],
      sequence: [],
    },
  };
}

const combined = {publishGeneralVolumeSlider: true, linkVolumeControlToTV: true};

for (const [label, config, category] of [
  ['default', {}, Categories.TELEVISION],
  ['legacy receiver', {ReceiverIcon: true}, Categories.AUDIO_RECEIVER],
  ['remote', {RemoteIcon: true}, Categories.TARGET_CONTROLLER],
  ['remote takes precedence', {RemoteIcon: true, ReceiverIcon: true}, Categories.TARGET_CONTROLLER],
  ['remote disabled', {RemoteIcon: false, ReceiverIcon: true}, Categories.AUDIO_RECEIVER],
]) {
  test(`${label}: publishes one external TV with the requested category`, (t) => {
    const f = fixture(t, config);
    f.platform.readAccessories(data(), {});
    assert.equal(f.published.length, 1);
    assert.equal(f.published[0].category, category);
    assert.equal(
      f.published[0].getService(Service.Television).isPrimaryService,
      !!config.RemoteIcon
    );
    assert.equal(f.registered.length, 0);
    assert.equal(f.removed.length, 0);
  });
}

test('remote keeps TV, input, speaker and volume slider in one accessory', (t) => {
  const f = fixture(t, {RemoteIcon: true, ...combined});
  f.platform.readAccessories(data(), {});
  assert.equal(f.published.length, 1);
  assert.equal(f.registered.length, 0);
  const accessory = f.published[0];
  const tv = accessory.getService(Service.Television);
  const slider = accessory.getService(Service.Lightbulb);
  assert.ok(tv.isPrimaryService);
  assert.ok(!slider.isPrimaryService);
  assert.ok(tv.linkedServices.includes(accessory.getService(Service.InputSource)));
  assert.ok(tv.linkedServices.includes(accessory.getService(Service.TelevisionSpeaker)));
  assert.equal(slider.volumeUpCommands['100'], 'test-volume-up');
  assert.equal(slider.volumeDownCommands['100'], 'test-volume-down');
  assert.equal(slider.getCharacteristic(Characteristic.Brightness).listenerCount('set'), 1);
  assert.equal(tv.getCharacteristic(Characteristic.RemoteKey).listenerCount('set'), 1);
  const saved = Accessory.serialize(accessory);
  const restored = Accessory.deserialize(saved);
  assert.equal(restored.category, Categories.TARGET_CONTROLLER);
  assert.ok(restored.getService(Service.Television).isPrimaryService);
  assert.ok(restored.getService(Service.Lightbulb));
});

test('unlinked slider stays separate when remote is enabled', (t) => {
  const f = fixture(t, {RemoteIcon: true, publishGeneralVolumeSlider: true});
  f.platform.readAccessories(data(), {});
  assert.equal(f.published.length, 1);
  assert.equal(f.registered.length, 1);
  assert.equal(f.published[0].getService(Service.Lightbulb), undefined);
  assert.ok(f.registered[0].getService(Service.Lightbulb));
});

test('cached combined TV changes category in place without migration or service replacement', (t) => {
  const f = fixture(t, {ReceiverIcon: true, publishAllTVAsExternalAccessory: false, ...combined});
  f.platform.readAccessories(data(), {});
  // Restart through the real HAP cache serializer, as Homebridge does.
  const accessory = Accessory.deserialize(Accessory.serialize(f.registered[0]));
  accessory.context = {...f.registered[0].context};
  const uuid = accessory.UUID;
  const services = [...accessory.services];
  // Even enabling external publication must not silently migrate a cached accessory.
  const restarted = new HarmonyPlatform(
    f.log,
    {
      name: 'Test Hub',
      ReceiverIcon: true,
      RemoteIcon: true,
      publishAllTVAsExternalAccessory: true,
      ...combined,
    },
    f.api
  );
  restarted.configureAccessory(accessory);
  const platform = restarted.platforms[0];
  platform.readAccessories(data(), {});
  assert.equal(platform.TVFoundAccessory, accessory);
  assert.equal(accessory.UUID, uuid);
  assert.equal(accessory.category, Categories.TARGET_CONTROLLER);
  assert.deepEqual(accessory.services, services);
  assert.equal(f.published.length, 0);
  assert.equal(f.registered.length, 1);
  assert.equal(f.removed.length, 0);
  assert.equal(
    accessory
      .getService(Service.Television)
      .getCharacteristic(Characteristic.RemoteKey)
      .listenerCount('set'),
    1
  );
  assert.equal(
    accessory
      .getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.Brightness)
      .listenerCount('set'),
    1
  );
  platform.remoteIcon = false;
  platform.readTVAccessories(data());
  assert.equal(accessory.category, Categories.AUDIO_RECEIVER);
  assert.equal(accessory.getService(Service.Television).isPrimaryService, false);
  assert.deepEqual(accessory.services, services);
});

test('cached remote counts as the bridged TV so the next hub is external', (t) => {
  const f = fixture(t, {
    RemoteIcon: true,
    publishAllTVAsExternalAccessory: false,
    ...combined,
    otherPlatforms: [{name: 'Second Hub', ReceiverIcon: true}],
  });
  const [accessory] = f.platform.readTVAccessories(data());
  f.main.configureAccessory(accessory);
  assert.equal(f.main._oneTVAdded, true);
  f.platform.readAccessories(data(), {});
  f.main.platforms[1].readAccessories(data(), {});
  assert.equal(f.published.length, 1);
  assert.equal(f.published[0].category, Categories.AUDIO_RECEIVER);
  assert.equal(f.registered.length, 0);
  assert.equal(f.removed.length, 0);
  assert.ok(accessory.getService(Service.Lightbulb));
});

test('per-hub remote setting does not affect another hub or ordinary switches', (t) => {
  const f = fixture(t, {
    ReceiverIcon: true,
    otherPlatforms: [{name: 'Second Hub', RemoteIcon: true, ...combined}],
  });
  f.platform.readAccessories(data(), {});
  f.main.platforms[1].readAccessories(data(), {});
  assert.deepEqual(
    f.published.map((a) => a.category),
    [Categories.AUDIO_RECEIVER, Categories.TARGET_CONTROLLER]
  );
  assert.ok(f.published[1].getService(Service.Lightbulb));
  const ordinary = new PlatformAccessory('Test Switch', hap.uuid.generate('Test Switch'));
  ordinary.category = Categories.SWITCH;
  ordinary.context.subPlatformName = f.platform.name;
  f.main.configureAccessory(ordinary);
  assert.equal(f.main._oneTVAdded, undefined);
});

test('cached TV with the default Homebridge category still reserves the bridged TV slot', (t) => {
  const f = fixture(t, {
    publishAllTVAsExternalAccessory: false,
    ...combined,
    otherPlatforms: [{name: 'Second Hub', RemoteIcon: true, ...combined}],
  });
  const [accessory] = f.platform.readTVAccessories(data());
  // Homebridge caches its underlying HAP category, which can remain OTHER
  // even after the plugin changes PlatformAccessory.category.
  accessory.category = Categories.OTHER;
  f.main.configureAccessory(accessory);
  assert.equal(f.main._oneTVAdded, true);
  f.platform.readAccessories(data(), {});
  f.main.platforms[1].readAccessories(data(), {});
  assert.equal(f.published.length, 1);
  assert.equal(f.published[0].category, Categories.TARGET_CONTROLLER);
  assert.ok(f.published[0].getService(Service.Lightbulb));
  assert.equal(f.platform.TVFoundAccessory, accessory);
  assert.equal(f.registered.length, 0);
  assert.equal(f.removed.length, 0);
});

test('ordinary cached accessories with the default category do not reserve the TV slot', (t) => {
  const f = fixture(t, {publishAllTVAsExternalAccessory: false});
  const accessory = new PlatformAccessory('Test Switch', hap.uuid.generate('Test Switch'));
  accessory.category = Categories.OTHER;
  accessory.context.subPlatformName = f.platform.name;
  accessory.addService(Service.Switch);
  f.main.configureAccessory(accessory);
  assert.equal(f.main._oneTVAdded, undefined);
});

test('both configuration forms expose the opt-in setting', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8')
  );
  const properties = schema.schema.properties;
  assert.equal(properties.RemoteIcon.default, false);
  assert.equal(properties.otherPlatforms.items.properties.RemoteIcon.default, false);
  const keys = [];
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.key) keys.push(value.key);
    for (const child of Object.values(value)) collect(child);
  }
  collect(schema.layout);
  assert.ok(keys.includes('RemoteIcon'));
  assert.ok(keys.includes('otherPlatforms[].RemoteIcon'));
});
