import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import * as hap from '@homebridge/hap-nodejs';
import {HarmonyPlatform} from '../harmonyPlatform.js';

const {Accessory, Categories, Characteristic, Service} = hap;

class PlatformAccessory extends Accessory {
  constructor(...args) {
    super(...args);
    this.context = {};
  }
}

const combined = {publishGeneralVolumeSlider: true, linkVolumeControlToTV: true};
const data = {
  data: {
    activity: [{id: '100', label: 'Watch TV', controlGroup: []}],
    device: [],
    sequence: [],
  },
};

function fixture(t, config = {}) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const storage = mkdtempSync(join(tmpdir(), 'harmony-tv-'));
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
  const main = new HarmonyPlatform(
    log,
    {
      name: 'Existing Hub',
      publishAllTVAsExternalAccessory: false,
      ...combined,
      otherPlatforms: [{name: 'Additional Hub', ...combined}],
      ...config,
    },
    api
  );
  return {main, published, registered, removed};
}

function cachedTV(platform) {
  const [accessory] = platform.readTVAccessories(data);
  platform.harmonyBase.getGeneralVolumeSliderAccessory(platform, data);
  const saved = Accessory.serialize(accessory);
  // Homebridge's PlatformAccessory can serialize its underlying HAP category
  // as OTHER even after the plugin assigns a TV category to the wrapper.
  saved.category = Categories.OTHER;
  const restored = Accessory.deserialize(saved);
  restored.context = {...accessory.context};
  return restored;
}

function assertCombined(accessory, category = Categories.TELEVISION) {
  assert.equal(accessory.category, category);
  const tv = accessory.getService(Service.Television);
  const slider = accessory.getService(Service.Lightbulb);
  assert.ok(tv);
  assert.ok(slider);
  assert.ok(tv.linkedServices.includes(accessory.getService(Service.InputSource)));
  assert.ok(tv.linkedServices.includes(accessory.getService(Service.TelevisionSpeaker)));
  assert.equal(tv.getCharacteristic(Characteristic.Active).listenerCount('set'), 1);
  assert.equal(slider.getCharacteristic(Characteristic.Brightness).listenerCount('set'), 1);
}

for (const [label, ReceiverIcon] of [
  ['TV', false],
  ['receiver', true],
]) {
  test(`cached ${label} with category OTHER keeps the additional TV external`, (t) => {
    const f = fixture(t, {ReceiverIcon});
    const existing = cachedTV(f.main.platforms[0]);
    const services = [...existing.services];
    const uuid = existing.UUID;
    f.main.configureAccessory(existing);
    for (const platform of f.main.platforms) platform.readAccessories(data, {});
    assert.equal(f.published.length, 1);
    assert.equal(f.published[0].context.subPlatformName, 'Additional Hub');
    assertCombined(f.published[0]);
    assert.equal(f.main.platforms[0].TVFoundAccessory, existing);
    assert.equal(existing.UUID, uuid);
    assert.deepEqual(existing.services, services);
    assert.equal(f.registered.length, 0);
    assert.equal(f.removed.length, 0);
  });
}

test('a fresh setup keeps the first TV bridged and the additional TV external', (t) => {
  const f = fixture(t);
  for (const platform of f.main.platforms) platform.readAccessories(data, {});
  assert.equal(f.registered.length, 1);
  assert.equal(f.published.length, 1);
  assertCombined(f.registered[0]);
  assertCombined(f.published[0]);
  assert.equal(f.removed.length, 0);
});

test('a cached ordinary switch does not consume the bridged TV slot', (t) => {
  const f = fixture(t, {otherPlatforms: []});
  const accessory = new PlatformAccessory('Unrelated switch', hap.uuid.generate('switch'));
  accessory.category = Categories.OTHER;
  accessory.context.subPlatformName = f.main.platforms[0].name;
  accessory.addService(Service.Switch);
  f.main.configureAccessory(accessory);
  f.main.platforms[0].readAccessories(data, {});
  assert.equal(f.published.length, 0);
  assert.equal(f.registered.length, 1);
  assertCombined(f.registered[0]);
});

test('existing cached TVs are preserved even when external publication is enabled', (t) => {
  const f = fixture(t, {publishAllTVAsExternalAccessory: true});
  const existing = f.main.platforms.map(cachedTV);
  const services = existing.map((a) => [...a.services]);
  for (const accessory of existing) f.main.configureAccessory(accessory);
  for (const platform of f.main.platforms) platform.readAccessories(data, {});
  assert.equal(f.registered.length, 0);
  assert.equal(f.published.length, 0);
  assert.equal(f.removed.length, 0);
  f.main.platforms.forEach((platform, i) => {
    assert.equal(platform.TVFoundAccessory, existing[i]);
    assert.deepEqual(existing[i].services, services[i]);
    assertCombined(existing[i]);
  });
});

test('external-only configuration still publishes TV and receiver categories', (t) => {
  const f = fixture(t, {
    publishAllTVAsExternalAccessory: true,
    otherPlatforms: [{name: 'Additional Hub', ReceiverIcon: true, ...combined}],
  });
  for (const platform of f.main.platforms) platform.readAccessories(data, {});
  assert.equal(f.published.length, 2);
  assertCombined(f.published[0]);
  assertCombined(f.published[1], Categories.AUDIO_RECEIVER);
  assert.equal(f.registered.length, 0);
  assert.equal(f.removed.length, 0);
});
