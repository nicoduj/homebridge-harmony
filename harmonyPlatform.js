const HarmonyPlatformAsSwitches = require('./harmonyAsSwitches')
  .HarmonyPlatformAsSwitches;
const HarmonyPlatformAsTVPlatform = require('./harmonyAsTVPlatform')
  .HarmonyPlatformAsTVPlatform;
const HarmonyTools = require('./harmonyTools.js');

module.exports = {
  HarmonyPlatform: HarmonyPlatform,
};

function HarmonyPlatform(log, config, api) {
  log('HarmonyPlatform Init');

  if (!config) {
    log('No configuration found for homebridge-harmonyHub');
    return;
  }

  this.log = log;

  this.plaformsConfigs = [];
  this.plaformsConfigs.push(config);

  if (config['otherPlatforms']) {
    this.plaformsConfigs.push.apply(
      this.plaformsConfigs,
      config['otherPlatforms']
    );
  }

  this.cleanCache = config['cleanCache'];

  this.publishAllTVAsExternalAccessory = HarmonyTools.checkParameter(
    config['publishAllTVAsExternalAccessory'],
    false
  );

  this.platforms = [];
  this._foundAccessories = [];

  for (let i = 0, len = this.plaformsConfigs.length; i < len; i++) {
    let platformConfig = this.plaformsConfigs[i];

    let TVAccessory = HarmonyTools.checkParameter(
      platformConfig['TVAccessory'],
      true
    );
    if (TVAccessory) {
      this.platforms.push(
        new HarmonyPlatformAsTVPlatform(log, platformConfig, api, this)
      );
    }

    this.platforms.push(
      new HarmonyPlatformAsSwitches(log, platformConfig, api)
    );
  }

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object
    this.api = api;

    this.api
      .on(
        'shutdown',
        function() {
          this.log('INFO - shutdown');
          for (let i = 0, len = this.platforms.length; i < len; i++) {
            let platform = this.platforms[i];
            platform.harmonyBase.harmony.removeAllListeners();
            platform.harmonyBase.harmony.end();
          }
        }.bind(this)
      )
      .on(
        'didFinishLaunching',
        function() {
          this.log('DidFinishLaunching');

          if (this.cleanCache) {
            this.log('WARNING - Removing Accessories');
            this.api.unregisterPlatformAccessories(
              'homebridge-harmonyHub',
              'HarmonyHubWebSocket',
              this._foundAccessories
            );
            this._foundAccessories = [];

            for (let i = 0, len = this.platforms.length; i < len; i++) {
              let platform = this.platforms[i];
              platform._foundAccessories = [];
            }
          }

          for (let i = 0, len = this.platforms.length; i < len; i++) {
            let platform = this.platforms[i];
            platform.harmonyBase.configureAccessories(platform);
          }
        }.bind(this)
      );
  }
}

HarmonyPlatform.prototype = {
  configureAccessory: function(accessory) {
    let platformName = accessory.context.subPlatformName;
    let platform = this.platforms.find(x => x.name == platformName);

    this.log.debug(
      accessory.displayName,
      'Got cached Accessory ' + accessory.UUID + ' for ' + platform.name
    );
    this._foundAccessories.push(accessory);
    platform._foundAccessories.push(accessory);
  },
};
