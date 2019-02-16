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

    harmonyPlatform.devicesToPublishAsAccessoriesSwitch =
      config['devicesToPublishAsAccessoriesSwitch'];
    harmonyPlatform.publishDevicesAsIndividualAccessories =
      config['publishDevicesAsIndividualAccessories'];
    if (harmonyPlatform.publishDevicesAsIndividualAccessories == undefined)
      harmonyPlatform.publishDevicesAsIndividualAccessories = true;

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

    this.harmony.removeAllListeners();

    this.harmony.on('open', () => {
      harmonyPlatform.log.debug('socket opened');
    });

    this.harmony.on('close', () => {
      harmonyPlatform.log.debug('socket closed');
      var that = this;
      setTimeout(function() {
        that.refreshCurrentActivity(harmonyPlatform, () => {});
      }, HarmonyConst.DELAY_BEFORE_RECONNECT);
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
        var that = this;
        setTimeout(function() {
          that.configureAccessories(harmonyPlatform, callback);
        }, HarmonyConst.DELAY_BEFORE_RECONNECT);
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

  getDevicesAccessories: function(harmonyPlatform, data) {
    harmonyPlatform.log('Loading devices...');
    let devices = data.data.device;
    let services = [];

    for (let i = 0, len = devices.length; i < len; i++) {
      let switchName = devices[i].label;

      if (
        harmonyPlatform.devicesToPublishAsAccessoriesSwitch.includes(switchName)
      ) {
        let accessoryName = harmonyPlatform.name + '-' + devices[i].label;

        if (harmonyPlatform.devMode) {
          switchName = 'DEV' + switchName;
        }

        harmonyPlatform.log('Discovered Device : ' + switchName);

        //check power functions
        let powersFunctions = [];
        let controlGroup = devices[i].controlGroup;
        let foundToggle = false;
        for (let j = 0, len = controlGroup.length; j < len; j++) {
          let functions = controlGroup[j].function;
          if (controlGroup[j].name == 'Power') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'PowerOff') {
                harmonyPlatform.log('Found PowerOff for ' + switchName);
                powersFunctions.push({
                  key: 'PowerOff',
                  value: functions[k].action,
                });
              } else if (functions[k].name == 'PowerOn') {
                harmonyPlatform.log('Found PowerOn for ' + switchName);
                powersFunctions.push({
                  key: 'PowerOn',
                  value: functions[k].action,
                });
              } else if (functions[k].name == 'PowerToggle') {
                harmonyPlatform.log('Found PowerToggle for ' + switchName);
                powersFunctions.push({
                  key: 'PowerToggle',
                  value: functions[k].action,
                });
                foundToggle = true;
              }
            }
          }
        }

        if (powersFunctions.length == 0) {
          harmonyPlatform.log(
            'Error - No Power function found for ' + switchName
          );
        }

        for (let j = 0, len = powersFunctions.length; j < len; j++) {
          if (
            (foundToggle && powersFunctions[j].key === 'PowerToggle') ||
            !foundToggle
          ) {
            let service = {
              controlService: new Service.Switch(
                switchName + '-' + powersFunctions[j].key
              ),
              characteristics: [Characteristic.On],
            };
            service.controlService.subtype =
              switchName + '-' + powersFunctions[j].key;
            service.controlService.id = devices[i].id;
            service.type = HarmonyConst.DEVICE_TYPE;
            service.command = powersFunctions[j].value;
            services.push(service);

            if (harmonyPlatform.publishDevicesAsIndividualAccessories) {
              harmonyPlatform.log(
                'Adding Accessory : ' +
                  accessoryName +
                  '-' +
                  powersFunctions[j].key
              );
              let myHarmonyAccessory = new HarmonyAccessory(services);
              myHarmonyAccessory.getServices = function() {
                return harmonyPlatform.getServices(myHarmonyAccessory);
              };
              myHarmonyAccessory.platform = harmonyPlatform;
              myHarmonyAccessory.name =
                accessoryName + '-' + powersFunctions[j].key;
              myHarmonyAccessory.model = devices[i].model;
              myHarmonyAccessory.manufacturer = devices[i].manufacturer;
              myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;
              harmonyPlatform._foundAccessories.push(myHarmonyAccessory);
              services = [];
            }
          }
        }
      }
    }

    if (
      !harmonyPlatform.publishDevicesAsIndividualAccessories &&
      services.length > 0
    ) {
      harmonyPlatform.log('Adding Accessory : ' + harmonyPlatform.name);
      let myHarmonyAccessory = new HarmonyAccessory(services);
      myHarmonyAccessory.getServices = function() {
        return harmonyPlatform.getServices(myHarmonyAccessory);
      };
      myHarmonyAccessory.platform = harmonyPlatform;
      myHarmonyAccessory.name = harmonyPlatform.name;
      myHarmonyAccessory.model = harmonyPlatform.name;
      myHarmonyAccessory.manufacturer = 'Harmony';
      myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;
      harmonyPlatform._foundAccessories.push(myHarmonyAccessory);
    }
  },

  bindCharacteristicEvents: function(
    harmonyPlatform,
    characteristic,
    service,
    homebridgeAccessory
  ) {
    characteristic.on(
      'set',
      function(value, callback, context) {
        //send command
        if (value) {
          let command = service.command;

          this.sendCommand(harmonyPlatform, command);
        }

        // In order to behave like a push button reset the status to off
        setTimeout(function() {
          characteristic.updateValue(false, undefined);
        }, HarmonyConst.DELAY_FOR_STATELESS_SWITCH_UPDATE);

        callback();
      }.bind(this)
    );
    characteristic.on(
      'get',
      function(callback) {
        callback(undefined, false);
      }.bind(this)
    );
  },

  sendCommand: function(harmonyPlatform, commandToSend) {
    if (!commandToSend) {
      harmonyPlatform.log.debug('INFO - sendCommand : Command not available ');
      return;
    }
    harmonyPlatform.log.debug('INFO - sendingCommand' + commandToSend);

    this.harmony
      .sendCommands(commandToSend)
      .then(data => {
        harmonyPlatform.log.debug(
          'INFO - sendCommand done' + JSON.stringify(data)
        );
      })
      .catch(e => {
        harmonyPlatform.log('ERROR - activityCommand : ' + e);
      });
  },
};

function HarmonyAccessory(services) {
  this.services = services;
}
