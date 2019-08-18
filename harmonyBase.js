var Service, Characteristic, Accessory, AccessoryType, UUIDGen;
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
  AccessoryType = api.hap.Accessory.Categories;
  UUIDGen = api.hap.uuid;
}

HarmonyBase.prototype = {
  //SETUP
  configCommonProperties: function(log, config, harmonyPlatform) {
    harmonyPlatform.log = log;
    harmonyPlatform.hubIP = config['hubIP'];

    harmonyPlatform.name = config['name'];
    harmonyPlatform.devMode = config['DEVMODE'];

    harmonyPlatform.addAllActivitiesToSkippedIfSameStateActivitiesList = HarmonyTools.checkParameter(
      config['addAllActivitiesToSkippedIfSameStateActivitiesList'],
      false
    );
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

    harmonyPlatform.homeControlsToPublishAsAccessoriesSwitch =
      config['homeControlsToPublishAsAccessoriesSwitch'];
    harmonyPlatform.publishHomeControlsAsIndividualAccessories = HarmonyTools.checkParameter(
      config['publishHomeControlsAsIndividualAccessories'],
      true
    );

    harmonyPlatform.showCommandsAtStartup = config['showCommandsAtStartup'];

    harmonyPlatform._currentActivity = -9999;
    harmonyPlatform._currentActivityLastUpdate = undefined;
    harmonyPlatform._currentSetAttemps = 0;
    harmonyPlatform._foundAccessories = [];
    harmonyPlatform._currentActivity = -1;

    harmonyPlatform.log.debug(
      'INFO : following activites controls will be ignored if they are in the same state : ' +
        (harmonyPlatform.addAllActivitiesToSkippedIfSameStateActivitiesList
          ? 'ALL'
          : harmonyPlatform.skippedIfSameStateActivities
          ? harmonyPlatform.skippedIfSameStateActivities
          : 'NONE')
    );
  },

  configureAccessories: function(harmonyPlatform) {
    if (HarmonyTools.isPlatformEmpty(harmonyPlatform)) {
      harmonyPlatform.log(
        'WARNING - platform ' + harmonyPlatform.name + ' is empty'
      );
      return;
    }

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

    this.harmony.on('automationState', message => {
      //DEBUG
      //message = JSON.parse('{"type":"automation.state?notify","data":{"hue-light.harmony_virtual_button_2":{"color":{"mode":"xy","xy":{"y":0,"x":0},"temp":300,"hueSat":{"hue":0,"sat":0}},"brightness":254,"on":true,"status":0}}}');

      harmonyPlatform.log.debug(
        'INFO - onMessage : Refreshing Home Automation Switch ' +
          JSON.stringify(message.data)
      );
      this.refreshHomeSwitch(harmonyPlatform, message.data);
    });

    this.harmony.on('stateDigest', message => {
      harmonyPlatform.log.debug(
        'INFO - onMessage : received message : ' + JSON.stringify(message)
      );
      if (
        (message.data.activityStatus === 2 &&
          message.data.activityId === message.data.runningActivityList) ||
        (message.data.activityStatus === 0 &&
          message.data.activityId === '-1' &&
          message.data.runningActivityList === '')
      ) {
        harmonyPlatform.log.debug(
          'INFO - onMessage : Refreshing activity to ' + message.data.activityId
        );
        harmonyPlatform.onMessage(message.data.activityId);
      }
    });

    this.harmony.sendTimeout = HarmonyConst.HUB_SEND_TIMEOUT;
    this.harmony.connectTimeout = HarmonyConst.HUB_CONNECT_TIMEOUT;

    this.harmony
      .connect(harmonyPlatform.hubIP)
      .then(() => this.harmony.getConfig())
      .then(response => {
        harmonyPlatform.log.debug(
          'INFO - Hub config : ' + JSON.stringify(response)
        );
        this.getHomeControlsAccessories(harmonyPlatform).then(responseHome => {
          harmonyPlatform.readAccessories(response, responseHome);
          this.numberAttemps = 0;
        });
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

  setupFoundAccessories(harmonyPlatform, accessoriesToAdd, data, homedata) {
    //creating accessories

    for (const accessory of accessoriesToAdd) {
      let isTv = accessory.category == AccessoryType.TELEVISION;

      if (
        isTv &&
        (harmonyPlatform.mainPlatform._oneTVAdded ||
          harmonyPlatform.mainPlatform.publishAllTVAsExternalAccessory)
      ) {
        try {
          harmonyPlatform.api.publishExternalAccessories(
            'homebridge-harmonyHub',
            [accessory]
          );
          harmonyPlatform.log(
            'INFO - setupFoundAccessories - TV accessory added as external accessory'
          );
        } catch (err) {
          harmonyPlatform.log(
            "ERROR - readAccessories - Can't publish TV Acccessory as external device, need Homebridge 0.0.47 at least : " +
              err
          );
        }
      } else {
        if (isTv) {
          harmonyPlatform.mainPlatform._oneTVAdded = true;
          harmonyPlatform.log(
            'WARNING - setupFoundAccessories - TV accessory added in your bridge, if another plugin is exposing a TV accessory this one might not be visible in your remote widget'
          );
        }

        this.addAccessories(harmonyPlatform, [accessory]);
      }
    }

    this.getDevicesAccessories(harmonyPlatform, data);
    this.getSequencesAccessories(harmonyPlatform, data);
    this.handleHomeControls(harmonyPlatform, homedata);

    //first refresh
    setTimeout(function() {
      harmonyPlatform.refreshPlatform();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);
  },

  //REFRESH

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

  //HOME SWITCHES
  refreshHomeAccessory(harmonyPlatform) {
    this.getHomeControlsAccessories(harmonyPlatform).then(responseHome => {
      if (responseHome && responseHome.data) {
        harmonyPlatform.log.debug(
          'INFO - got home controls : ' + JSON.stringify(responseHome)
        );
        this.refreshHomeSwitch(harmonyPlatform, responseHome.data);
      }
    });
  },

  refreshHomeSwitch(harmonyPlatform, data) {
    for (let a = 0; a < harmonyPlatform._foundAccessories.length; a++) {
      let myHarmonyAccessory = harmonyPlatform._foundAccessories[a];

      for (let s = 0; s < myHarmonyAccessory.services.length; s++) {
        let service = myHarmonyAccessory.services[s];
        if (service.type == HOME_TYPE) {
          let newValue = data[service.HomeId];

          if (newValue) {
            let characteristic = service.getCharacteristic(Characteristic.On);

            harmonyPlatform.log.debug(
              'INFO - refreshHomeSwitch - Refreshing home switch ' +
                service.displayName +
                ' to ' +
                newValue.on
            );
            characteristic.updateValue(newValue.on);
          }
        }
      }
    }
  },

  handleHomeControls: function(harmonyPlatform, data) {
    if (!data || !data.data) {
      return;
    }

    harmonyPlatform.log.debug(
      'INFO - got Home Control : ' + JSON.stringify(data)
    );

    let homeControls = data.data;

    var accessoriesToAdd = [];
    var myHarmonyAccessory;

    if (!harmonyPlatform.publishHomeControlsAsIndividualAccessories) {
      let name = 'HomeControls';
      myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
      if (!myHarmonyAccessory) {
        myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
        accessoriesToAdd.push(myHarmonyAccessory);
      }
    }

    for (var key in homeControls) {
      let switchName = key;

      if (
        harmonyPlatform.homeControlsToPublishAsAccessoriesSwitch.includes(
          switchName
        )
      ) {
        if (harmonyPlatform.devMode) {
          switchName = 'DEV' + switchName;
        }

        harmonyPlatform.log('INFO - Discovered Home Control : ' + switchName);

        if (harmonyPlatform.publishHomeControlsAsIndividualAccessories) {
          myHarmonyAccessory = this.checkAccessory(harmonyPlatform, switchName);
          if (!myHarmonyAccessory) {
            myHarmonyAccessory = this.createAccessory(
              harmonyPlatform,
              switchName
            );
            accessoriesToAdd.push(myHarmonyAccessory);
          }
        }

        let subType = switchName;
        let service = this.getSwitchService(
          harmonyPlatform,
          myHarmonyAccessory,
          switchName,
          subType
        );

        service.HomeId = key;
        service.type = HarmonyConst.HOME_TYPE;
        this.bindCharacteristicEventsForSwitch(harmonyPlatform, service);
      }
    }

    //creating accessories
    this.addAccessories(harmonyPlatform, accessoriesToAdd);
  },

  getHomeControlsAccessories: function(harmonyPlatform) {
    if (
      harmonyPlatform.homeControlsToPublishAsAccessoriesSwitch &&
      harmonyPlatform.homeControlsToPublishAsAccessoriesSwitch.length > 0
    ) {
      harmonyPlatform.log.debug('INFO - getting home controls ...');
      return this.harmony.getAutomationCommands();
    } else {
      var responseHome = {};
      //DEBUG
      /*
      responseHome = JSON.parse(
        ' {"cmd":"harmony.automation?getstate","code":200,"id":"0.11199321450018873","msg":"OK","data":{"hue-light.harmony_virtual_button_3":{"color":{"mode":"xy","xy":{"y":0,"x":0},"temp":300,"hueSat":{"hue":0,"sat":0}},"brightness":254,"on":true,"status":0},"hue-light.harmony_virtual_button_4":{"color":{"mode":"xy","xy":{"y":0,"x":0},"temp":300,"hueSat":{"hue":0,"sat":0}},"brightness":254,"on":false,"status":0},"hue-light.harmony_virtual_button_1":{"color":{"mode":"xy","xy":{"y":0,"x":0},"temp":300,"hueSat":{"hue":0,"sat":0}},"brightness":254,"on":false,"status":0},"hue-light.harmony_virtual_button_2":{"color":{"mode":"xy","xy":{"y":0,"x":0},"temp":300,"hueSat":{"hue":0,"sat":0}},"brightness":254,"on":false,"status":0}}}'
      );
*/
      return Promise.resolve(responseHome);
    }
  },

  //SEQUENCES SWITCHES
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
        let name = 'Sequences';
        myHarmonyAccessory = this.checkAccessory(harmonyPlatform, name);
        if (!myHarmonyAccessory) {
          myHarmonyAccessory = this.createAccessory(harmonyPlatform, name);
          accessoriesToAdd.push(myHarmonyAccessory);
        }
      }

      for (let i = 0, len = sequences.length; i < len; i++) {
        let switchName = sequences[i].name;
        if (
          harmonyPlatform.sequencesToPublishAsAccessoriesSwitch.includes(
            switchName
          )
        ) {
          if (harmonyPlatform.devMode) {
            switchName = 'DEV' + switchName;
          }

          harmonyPlatform.log('INFO - Discovered sequence : ' + switchName);

          if (harmonyPlatform.publishSequencesAsIndividualAccessories) {
            myHarmonyAccessory = this.checkAccessory(
              harmonyPlatform,
              switchName
            );
            if (!myHarmonyAccessory) {
              myHarmonyAccessory = this.createAccessory(
                harmonyPlatform,
                switchName
              );
              accessoriesToAdd.push(myHarmonyAccessory);
            }
          }

          let subType = switchName + '-Sequence';
          let service = this.getSwitchService(
            harmonyPlatform,
            myHarmonyAccessory,
            switchName,
            subType
          );

          service.sequenceId = sequences[i].id;
          service.type = HarmonyConst.SEQUENCE_TYPE;
          this.bindCharacteristicEventsForSwitch(harmonyPlatform, service);
        }
      }

      //creating accessories
      this.addAccessories(harmonyPlatform, accessoriesToAdd);
    }
  },

  //DEVICES SWITCHES
  printAndStoreCommands: function(harmonyPlatform, devices) {
    this.deviceCommands = {};
    for (let i = 0, len = devices.length; i < len; i++) {
      let controlGroup = devices[i].controlGroup;
      for (let j = 0, len = controlGroup.length; j < len; j++) {
        let functions = controlGroup[j].function;
        for (let k = 0, len = functions.length; k < len; k++) {
          if (harmonyPlatform.showCommandsAtStartup)
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
            harmonyPlatform.log.debug(
              'INFO - Activating PowerOff for ' + switchName
            );
            commandFunctions.push({
              key: 'PowerOff',
              value: functions[k].action,
            });
          } else if (functions[k].name === 'PowerOn') {
            harmonyPlatform.log.debug(
              'INFO - Activating  PowerOn for ' + switchName
            );
            commandFunctions.push({
              key: 'PowerOn',
              value: functions[k].action,
            });
          } else if (functions[k].name === 'PowerToggle') {
            harmonyPlatform.log.debug(
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
    device,
    customSwitchName
  ) {
    let accessoriesToAdd = [];

    switchName = harmonyPlatform.devMode ? 'DEV' + device.label : device.label;

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
            let name = switchName + '-' + commandFunctions[j].key;
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
            customSwitchName ? customSwitchName : switchName,
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
    device,
    customSwitchName
  ) {
    let accessoriesToAdd = [];

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
            harmonyPlatform.log.debug(
              'INFO - Activating  Macro ' +
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
        let name = switchName + '-' + functionsKey;
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
        customSwitchName ? customSwitchName : switchName,
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
        let name = 'Devices';
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
          let nameSwitchArray = commands[0].split('|');
          let ServiceName = nameSwitchArray[0];
          let customSwitchName =
            nameSwitchArray.length > 1 ? nameSwitchArray[1] : undefined;
          if (devices[i].label === ServiceName) {
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
                  devices[i],
                  customSwitchName
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
                  devices[i],
                  customSwitchName
                )
              );
            }
          }
        }
      }

      //creating accessories
      this.addAccessories(harmonyPlatform, accessoriesToAdd);
    }
  },

  //ACCESSORIES, SERVICES AND CHARACERISTICS
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

  checkAccessory(harmonyPlatform, name) {
    let fullName = harmonyPlatform.name + (name ? '-' + name : '');
    let uuid = UUIDGen.generate(fullName);
    return harmonyPlatform._foundAccessories.find(x => x.UUID == uuid);
  },

  createAccessory(harmonyPlatform, name) {
    let fullName = harmonyPlatform.name + (name ? '-' + name : '');
    harmonyPlatform.log('INFO - Adding Accessory : ' + fullName);
    let uuid = UUIDGen.generate(fullName);
    let myHarmonyAccessory = new Accessory(fullName, uuid);

    myHarmonyAccessory.name = fullName;
    myHarmonyAccessory.model = harmonyPlatform.name;
    myHarmonyAccessory.manufacturer = 'Harmony';
    myHarmonyAccessory.serialNumber = harmonyPlatform.hubIP;
    myHarmonyAccessory.context.subPlatformName = harmonyPlatform.name;

    myHarmonyAccessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(
        Characteristic.Manufacturer,
        myHarmonyAccessory.manufacturer
      )
      .setCharacteristic(Characteristic.Model, myHarmonyAccessory.model)
      .setCharacteristic(
        Characteristic.SerialNumber,
        myHarmonyAccessory.serialNumber
      );

    return myHarmonyAccessory;
  },

  addAccessories(harmonyPlatform, accessoriesToAdd) {
    harmonyPlatform._foundAccessories.push.apply(
      harmonyPlatform._foundAccessories,
      accessoriesToAdd
    );

    harmonyPlatform.api.registerPlatformAccessories(
      'homebridge-harmonyHub',
      'HarmonyHubWebSocket',
      accessoriesToAdd
    );
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
      service = new Service.Switch(switchName, 'switchService' + switchName);
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
          if (service.type === HarmonyConst.HOME_TYPE) {
            let command = {};
            command.on = value;
            let commandToSend = {};
            commandToSend[service.HomeId] = command;
            this.sendAutomationCommand(harmonyPlatform, commandToSend);
          } else if (value) {
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

            // In order to behave like a push button reset the status to off
            setTimeout(function() {
              service
                .getCharacteristic(Characteristic.On)
                .updateValue(false, undefined);
            }, HarmonyConst.DELAY_FOR_STATELESS_SWITCH_UPDATE);
          }

          callback();
        }.bind(this)
      )
      .on(
        'get',
        function(callback) {
          if (service.type === HarmonyConst.HOME_TYPE) {
            this.getHomeControlsAccessories(harmonyPlatform).then(
              responseHome => {
                var newValue = false;
                if (
                  responseHome &&
                  responseHome.data &&
                  responseHome.data[service.HomeId]
                )
                  newValue = responseHome.data[service.HomeId].on;

                this.handleCharacteristicUpdate(
                  harmonyPlatform,
                  service.getCharacteristic(Characteristic.On),
                  newValue,
                  callback
                );
              }
            );
          } else {
            this.handleCharacteristicUpdate(
              harmonyPlatform,
              service.getCharacteristic(Characteristic.On),
              false,
              callback
            );
          }
        }.bind(this)
      );
  },

  //COMMAND
  sendCommand: function(harmonyPlatform, commandToSend) {
    if (!commandToSend) {
      harmonyPlatform.log.debug('INFO - sendCommand : Command not available ');
      return;
    }
    harmonyPlatform.log.debug('INFO - sendingCommand' + commandToSend);

    return this.harmony
      .sendCommand(commandToSend)
      .then(data => {
        harmonyPlatform.log.debug(
          'INFO - sendCommand done' + JSON.stringify(data)
        );
      })
      .catch(e => {
        harmonyPlatform.log('ERROR - sendCommand : ' + e);
      });
  },

  sendAutomationCommand: function(harmonyPlatform, commandToSend) {
    if (!commandToSend) {
      harmonyPlatform.log.debug(
        'INFO - sendAutomationCommand : Command not available '
      );
      return;
    }
    harmonyPlatform.log.debug(
      'INFO - sendingAutomationCommand' + JSON.stringify(commandToSend)
    );

    return this.harmony
      .sendAutomationCommand(commandToSend)
      .then(data => {
        harmonyPlatform.log.debug(
          'INFO - sendingAutomationCommand done' + JSON.stringify(data)
        );

        if (!HarmonyTools.isCommandOk(data)) {
          this.refreshHomeAccessory(harmonyPlatform);
        }
      })
      .catch(e => {
        harmonyPlatform.log('ERROR - sendingAutomationCommand : ' + e);
        this.refreshHomeAccessory(harmonyPlatform);
      });
  },
};
