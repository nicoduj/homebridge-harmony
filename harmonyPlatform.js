var AccessoryType;

const HarmonySubPlatform = require('./harmonySubPlatform').HarmonySubPlatform;
const HarmonyTools = require('./harmonyTools.js');

module.exports = {
  HarmonyPlatform: HarmonyPlatform,
};

function HarmonyPlatform(log, config, api) {
  log('HarmonyPlatform Init');

  AccessoryType = api.hap.Accessory.Categories;

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

    this.platforms.push(new HarmonySubPlatform(log, platformConfig, api, this));
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
            platform.harmonyBase.harmony.close();
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
  //Restore from cache
  configureAccessory: function(accessory) {
    let platformName = accessory.context.subPlatformName;
    let platform = this.platforms.find(x => x.name == platformName);

    if (platform == undefined)
    {
      this.log(
        'WARNING - configureAccessory - The platform ' + platformName + ' is not there anymore in your config (name property). It won\'t be loaded and will be removed from cache.'   
      );

      this.api.unregisterPlatformAccessories(
        'homebridge-harmonyHub',
        'HarmonyHubWebSocket',
        [accessory]
      );
    }
    else
    {
      this.log.debug(
        accessory.displayName,
        'Got cached Accessory ' + accessory.UUID + ' for ' + platform.name
      );
      this._foundAccessories.push(accessory);
      platform._foundAccessories.push(accessory);
  
      if (accessory.category == AccessoryType.TELEVISION) {
        this._oneTVAdded = true;
        this.log(
          'WARNING - configureAccessory - TV accessory added in your bridge from cache, if another plugin is exposing a TV accessory this one might not be visible in your remote widget'
        );
      }
    }


  },
};
