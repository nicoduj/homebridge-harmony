var Service, Characteristic;
const HarmonyConst = require('./harmonyConst');

const Harmony = require('harmony-websocket');

module.exports = {
  HarmonyBase: HarmonyBase,
};

function HarmonyBase(api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  this.harmony = new Harmony();
}

HarmonyBase.prototype = {
  configCommonProperties: function(log, config, api, harmonyPlatform) {
    harmonyPlatform.log = log;
    harmonyPlatform.hubIP = config['hubIP'];

    harmonyPlatform.name = config['name'];
    harmonyPlatform.devMode = config['DEVMODE'];

    harmonyPlatform.addAllActivitiesToSkipedIfSameStateActivitiesList =
      config['addAllActivitiesToSkipedIfSameStateActivitiesList'];
    harmonyPlatform.skipedIfSameStateActivities =
      config['skipedIfSameStateActivities'];

    harmonyPlatform._currentActivity = -9999;
    harmonyPlatform._currentActivityLastUpdate = undefined;
    harmonyPlatform._currentSetAttemps = 0;
    harmonyPlatform._foundAccessories = [];

    harmonyPlatform.log.debug(
      'INFO : following activites controls will be ignored if they are in the same state : ' +
        (harmonyPlatform.addAllActivitiesToSkipedIfSameStateActivitiesList
          ? 'ALL'
          : harmonyPlatform.skipedIfSameStateActivities)
    );

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      harmonyPlatform.api = api;
      harmonyPlatform.api.on(
        'shutdown',
        function() {
          harmonyPlatform.log('shutdown');
          this.harmony.removeAllListeners();
          this.harmony.end();
        }.bind(this)
      );
    }
  },

  getInformationService: function(homebridgeAccessory) {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, homebridgeAccessory.name)
      .setCharacteristic(
        Characteristic.Manufacturer,
        homebridgeAccessory.manufacturer
      )
      .setCharacteristic(Characteristic.Model, homebridgeAccessory.model)
      .setCharacteristic(
        Characteristic.SerialNumber,
        homebridgeAccessory.serialNumber
      );
    return informationService;
  },

  getServices: function(homebridgeAccessory) {
    let services = [];
    let informationService = this.getInformationService(homebridgeAccessory);
    services.push(informationService);
    for (let s = 0; s < homebridgeAccessory.services.length; s++) {
      let service = homebridgeAccessory.services[s];
      for (let i = 0; i < service.characteristics.length; i++) {
        let characteristic = service.controlService.getCharacteristic(
          service.characteristics[i]
        );
        if (characteristic == undefined)
          characteristic = service.controlService.addCharacteristic(
            service.characteristics[i]
          );
        homebridgeAccessory.platform.bindCharacteristicEvents(
          characteristic,
          service,
          homebridgeAccessory
        );
      }
      services.push(service.controlService);
    }
    return services;
  },

  updateCharacteristic: function(characteristic, characteristicIsOn, callback) {
    try {
      if (callback) {
        callback(undefined, characteristicIsOn);
      } else {
        characteristic.updateValue(characteristicIsOn);
      }
    } catch (error) {
      characteristic.updateValue(characteristicIsOn);
    }
  },

  configureAccessories: function(harmonyPlatform, callback) {
    harmonyPlatform.log('Loading activities...');

    this.harmony.on('open', () => {
      harmonyPlatform.log.debug('socket opened');
    });

    this.harmony.on('close', () => {
      harmonyPlatform.log.debug('socket closed');
    });

    this.harmony.on('stateDigest', message => {
      harmonyPlatform.log.debug(
        'INFO - onMessage : received message : ' + JSON.stringify(message)
      );
      if (
        message.type === 'connect.stateDigest?get' ||
        (message.type === 'connect.stateDigest?notify' &&
          message.data.activityStatus === 2 &&
          message.data.activityId === message.data.runningActivityList) ||
        (message.type === 'connect.stateDigest?notify' &&
          message.data.activityStatus === 0 &&
          message.data.activityId === '-1' &&
          message.data.runningActivityList === '')
      ) {
        harmonyPlatform.log(
          'INFO - onMessage : Refreshing activity to ' + message.data.activityId
        );
        harmonyPlatform.onMessage(message.data.activityId);
      }
    });

    this.harmony
      .connect(harmonyPlatform.hubIP)
      .then(() => this.harmony.getConfig())
      .then(response => {
        harmonyPlatform.log.debug('Hub config : ' + JSON.stringify(response));

        harmonyPlatform.readAccessories(response, callback);
      })
      .catch(e => {
        harmonyPlatform.log('Error retrieving info from hub : ' + e.message);
        //try again
        this.harmony
          .end()
          .then(() => {
            var that = this;
            setTimeout(function() {
              that.configureAccessories(harmonyPlatform, callback);
            }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
          })
          .catch(e2 => {
            harmonyPlatform.log(
              'Fatal Error retrieving info from hub : ' + e2.message
            );
          });
      });
  },

  refreshCurrentActivity: function(harmonyPlatform, callback) {
    if (
      harmonyPlatform._currentActivity >
        HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE &&
      harmonyPlatform._currentActivityLastUpdate &&
      Date.now() - harmonyPlatform._currentActivityLastUpdate <
        HarmonyConst.TIMEOUT_REFRESH_CURRENT_ACTIVITY
    ) {
      // we don't refresh since status was retrieved not so far away
      harmonyPlatform.log.debug(
        'INFO - refreshCurrentActivity : NO refresh needed since last update was on :' +
          harmonyPlatform._currentActivity +
          ' and current Activity is set'
      );
      callback();
    } else {
      harmonyPlatform.log.debug(
        'INFO - refreshCurrentActivity : Refresh needed since last update is too old or current Activity is not set : ' +
          harmonyPlatform._currentActivity
      );

      this.harmony
        .getCurrentActivity()
        .then(response => {
          harmonyPlatform.refreshCurrentActivity(response);
          callback();
        })
        .catch(e => {
          harmonyPlatform.log(
            'ERROR - refreshCurrentActivity : RefreshCurrentActivity : ' + e
          );
          harmonyPlatform.refreshCurrentActivity(
            CURRENT_ACTIVITY_NOT_SET_VALUE
          );
          callback();
        });
    }
  },
};
