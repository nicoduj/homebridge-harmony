var Service, Characteristic, Accessory, UUIDGen;
const HarmonyConst = require('./harmonyConst');

const Harmony = require('harmony-websocket');
const HarmonyTools = require('./harmonyTools.js');

module.exports = {
  HarmonyBase: HarmonyBase,
};

function HarmonyBase(api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  this.harmony = new Harmony();
  this.numberAttemps = 0;
  Accessory = api.platformAccessory;
  UUIDGen = api.hap.uuid;
}

HarmonyBase.prototype = {
  configCommonProperties: function(log, config, api, harmonyPlatform) {
    harmonyPlatform.log = log;
    harmonyPlatform.hubIP = config['hubIP'];

    harmonyPlatform.name = config['name'];
    harmonyPlatform.devMode = config['DEVMODE'];

    harmonyPlatform.addAllActivitiesToSkippedIfSameStateActivitiesList =
      config['addAllActivitiesToSkippedIfSameStateActivitiesList'];
    harmonyPlatform.skippedIfSameStateActivities =
      config['skippedIfSameStateActivities'];

    harmonyPlatform.devicesToPublishAsAccessoriesSwitch =
      config['devicesToPublishAsAccessoriesSwitch'];
    harmonyPlatform.publishDevicesAsIndividualAccessories = HarmonyTools.checkParameter(
      config['publishDevicesAsIndividualAccessories'],
      true
    );

    harmonyPlatform.sequencesToPublishAsAccessoriesSwitch =
      config['sequencesToPublishAsAccessoriesSwitch'];

    harmonyPlatform.publishSequencesAsIndividualAccessories = HarmonyTools.checkParameter(
      config['publishSequencesAsIndividualAccessories'],
      true
    );

    harmonyPlatform.cleanCache = config['cleanCache'];

    harmonyPlatform._currentActivity = -9999;
    harmonyPlatform._currentActivityLastUpdate = undefined;
    harmonyPlatform._currentSetAttemps = 0;
    harmonyPlatform._foundAccessories = [];
    harmonyPlatform._currentActivity = -1;

    harmonyPlatform.log.debug(
      'INFO : following activites controls will be ignored if they are in the same state : ' +
        (harmonyPlatform.addAllActivitiesToSkippedIfSameStateActivitiesList
          ? 'ALL'
          : harmonyPlatform.skippedIfSameStateActivities)
    );

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      harmonyPlatform.api = api;

      harmonyPlatform.api
        .on(
          'shutdown',
          function() {
            harmonyPlatform.log('INFO - shutdown');
            this.harmony.removeAllListeners();
            this.harmony.end();
          }.bind(this)
        )
        .on(
          'didFinishLaunching',
          function() {
            harmonyPlatform.log('DidFinishLaunching');

            if (harmonyPlatform.cleanCache) {
              harmonyPlatform.log('WARNING - Removing Accessories');
              harmonyPlatform.api.unregisterPlatformAccessories(
                'homebridge-harmonyHub',
                'HarmonyHubWebSocket',
                harmonyPlatform._foundAccessories
              );
              harmonyPlatform._foundAccessories = [];
            }
            this.configureAccessories(harmonyPlatform);
          }.bind(this)
        );
    }
  },

  handleCharacteristicUpdate: function(
    harmonyPlatform,
    characteristic,
    value,
    callback
  ) {
    if (
      harmonyPlatform._currentActivity ==
      HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE
    ) {
      this.updateCharacteristicToErr(characteristic, callback);
    } else {
      this.updateCharacteristic(characteristic, value, callback);
    }
  },

  updateCharacteristicToErr: function(characteristic, callback) {
    try {
      if (callback) {
        callback(1);
      } else {
        characteristic.updateValue(undefined);
      }
    } catch (error) {
      characteristic.updateValue(undefined);
    }
  },

  updateCharacteristic: function(
    characteristic,
    characteristicValue,
    callback
  ) {
    try {
      if (callback) {
        callback(undefined, characteristicValue);
      } else {
        characteristic.updateValue(characteristicValue);
      }
    } catch (error) {
      characteristic.updateValue(characteristicValue);
    }
  },

  configureAccessories: function(harmonyPlatform) {
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
      .connect(
        harmonyPlatform.hubIP,
        HarmonyConst.HUB_CONNECT_TIMEOUT,
        HarmonyConst.HUB_SEND_TIMEOUT
      )
      .then(() => this.harmony.getConfig())
      .then(response => {
        harmonyPlatform.log.debug(
          'INFO - Hub config : ' + JSON.stringify(response)
        );
        harmonyPlatform.readAccessories(response);
        this.numberAttemps = 0;
      })
      .catch(e => {
        var that = this;
        this.numberAttemps = this.numberAttemps + 1;

        harmonyPlatform.log(
          'Error - Error retrieving info from hub : ' +
            e.message +
            '-(' +
            this.numberAttemps +
            ')'
        );

        setTimeout(function() {
          that.configureAccessories(harmonyPlatform);
        }, HarmonyConst.DELAY_BEFORE_RECONNECT);
      });
  },

  setupFoundAccessories(harmonyPlatform, accessoriesToAdd, data) {
    //creating accessories
    this.addAccesories(harmonyPlatform, accessoriesToAdd);

    this.getDevicesAccessories(harmonyPlatform, data);
    this.getSequencesAccessories(harmonyPlatform, data);

    //first refresh
    setTimeout(function() {
      harmonyPlatform.refreshAccessory();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);
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

      //if we dont have an activity set, we callback immediately
      var callbackDone = false;
      if (harmonyPlatform._currentActivity == CURRENT_ACTIVITY_NOT_SET_VALUE) {
        callback();
        callbackDone = true;
      }

      this.harmony
        .getCurrentActivity()
        .then(response => {
          harmonyPlatform.refreshCurrentActivity(response);
          if (!callbackDone) callback();
        })
        .catch(e => {
          harmonyPlatform.log('ERROR - refreshCurrentActivity ' + e);
          harmonyPlatform.refreshCurrentActivity(
            HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE
          );
          if (!callbackDone) callback();
        });
    }
  },

  getSequencesAccessories: function(harmonyPlatform, data) {
    if (
      harmonyPlatform.sequencesToPublishAsAccessoriesSwitch &&
      harmonyPlatform.sequencesToPublishAsAccessoriesSwitch.length > 0
    ) {
      harmonyPlatform.log('INFO - Loading sequences...');
      let sequences = data.data.sequence;

      var accessoriesToAdd = [];
      var myHarmonyAccessory;

      if (!harmonyPlatform.publishSequencesAsIndividualAccessories) {
        let name = harmonyPlatform.name + '-Sequences';
        myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
        if (!myHarmonyAccessory) {
          myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
          accessoriesToAdd.push(myHarmonyAccessory);
        }
      }

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

            if (harmonyPlatform.publishSequencesAsIndividualAccessories) {
              myHarmonyAccessory = this.checkAccessory(
                harmonyPlatform,
                accessoryName
              );
              if (!myHarmonyAccessory) {
                myHarmonyAccessory = this.createAccessory(
                  harmonyPlatform,
                  accessoryName
                );
                accessoriesToAdd.push(myHarmonyAccessory);
              }
            }

            let subType = switchName + '-' + sequence;
            let service = this.getSwitchService(
              harmonyPlatform,
              myHarmonyAccessory,
              switchName,
              subType
            );

            service.SequenceId = sequences[i].id;
            service.type = HarmonyConst.SEQUENCE_TYPE;
            this.bindCharacteristicEventsForSwitch(harmonyPlatform, service);
          }
        }
      }

      //creating accessories
      this.addAccesories(harmonyPlatform, accessoriesToAdd);
    }
  },

  printAndStoreCommands: function(harmonyPlatform, devices) {
    this.deviceCommands = {};
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
          //Store command
          this.deviceCommands[[devices[i].label, functions[k].name]] =
            functions[k].action;
        }
      }
    }
  },

  populateCommands: function(harmonyPlatform, controlGroup, switchName) {
    let commandFunctions = [];

    for (let j = 0, len = controlGroup.length; j < len; j++) {
      if (controlGroup[j].name === 'Power') {
        let functions = controlGroup[j].function;
        for (let k = 0, len = functions.length; k < len; k++) {
          if (functions[k].name === 'PowerOff') {
            harmonyPlatform.log('INFO - Activating PowerOff for ' + switchName);
            commandFunctions.push({
              key: 'PowerOff',
              value: functions[k].action,
            });
          } else if (functions[k].name === 'PowerOn') {
            harmonyPlatform.log('INFO - Activating  PowerOn for ' + switchName);
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
          }
        }
      }
    }

    return commandFunctions;
  },

  handleDefaultCommandMode: function(
    myHarmonyAccessory,
    harmonyPlatform,
    controlGroup,
    device
  ) {
    let accessoriesToAdd = [];

    let accessoryName = harmonyPlatform.name + '-' + device.label;
    let switchName = harmonyPlatform.devMode
      ? 'DEV' + device.label
      : device.label;

    harmonyPlatform.log('INFO - Discovered Device : ' + switchName);

    let foundToggle = false;
    let commandFunctions = this.populateCommands(
      harmonyPlatform,
      controlGroup,
      switchName
    );

    if (commandFunctions.some(e => e.key == 'PowerToggle')) {
      foundToggle = true;
    }

    if (commandFunctions.length == 0) {
      harmonyPlatform.log('Error - No function found for ' + switchName);
    } else {
      for (let j = 0, len = commandFunctions.length; j < len; j++) {
        if (
          (foundToggle && commandFunctions[j].key === 'PowerToggle') ||
          !foundToggle
        ) {
          if (harmonyPlatform.publishDevicesAsIndividualAccessories) {
            let name = accessoryName + '-' + commandFunctions[j].key;
            myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
            if (!myHarmonyAccessory) {
              myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
              accessoriesToAdd.push(myHarmonyAccessory);
            }
          }

          let subType = switchName + '-' + commandFunctions[j].key;
          let service = this.getSwitchService(
            harmonyPlatform,
            myHarmonyAccessory,
            switchName,
            subType
          );

          service.deviceId = device.id;
          service.type = HarmonyConst.DEVICE_TYPE;
          service.command = commandFunctions[j].value;

          this.bindCharacteristicEventsForSwitch(harmonyPlatform, service);
        }
      }
    }
    return accessoriesToAdd;
  },

  handleSpecificCommandMode: function(
    myHarmonyAccessory,
    harmonyPlatform,
    commands,
    controlGroup,
    device
  ) {
    let accessoriesToAdd = [];

    let accessoryName = harmonyPlatform.name + '-' + device.label;
    let switchName = harmonyPlatform.devMode
      ? 'DEV' + device.label
      : device.label;

    harmonyPlatform.log('INFO - Discovered Device : ' + switchName);
    let functionsForSwitch = [];
    let functionsKey = '';

    for (let l = 1, len = commands.length; l < len; l++) {
      for (let j = 0, len = controlGroup.length; j < len; j++) {
        let functions = controlGroup[j].function;
        for (let k = 0, len = functions.length; k < len; k++) {
          let commandTosend = commands[l].split('|');

          if (functions[k].name === commandTosend[0]) {
            harmonyPlatform.log(
              'INFO - Activating For Macro ' +
                commandTosend[0] +
                ' for ' +
                switchName
            );

            if (commandTosend.length === 2) {
              let fctWithDelay = functions[k].action + '|' + commandTosend[1];
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
      harmonyPlatform.log('Error - No function list found for ' + switchName);
    } else {
      if (harmonyPlatform.publishDevicesAsIndividualAccessories) {
        let name = accessoryName + '-' + functionsKey;
        myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
        if (!myHarmonyAccessory) {
          myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
          accessoriesToAdd.push(myHarmonyAccessory);
        }
      }

      let subType = switchName + '-' + functionsKey;
      let service = this.getSwitchService(
        harmonyPlatform,
        myHarmonyAccessory,
        switchName,
        subType
      );

      service.deviceId = device.id;
      service.type = HarmonyConst.DEVICEMACRO_TYPE;
      service.command = JSON.stringify(functionsForSwitch);

      this.bindCharacteristicEventsForSwitch(harmonyPlatform, service);
    }

    return accessoriesToAdd;
  },

  getDevicesAccessories: function(harmonyPlatform, data) {
    let devices = data.data.device;
    //printing and storing
    this.printAndStoreCommands(harmonyPlatform, devices);

    var accessoriesToAdd = [];
    var myHarmonyAccessory;

    if (
      harmonyPlatform.devicesToPublishAsAccessoriesSwitch &&
      harmonyPlatform.devicesToPublishAsAccessoriesSwitch.length > 0
    ) {
      harmonyPlatform.log('INFO - Loading devices...');

      if (!harmonyPlatform.publishDevicesAsIndividualAccessories) {
        let name = harmonyPlatform.name + '-Devices';
        myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
        if (!myHarmonyAccessory) {
          myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
          accessoriesToAdd.push(myHarmonyAccessory);
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
            //check  functions

            let controlGroup = devices[i].controlGroup;

            //default mode
            if (commands.length === 1) {
              accessoriesToAdd.push.apply(
                accessoriesToAdd,
                this.handleDefaultCommandMode(
                  myHarmonyAccessory,
                  harmonyPlatform,
                  controlGroup,
                  devices[i]
                )
              );
            }
            //specifc command or list mode
            else {
              accessoriesToAdd.push.apply(
                accessoriesToAdd,
                this.handleSpecificCommandMode(
                  myHarmonyAccessory,
                  harmonyPlatform,
                  commands,
                  controlGroup,
                  devices[i]
                )
              );
            }
          }
        }
      }

      //creating accessories
      this.addAccesories(harmonyPlatform, accessoriesToAdd);
    }
  },

  checkAccessory(harmonyPlatform, name) {
    let uuid = UUIDGen.generate(name);
    return harmonyPlatform._foundAccessories.find(x => (x.UUID = uuid));
  },

  createAccessory(harmonyPlatform, name) {
    harmonyPlatform.log('INFO - Adding Accessory : ' + name);
    let uuid = UUIDGen.generate(name);
    let myHarmonyAccessory = new Accessory(name, uuid);

    myHarmonyAccessory.name = name;
    myHarmonyAccessory.model = harmonyPlatform.name;
    myHarmonyAccessory.manufacturer = 'Harmony';
    myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;

    return myHarmonyAccessory;
  },

  addAccesories(harmonyPlatform, accessoriesToAdd) {
    for (let i = 0, len = accessoriesToAdd.length; i < len; i++) {
      harmonyPlatform._foundAccessories.push(accessoriesToAdd[i]);
      harmonyPlatform.api.registerPlatformAccessories(
        'homebridge-harmonyHub',
        'HarmonyHubWebSocket',
        [accessoriesToAdd[i]]
      );
    }
  },

  getSwitchService(harmonyPlatform, accessory, switchName, serviceSubType) {
    let service = accessory.getServiceByUUIDAndSubType(
      switchName,
      serviceSubType
    );
    if (!service) {
      harmonyPlatform.log(
        'INFO - Creating Switch Service ' + switchName + '/' + serviceSubType
      );
      service = new Service.Switch(switchName);
      service.subtype = serviceSubType;
      accessory.addService(service);
    }
    return service;
  },

  bindCharacteristicEventsForSwitch: function(harmonyPlatform, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'set',
        function(value, callback) {
          //send command
          if (value) {
            if (service.type === HarmonyConst.DEVICE_TYPE) {
              let command = service.command;
              this.sendCommand(harmonyPlatform, command);
            } else if (service.type === HarmonyConst.DEVICEMACRO_TYPE) {
              let commands = JSON.parse(service.command);
              HarmonyTools.processCommands(this, harmonyPlatform, commands);
            } else if (service.type === HarmonyConst.SEQUENCE_TYPE) {
              let command = '{"sequenceId":"' + service.sequenceId + '"}';
              this.sendCommand(harmonyPlatform, command);
            }
          }

          // In order to behave like a push button reset the status to off
          setTimeout(function() {
            service
              .getCharacteristic(Characteristic.On)
              .updateValue(false, undefined);
          }, HarmonyConst.DELAY_FOR_STATELESS_SWITCH_UPDATE);

          callback();
        }.bind(this)
      )
      .on(
        'get',
        function(callback) {
          this.handleCharacteristicUpdate(
            harmonyPlatform,
            service.getCharacteristic(Characteristic.On),
            false,
            callback
          );
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
