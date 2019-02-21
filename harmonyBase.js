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

    harmonyPlatform.sequencesToPublishAsAccessoriesSwitch =
      config['sequencesToPublishAsAccessoriesSwitch'];
    harmonyPlatform.publishSequencesAsIndividualAccessories =
      config['publishSequencesAsIndividualAccessories'];
    if (harmonyPlatform.publishSequencesAsIndividualAccessories == undefined)
      harmonyPlatform.publishSequencesAsIndividualAccessories = true;

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
          harmonyPlatform.log('INFO - shutdown');
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
    harmonyPlatform.log('INFO - Loading activities...');

    this.harmony.removeAllListeners();

    this.harmony.on('open', () => {
      harmonyPlatform.log.debug('INFO - socket opened');
    });

    this.harmony.on('close', () => {
      harmonyPlatform.log.debug('WARNING - socket closed');
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
        harmonyPlatform.log.debug(
          'INFO - Hub config : ' + JSON.stringify(response)
        );
        harmonyPlatform.readAccessories(response, callback);
      })
      .catch(e => {
        harmonyPlatform.log(
          'Error - Error retrieving info from hub : ' + e.message
        );
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

  getSequencesAccessories: function(harmonyPlatform, data) {
    harmonyPlatform.log('INFO - Loading sequences...');
    let sequences = data.data.sequence;
    let services = [];
    for (
      let c = 0,
        len = harmonyPlatform.sequencesToPublishAsAccessoriesSwitch.length;
      c < len;
      c++
    ) {
      var sequence = harmonyPlatform.sequencesToPublishAsAccessoriesSwitch[c];

      for (let i = 0, len = sequences.length; i < len; i++) {
        if (sequences[i].name === sequence) {
          let accessoryName = harmonyPlatform.name + '-' + sequence;
          let switchName = sequence;

          if (harmonyPlatform.devMode) {
            switchName = 'DEV' + switchName;
          }

          harmonyPlatform.log('INFO - Discovered sequence : ' + switchName);

          let service = {
            controlService: new Service.Switch(switchName),
            characteristics: [Characteristic.On],
          };
          service.controlService.subtype = switchName + '-' + sequence;
          service.controlService.id = sequences[i].id;
          service.type = HarmonyConst.SEQUENCE_TYPE;
          services.push(service);

          if (harmonyPlatform.publishSequencesAsIndividualAccessories) {
            harmonyPlatform.log('INFO - Adding Accessory : ' + accessoryName);
            let myHarmonyAccessory = new HarmonyAccessory(services);
            myHarmonyAccessory.getServices = function() {
              return harmonyPlatform.getServices(myHarmonyAccessory);
            };
            myHarmonyAccessory.platform = harmonyPlatform;
            myHarmonyAccessory.name = accessoryName;
            myHarmonyAccessory.model = harmonyPlatform.name;
            myHarmonyAccessory.manufacturer = 'Harmony';
            myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;
            harmonyPlatform._foundAccessories.push(myHarmonyAccessory);
            services = [];
          }
        }
      }
    }

    if (
      !harmonyPlatform.publishSequencesAsIndividualAccessories &&
      services.length > 0
    ) {
      harmonyPlatform.log('INFO - Adding Accessory : ' + harmonyPlatform.name);
      let myHarmonyAccessory = new HarmonyAccessory(services);
      myHarmonyAccessory.getServices = function() {
        return harmonyPlatform.getServices(myHarmonyAccessory);
      };
      myHarmonyAccessory.platform = harmonyPlatform;
      myHarmonyAccessory.name = harmonyPlatform.name + '-Sequences';
      myHarmonyAccessory.model = harmonyPlatform.name;
      myHarmonyAccessory.manufacturer = 'Harmony';
      myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;
      harmonyPlatform._foundAccessories.push(myHarmonyAccessory);
    }
  },

  getDevicesAccessories: function(harmonyPlatform, data) {
    harmonyPlatform.log('INFO - Loading devices...');
    let devices = data.data.device;
    let services = [];

    //printing commands for helping users
    for (let i = 0, len = devices.length; i < len; i++) {
      let controlGroup = devices[i].controlGroup;
      for (let j = 0, len = controlGroup.length; j < len; j++) {
        let functions = controlGroup[j].function;
        for (let k = 0, len = functions.length; k < len; k++) {
          harmonyPlatform.log(
            'INFO - Command : ' +
              functions[k].name +
              ' discovered for device : ' +
              devices[i].label
          );
        }
      }
    }

    for (
      let c = 0,
        len = harmonyPlatform.devicesToPublishAsAccessoriesSwitch.length;
      c < len;
      c++
    ) {
      var commands = harmonyPlatform.devicesToPublishAsAccessoriesSwitch[
        c
      ].split(';');

      for (let i = 0, len = devices.length; i < len; i++) {
        if (devices[i].label === commands[0]) {
          let accessoryName = harmonyPlatform.name + '-' + devices[i].label;
          let switchName = devices[i].label;

          if (harmonyPlatform.devMode) {
            switchName = 'DEV' + switchName;
          }

          harmonyPlatform.log('INFO - Discovered Device : ' + switchName);

          //check  functions
          let commandFunctions = [];
          let controlGroup = devices[i].controlGroup;

          //default mode
          if (commands.length === 1) {
            let foundToggle = false;
            for (let j = 0, len = controlGroup.length; j < len; j++) {
              if (controlGroup[j].name === 'Power') {
                let functions = controlGroup[j].function;
                for (let k = 0, len = functions.length; k < len; k++) {
                  if (functions[k].name === 'PowerOff') {
                    harmonyPlatform.log(
                      'INFO - Activating PowerOff for ' + switchName
                    );
                    commandFunctions.push({
                      key: 'PowerOff',
                      value: functions[k].action,
                    });
                  } else if (functions[k].name === 'PowerOn') {
                    harmonyPlatform.log(
                      'INFO - Activating  PowerOn for ' + switchName
                    );
                    commandFunctions.push({
                      key: 'PowerOn',
                      value: functions[k].action,
                    });
                  } else if (functions[k].name === 'PowerToggle') {
                    harmonyPlatform.log(
                      'INFO - Activating  PowerToggle for ' + switchName
                    );
                    commandFunctions.push({
                      key: 'PowerToggle',
                      value: functions[k].action,
                    });
                    foundToggle = true;
                  }
                }
              }
            }

            if (commandFunctions.length == 0) {
              harmonyPlatform.log(
                'Error - No function found for ' + switchName
              );
            } else {
              for (let j = 0, len = commandFunctions.length; j < len; j++) {
                if (
                  (foundToggle && commandFunctions[j].key === 'PowerToggle') ||
                  !foundToggle
                ) {
                  let service = {
                    controlService: new Service.Switch(
                      switchName + '-' + commandFunctions[j].key
                    ),
                    characteristics: [Characteristic.On],
                  };
                  service.controlService.subtype =
                    switchName + '-' + commandFunctions[j].key;
                  service.controlService.id = devices[i].id;
                  service.type = HarmonyConst.DEVICE_TYPE;
                  service.command = commandFunctions[j].value;
                  services.push(service);

                  if (harmonyPlatform.publishDevicesAsIndividualAccessories) {
                    harmonyPlatform.log(
                      'INFO - Adding Accessory : ' +
                        accessoryName +
                        '-' +
                        commandFunctions[j].key
                    );
                    let myHarmonyAccessory = new HarmonyAccessory(services);
                    myHarmonyAccessory.getServices = function() {
                      return harmonyPlatform.getServices(myHarmonyAccessory);
                    };
                    myHarmonyAccessory.platform = harmonyPlatform;
                    myHarmonyAccessory.name =
                      accessoryName + '-' + commandFunctions[j].key;
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
          //specifc command or list mode
          else {
            let functionsForSwitch = [];
            let functionsKey = '';

            for (let l = 1, len = commands.length; l < len; l++) {
              for (let j = 0, len = controlGroup.length; j < len; j++) {
                let functions = controlGroup[j].function;
                for (let k = 0, len = functions.length; k < len; k++) {
                  let commandTosend = commands[l].split('|');

                  if (functions[k].name === commandTosend[0]) {
                    harmonyPlatform.log(
                      'INFO - Activating  ' +
                        commandTosend[0] +
                        ' for ' +
                        switchName
                    );

                    if (commandTosend.length === 2) {
                      let fctWithDelay =
                        functions[k].action + '|' + commandTosend[1];
                      functionsForSwitch.push(fctWithDelay);
                    } else {
                      functionsForSwitch.push(functions[k].action);
                    }
                    functionsKey = functionsKey + commandTosend[0];
                  }
                }
              }
            }

            if (functionsForSwitch.length === 0) {
              harmonyPlatform.log(
                'Error - No function list found for ' + switchName
              );
            } else {
              let service = {
                controlService: new Service.Switch(
                  switchName + '-' + functionsKey
                ),
                characteristics: [Characteristic.On],
              };
              service.controlService.subtype = switchName + '-' + functionsKey;
              service.controlService.id = devices[i].id;
              service.type = HarmonyConst.DEVICEMACRO_TYPE;
              service.command = JSON.stringify(functionsForSwitch);
              services.push(service);

              if (harmonyPlatform.publishDevicesAsIndividualAccessories) {
                harmonyPlatform.log(
                  'INFO - Adding Accessory : ' +
                    accessoryName +
                    '-' +
                    functionsKey
                );
                let myHarmonyAccessory = new HarmonyAccessory(services);
                myHarmonyAccessory.getServices = function() {
                  return harmonyPlatform.getServices(myHarmonyAccessory);
                };
                myHarmonyAccessory.platform = harmonyPlatform;
                myHarmonyAccessory.name = accessoryName + '-' + functionsKey;
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
    }

    if (
      !harmonyPlatform.publishDevicesAsIndividualAccessories &&
      services.length > 0
    ) {
      harmonyPlatform.log('INFO - Adding Accessory : ' + harmonyPlatform.name);
      let myHarmonyAccessory = new HarmonyAccessory(services);
      myHarmonyAccessory.getServices = function() {
        return harmonyPlatform.getServices(myHarmonyAccessory);
      };
      myHarmonyAccessory.platform = harmonyPlatform;
      myHarmonyAccessory.name = harmonyPlatform.name + '-Devices';
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
          if (service.type === HarmonyConst.DEVICE_TYPE) {
            let command = service.command;
            this.sendCommand(harmonyPlatform, command);
          } else if (service.type === HarmonyConst.DEVICEMACRO_TYPE) {
            let commands = JSON.parse(service.command);
            processCommands(this, harmonyPlatform, commands);
          } else if (service.type === HarmonyConst.SEQUENCE_TYPE) {
            let command = '{"sequenceId":"' + service.controlService.id + '"}';
            this.sendCommand(harmonyPlatform, command);
          }
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

    return this.harmony
      .sendCommands(commandToSend)
      .then(data => {
        harmonyPlatform.log.debug(
          'INFO - sendCommand done' + JSON.stringify(data)
        );
      })
      .catch(e => {
        harmonyPlatform.log('ERROR - sendCommand : ' + e);
      });
  },
};

function HarmonyAccessory(services) {
  this.services = services;
}

async function processCommands(hb, platform, commands) {
  for (const command of commands) {
    let commandTosend = command.split('|');
    let timeToWait = HarmonyConst.DELAY_FOR_MACRO;
    if (commandTosend.length === 2) timeToWait = commandTosend[1];
    else timeToWait = HarmonyConst.DELAY_FOR_MACRO;
    console.log(commandTosend[0]);
    console.log(timeToWait);
    await processCommand(hb, platform, commandTosend[0], timeToWait);
  }
}

async function processCommand(hb, platform, command, timeToWait) {
  // notice that we can await a function
  // that returns a promise
  await hb.sendCommand(platform, command);
  await delay(timeToWait);
}

function delay(timeToWait) {
  return new Promise(resolve => setTimeout(resolve, timeToWait));
}
