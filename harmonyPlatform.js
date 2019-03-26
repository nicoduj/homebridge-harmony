const HarmonyPlatformAsSwitches = require('./harmonyAsSwitches')
  .HarmonyPlatformAsSwitches;
const HarmonyPlatformAsTVPlatform = require('./harmonyAsTVPlatform')
  .HarmonyPlatformAsTVPlatform;

module.exports = {
  HarmonyPlatform: HarmonyPlatform,
};

function HarmonyPlatform(log, config, api) {
  log('HarmonyPlatform Init');

  this.log = log;
  this.plaformsConfigs = config['subPlatform'];
  this.cleanCache = config['cleanCache'];
  this.platforms = [];
  this._foundAccessories = [];

  for (let i = 0, len = this.plaformsConfigs.length; i < len; i++) {
    let platformConfig = this.plaformsConfigs[i];
    let TVPlatformMode = platformConfig['TVPlatformMode'];

    if (TVPlatformMode) {
      this.platforms.push(
        new HarmonyPlatformAsTVPlatform(log, platformConfig, api, this)
      );
    } else {
      this.platforms.push(
        new HarmonyPlatformAsSwitches(log, platformConfig, api)
      );
    }
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
