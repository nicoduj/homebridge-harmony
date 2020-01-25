var Service, Characteristic, Accessory;

const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');
const HarmonyTools = require('./harmonyTools.js');
const HarmonyAsTVKeysTools = require('./harmonyAsTVKeysTools.js');

const fs = require('fs');

module.exports = {
  HarmonySubPlatform: HarmonySubPlatform,
};

function HarmonySubPlatform(log, config, api, mainPlatform) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  Accessory = api.hap.Accessory;

  this.api = api;
  this.mainPlatform = mainPlatform;
  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, this);

  this.TVAccessory = HarmonyTools.checkParameter(config['TVAccessory'], true);

  this.publishGeneralMuteSwitch = HarmonyTools.checkParameter(
    config['publishGeneralMuteSwitch'],
    false
  );

  if (this.TVAccessory) {
    this.mainActivity = (this.devMode ? 'DEV' : '') + config['mainActivity'];
    this.playPauseBehavior = HarmonyTools.checkParameter(
      config['playPauseBehavior'],
      false
    );

    this.numberOfCommandsSentForVolumeControl = HarmonyTools.checkParameter(
      config['numberOfCommandsSentForVolumeControl'],
      1
    );
    this.activitiesToPublishAsInputForTVMode =
      config['activitiesToPublishAsInputForTVMode'];

    this.remoteOverrideCommandsList = config['remoteOverrideCommandsList'];

    if (Array.isArray(this.remoteOverrideCommandsList)) {
      this.log('INFO - remoteOverrideCommandsList is new format');
      const NewRemoteOverrideCommandsList = {};
      this.remoteOverrideCommandsList.forEach(x => {
        var commands = {};
        x.CommandsList.forEach(y => (commands[y.CommandName] = y.NewCommand));
        NewRemoteOverrideCommandsList[x.ActivityName] = commands;
      });
      this.remoteOverrideCommandsList = NewRemoteOverrideCommandsList;
    }

    this.log.debug(
      'INFO - remoteOverrideCommandsList is : ' +
        JSON.stringify(this.remoteOverrideCommandsList)
    );

    if (
      !this.addAllActivitiesToSkippedIfSameStateActivitiesList &&
      !this.skippedIfSameStateActivities
    ) {
      this.skippedIfSameStateActivities = ['PowerOff'];
    }

    this.log.debug(
      '(' +
        this.name +
        ')' +
        '(' +
        this.name +
        ')' +
        'INFO - playPause option set to ' +
        this.playPauseBehavior
    );
    this.playStatus = {};
    this.volumesLevel = {};

    this.prefsDir = api.user.storagePath();
    // check if prefs directory ends with a /, if not then add it
    if (this.prefsDir.endsWith('/') === false) {
      this.prefsDir = this.prefsDir + '/';
    }

    this.savedNamesFile =
      this.prefsDir +
      'harmonyPluginNames_' +
      this.name +
      '_' +
      this.hubIP.split('.').join('');
    this.savedVisibilityFile =
      this.prefsDir +
      'harmonyPluginVisibility_' +
      this.name +
      '_' +
      this.hubIP.split('.').join('');

    this.savedNames = {};
    try {
      this.savedNames = JSON.parse(fs.readFileSync(this.savedNamesFile));
    } catch (err) {
      this.log.debug(
        '(' + this.name + ')' + 'INFO - input names file does not exist'
      );
    }

    this.savedVisibility = {};
    try {
      this.savedVisibility = JSON.parse(
        fs.readFileSync(this.savedVisibilityFile)
      );
    } catch (err) {
      this.log.debug(
        '(' + this.name + ')' + 'INFO - input visibility file does not exist'
      );
    }
  }

  this.isPlatformWithSwitch = HarmonyTools.isPlatformWithSwitch(config);

  if (this.isPlatformWithSwitch) {
    this.showTurnOffActivity = HarmonyTools.checkTurnOffActivityOption(
      config['showTurnOffActivity']
    );

    this.publishSwitchActivitiesAsIndividualAccessories = HarmonyTools.checkParameter(
      config['publishSwitchActivitiesAsIndividualAccessories'],
      true
    );

    this.activitiesToPublishAsAccessoriesSwitch =
      config['activitiesToPublishAsAccessoriesSwitch'];

    this.switchAccessories = config['switchAccessories'];
    if (
      !this.switchAccessories &&
      !this.activitiesToPublishAsAccessoriesSwitch
    ) {
      this.activitiesToPublishAsAccessoriesSwitch = [];
    }
  }

  this._confirmedAccessories = [];
  this._confirmedServices = [];
}

HarmonySubPlatform.prototype = {
  //MAIN METHODS

  onMessage(newActivity) {
    this.refreshCurrentActivity(newActivity);
  },

  readAccessories: function(data, homedata) {
    let accessoriesToAdd = [];
    if (this.TVAccessory)
      accessoriesToAdd.push.apply(
        accessoriesToAdd,
        this.readTVAccessories(data)
      );

    if (this.isPlatformWithSwitch)
      accessoriesToAdd.push.apply(
        accessoriesToAdd,
        this.readSwitchAccessories(data)
      );

    this.harmonyBase.setupFoundAccessories(
      this,
      accessoriesToAdd,
      data,
      homedata
    );
  },

  readSwitchAccessories: function(data) {
    let activities = data.data.activity;

    let accessoriesToAdd = [];
    var myHarmonyAccessory;
    let name = (this.devMode ? 'DEV' : '') + 'Switch';

    if (!this.publishSwitchActivitiesAsIndividualAccessories) {
      myHarmonyAccessory = this.harmonyBase.checkAccessory(this, name);
      if (!myHarmonyAccessory) {
        myHarmonyAccessory = this.harmonyBase.createAccessory(this, name);
        accessoriesToAdd.push(myHarmonyAccessory);
      }
      myHarmonyAccessory.category = Accessory.Categories.SWITCH;
      this._confirmedAccessories.push(myHarmonyAccessory);
    }

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showActivity(activities[i])) {
        let switchName = this.devMode
          ? 'DEV' + activities[i].label
          : activities[i].label;

        if (this.publishSwitchActivitiesAsIndividualAccessories) {
          //Handle special case
          if (switchName === 'TV') switchName = 'TV-Switch';

          myHarmonyAccessory = this.harmonyBase.checkAccessory(
            this,
            switchName
          );
          if (!myHarmonyAccessory) {
            myHarmonyAccessory = this.harmonyBase.createAccessory(
              this,
              switchName
            );
            accessoriesToAdd.push(myHarmonyAccessory);
          }
          myHarmonyAccessory.category = Accessory.Categories.SWITCH;
          this._confirmedAccessories.push(myHarmonyAccessory);
        }

        this.log(
          '(' + this.name + ')' + 'INFO - Discovered Activity : ' + switchName
        );
        let subType = switchName;
        let service = this.harmonyBase.getSwitchService(
          this,
          myHarmonyAccessory,
          switchName,
          subType
        );

        service.activityId = activities[i].id;
        service.type = HarmonyConst.ACTIVITY_TYPE;
        this._confirmedServices.push(service);

        this.bindCharacteristicEventsForSwitch(myHarmonyAccessory, service);
      }
    }

    return accessoriesToAdd;
  },

  readTVAccessories: function(data) {
    let activities = data.data.activity;
    let accessoriesToAdd = [];
    let name = (this.devMode ? 'DEV' : '') + 'TV';

    myHarmonyAccessory = this.harmonyBase.checkAccessory(this, name);

    if (!myHarmonyAccessory) {
      myHarmonyAccessory = this.harmonyBase.createAccessory(this, name);
      accessoriesToAdd.push(myHarmonyAccessory);
    }

    myHarmonyAccessory.category = Accessory.Categories.TELEVISION;
    this._confirmedAccessories.push(myHarmonyAccessory);

    this.log('(' + this.name + ')' + 'INFO - configuring Main TV Service');
    this.configureMainService(myHarmonyAccessory);

    let mainActivityConfigured = false;
    let defaultActivity = undefined;

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showInput(activities[i])) {
        let inputName = this.devMode
          ? 'DEV' + activities[i].label
          : activities[i].label;
        let inputId = activities[i].id;

        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - accessories : activity to configure : ' +
            inputName
        );

        if (this.mainActivity == inputName) {
          this.configureMainActivity(myHarmonyAccessory, activities[i]);
          mainActivityConfigured = true;
        } else if (defaultActivity == undefined) {
          defaultActivity = activities[i];
        }

        let inputSourceService = this.configureInputSourceService(
          myHarmonyAccessory,
          inputName,
          inputId,
          activities[i]
        );

        this.mainService.addLinkedService(inputSourceService);
        this.inputServices.push(inputSourceService);
      }
    }

    if (!mainActivityConfigured) {
      this.log(
        '(' +
          this.name +
          ')' +
          'WARNING - No main Activity that match config file found, default to first one'
      );
      if (defaultActivity == undefined)
        this.log(
          '(' +
            this.name +
            ')' +
            'ERROR - No  Activity at all was found for this TV accessory'
        );
      else this.configureMainActivity(myHarmonyAccessory, defaultActivity);
    }

    this.bindCharacteristicEventsForInputs(myHarmonyAccessory);

    return accessoriesToAdd;
  },

  //TV METHODS

  configureMainService: function(accessory) {
    let subType = this.name + ' TV';
    this.mainService = accessory.getServiceByUUIDAndSubType(this.name, subType);

    if (!this.mainService) {
      this.log('(' + this.name + ')' + 'INFO - Creating TV Service');
      this.mainService = new Service.Television(
        this.name,
        'tvService' + this.name
      );
      this.mainService.subtype = subType;
      accessory.addService(this.mainService);
    }
    this._confirmedServices.push(this.mainService);

    if (this.savedNames && this.savedNames[0]) {
      mainServiceName = this.savedNames[0];
    } else {
      mainServiceName = this.name;
    }

    this.mainService
      .setCharacteristic(Characteristic.ConfiguredName, mainServiceName)
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      )
      .setCharacteristic(Characteristic.ActiveIdentifier, -1)
      .setCharacteristic(Characteristic.Active, false);

    this.bindCharacteristicEventsForTV(accessory);

    this.inputServices = [];
    this.log.debug(
      '(' +
        this.name +
        ')' +
        'INFO - accessories : main activity name : ' +
        this.mainActivity
    );
  },

  configureMainActivity: function(accessory, activity) {
    let inputName = activity.label;
    if (this.devMode) {
      inputName = 'DEV' + inputName;
    }
    this.log(
      '(' + this.name + ')' + 'INFO - Configuring Main Activity ' + inputName
    );

    this.mainActivityId = activity.id;
    this.mainService.activityName = inputName;
    this.mainService.activityId = activity.id;

    let subType = this.name + ' Volume';
    this.tvSpeakerService = accessory.getServiceByUUIDAndSubType(
      this.name,
      subType
    );

    if (!this.tvSpeakerService) {
      this.log('(' + this.name + ')' + 'INFO - Creating TV Speaker Service');
      this.tvSpeakerService = new Service.TelevisionSpeaker(
        this.name,
        'TVSpeaker' + this.name
      );
      this.tvSpeakerService.subtype = subType;
      accessory.addService(this.tvSpeakerService);
    }
    this._confirmedServices.push(this.tvSpeakerService);

    this.tvSpeakerService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(
        Characteristic.VolumeControlType,
        Characteristic.VolumeControlType.ABSOLUTE
      );

    this.bindCharacteristicEventsForSpeaker(this.tvSpeakerService);

    this.mainService.addLinkedService(this.tvSpeakerService);
  },

  configureInputSourceService: function(
    accessory,
    inputName,
    inputId,
    activity
  ) {
    let subType = inputName + ' Activity';
    let inputSourceService = accessory.getServiceByUUIDAndSubType(
      this.name,
      subType
    );

    if (!inputSourceService) {
      this.log(
        '(' + this.name + ')' + 'INFO - Creating Input Service - ' + inputName
      );
      inputSourceService = new Service.InputSource(
        this.name,
        'Input' + this.name + inputName
      );
      inputSourceService.subtype = subType;
      accessory.addService(inputSourceService);
    }

    this._confirmedServices.push(inputSourceService);

    inputSourceService.activityName = inputName;
    inputSourceService.activityId = inputId;

    let controlGroup = activity.controlGroup;

    HarmonyAsTVKeysTools.mapKeys(
      this,
      controlGroup,
      inputName,
      inputSourceService
    );

    if (this.savedNames && this.savedNames[inputId]) {
      inputServiceName = this.savedNames[inputId];
    } else {
      inputServiceName = inputName;
    }

    inputSourceService
      .setCharacteristic(Characteristic.Identifier, inputId)
      .setCharacteristic(Characteristic.Name, inputName)
      .setCharacteristic(Characteristic.ConfiguredName, inputServiceName)
      .setCharacteristic(
        Characteristic.InputSourceType,
        Characteristic.InputSourceType.APPLICATION
      )
      .setCharacteristic(
        Characteristic.IsConfigured,
        Characteristic.IsConfigured.CONFIGURED
      );

    return inputSourceService;
  },

  showInput: function(activity) {
    if (
      activity.id != -1 &&
      this.activitiesToPublishAsInputForTVMode &&
      !this.activitiesToPublishAsInputForTVMode.includes(activity.label)
    )
      return false;
    else return activity.id != -1;
  },

  ///REFRESHING TOOLS

  handleRefreshOfCharacteristic() {
    this.updateCurrentInputService();

    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.getCharacteristic(Characteristic.Active),
      this._currentInputService !== undefined,
      null
    );

    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.getCharacteristic(Characteristic.ActiveIdentifier),
      this._currentInputService !== undefined
        ? this._currentInputService.activityId
        : -1,
      null
    );
  },

  localRefresh: function() {
    //TV
    if (this.TVAccessory) this.handleRefreshOfCharacteristic();

    //SWITCH ACTIVITIEs
    if (this.isPlatformWithSwitch) {
      for (let a = 0; a < this._foundAccessories.length; a++) {
        let myHarmonyAccessory = this._foundAccessories[a];
        for (let s = 0; s < myHarmonyAccessory.services.length; s++) {
          let service = myHarmonyAccessory.services[s];
          if (service.type == HarmonyConst.ACTIVITY_TYPE)
            this.refreshService(service, undefined);
        }
      }
    }
  },

  refreshPlatform: function() {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      this.harmonyBase.refreshHomeAccessory(this);
    });
  },

  updateCurrentInputService: function() {
    if (this._currentActivity > 0) {
      let inputFound = false;
      for (let i = 0, len = this.inputServices.length; i < len; i++) {
        if (this.inputServices[i].activityId == this._currentActivity) {
          this._currentInputService = this.inputServices[i];
          inputFound = true;
          break;
        }
      }
      if (!inputFound) {
        this._currentInputService = undefined;
      }
    } else {
      this._currentInputService = undefined;
    }

    this.keysMap = HarmonyAsTVKeysTools.mapKeysForActivity(this);
  },

  refreshCurrentActivity: function(response) {
    if (!response) return;

    this._currentActivity = response;
    this._currentActivityLastUpdate = Date.now();
    this.localRefresh();
  },

  refreshService: function(service, callback) {
    var characteristic = service.getCharacteristic(Characteristic.On);

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this.checkOn(service);

        this.log.debug(
          '(' +
            this.name +
            ')' +
            'Got status for ' +
            service.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        this.harmonyBase.handleCharacteristicUpdate(
          this,
          characteristic,
          characteristicIsOn,
          callback
        );
      } else {
        this.log.debug('(' + this.name + ')' + 'WARNING : no current Activity');
        this.harmonyBase.handleCharacteristicUpdate(
          this,
          characteristic,
          characteristic.value,
          callback
        );
      }
    });
  },

  ///COMANDS
  sendInputCommand: function(homebridgeAccessory, value) {
    let doCommand = true;
    let commandToSend = value;

    let inputName = commandToSend == -1 ? 'PowerOff' : '';

    for (let i = 0, len = this.inputServices.length; i < len; i++) {
      if (this.inputServices[i].activityId == commandToSend) {
        inputName = this.inputServices[i].activityName;
        break;
      }
    }

    if (HarmonyTools.isActivtyToBeSkipped(this, inputName)) {
      //GLOBAL OFF SWITCH : do command only if we are not off
      if (commandToSend == -1) {
        doCommand = this._currentActivity > 0;
      }
      //ELSE, we do the command only if state is different.
      else {
        doCommand = this._currentActivity !== value;
      }
    }

    if (doCommand) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO - sendInputCommand : Activty ' +
          inputName +
          ' will be activated '
      );
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO - sendInputCommand : Activty ' +
          inputName +
          ' will not be activated '
      );
    }

    if (doCommand) {
      this.activityCommand(homebridgeAccessory, commandToSend);
    } else {
      var that = this;
      setTimeout(function() {
        that.refreshPlatform();
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  handlePlayPause: function() {
    this.log.debug(
      '(' +
        this.name +
        ')' +
        'INFO - current play status is : ' +
        this.playStatus[this._currentActivity] +
        ' with playPause option set to :' +
        this.playPauseBehavior
    );
    this.log.debug(
      '(' +
        this.name +
        ')' +
        'INFO - pauseCommand defined for  : ' +
        this._currentActivity +
        ' is ' +
        this._currentInputService.PauseCommand
    );

    if (
      !this.playPauseBehavior ||
      this._currentInputService.PauseCommand === undefined ||
      this.playStatus[this._currentActivity] === undefined ||
      this.playStatus[this._currentActivity] === 'PAUSED'
    ) {
      this.log.debug(
        '(' + this.name + ')' + 'INFO - sending PlayCommand for PLAY_PAUSE'
      );
      this.harmonyBase.sendCommand(
        this,
        this.keysMap[Characteristic.RemoteKey.PLAY_PAUSE]
      );
      this.playStatus[this._currentActivity] = '';
    } else {
      this.log.debug(
        '(' + this.name + ')' + 'INFO - sending PauseCommand for PLAY_PAUSE'
      );
      this.harmonyBase.sendCommand(
        this,
        HarmonyAsTVKeysTools.getOverrideCommand(
          this,
          'PAUSE',
          this._currentInputService.PauseCommand
        )
      );
      this.playStatus[this._currentActivity] = 'PAUSED';
    }
  },

  //HOMEKIT CHARACTERISTICS EVENTS

  refreshCharacteristic: function(characteristic, callback) {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        if (characteristic.UUID == Characteristic.Active.UUID) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - refreshCharacteristic : updating Characteristic.Active to ' +
              (this._currentInputService !== undefined)
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            this._currentInputService !== undefined,
            callback
          );
        } else if (
          characteristic.UUID == Characteristic.ActiveIdentifier.UUID
        ) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - refreshCharacteristic : updating Characteristic.ActiveIdentifier to ' +
              (this._currentInputService !== undefined
                ? this._currentInputService.activityId
                : -1)
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            this._currentInputService !== undefined
              ? this._currentInputService.activityId
              : -1,
            callback
          );
        }
      } else {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'WARNING - refreshCharacteristic : no current Activity'
        );
        if (characteristic.UUID == Characteristic.Active.UUID) {
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            false,
            callback
          );
        } else if (
          characteristic.UUID == Characteristic.ActiveIdentifier.UUID
        ) {
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            -1,
            callback
          );
        }
      }
    });
  },

  bindActiveCharacteristic(characteristic, service, homebridgeAccessory) {
    //set to main activity / activeIdentifier or off

    characteristic.on(
      'set',
      function(value, callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - SET Characteristic.Active ' + value
        );
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - value of Characteristic.ActiveIdentifier ' +
            service.getCharacteristic(Characteristic.ActiveIdentifier).value
        );

        if (value == 0) {
          this.log.debug('(' + this.name + ')' + 'INFO - switching off');
          this.sendInputCommand(homebridgeAccessory, '-1');

          callback(null);
        } else {
          //we push back the execution to let the second event be taken care of in case of switching on with a dedicated input.
          setTimeout(() => {
            if (this._currentInputService == undefined) {
              var currentActivity = service.getCharacteristic(
                Characteristic.ActiveIdentifier
              ).value;

              if (currentActivity <= 0) {
                this.log.debug(
                  '(' +
                    this.name +
                    ')' +
                    'INFO - launching with default Activity - ' +
                    this.mainActivityId
                );
                this.sendInputCommand(
                  homebridgeAccessory,
                  '' + this.mainActivityId
                );
              } else {
                this.log.debug(
                  '(' +
                    this.name +
                    ')' +
                    'INFO - not launching, an activeinput is set - ' +
                    this.mainActivityId
                );
              }
            } else {
              this.log.debug(
                '(' +
                  this.name +
                  ')' +
                  'INFO - not launching, there is a current Activity defined -' +
                  this.mainActivityId
              );
            }
            callback(null);
          }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
        }
      }.bind(this)
    );

    characteristic.on(
      'get',
      function(callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - GET Characteristic.Active '
        );
        this.refreshCharacteristic(characteristic, callback);
      }.bind(this)
    );
  },

  bindActiveIdentifierCharacteristic: function(
    characteristic,
    homebridgeAccessory
  ) {
    //set the current Activity
    characteristic.on(
      'set',
      function(value, callback) {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - SET Characteristic.ActiveIdentifier ' +
            value
        );
        this.sendInputCommand(homebridgeAccessory, '' + value);
        callback(null);
      }.bind(this)
    );
    characteristic.on(
      'get',
      function(callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - GET Characteristic.ActiveIdentifier'
        );
        this.refreshCharacteristic(characteristic, callback);
      }.bind(this)
    );
  },

  bindRemoteKeyCharacteristic: function(characteristic) {
    characteristic.on(
      'set',
      function(newValue, callback) {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - SET Characteristic.RemoteKey : ' +
            newValue +
            ' with currentActivity ' +
            this._currentActivity
        );

        if (this._currentActivity > 0) {
          if (newValue === Characteristic.RemoteKey.PLAY_PAUSE) {
            this.handlePlayPause();
          } else if (this.keysMap[newValue]) {
            this.log.debug(
              '(' + this.name + ')' + 'INFO - sending command for ' + newValue
            );
            this.harmonyBase.sendCommand(this, this.keysMap[newValue]);
          } else {
            this.log.debug(
              '(' +
                this.name +
                ')' +
                'INFO - no command to send for ' +
                newValue
            );
          }
        }
        callback(null);
      }.bind(this)
    );
  },

  bindMuteCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentInputService !== undefined) {
          this.log.debug(
            '(' + this.name + ')' + 'INFO - SET Characteristic.Mute : ' + value
          );
          this.harmonyBase.sendCommand(
            this,
            HarmonyAsTVKeysTools.getOverrideCommand(
              this,
              'MUTE',
              this._currentInputService.MuteCommand
            )
          );
        }
        callback(null);
      }.bind(this)
    );

    characteristic.on(
      'get',
      function(callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - GET Characteristic.Mute'
        );
        callback(null, false);
      }.bind(this)
    );
  },

  bindVolumeSelectorCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentInputService !== undefined) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - SET Characteristic.VolumeSelector : ' +
              value
          );
          if (value === Characteristic.VolumeSelector.DECREMENT) {
            for (
              let i = 0, len = this.numberOfCommandsSentForVolumeControl;
              i < len;
              i++
            ) {
              this.harmonyBase.sendCommand(
                this,
                HarmonyAsTVKeysTools.getOverrideCommand(
                  this,
                  'VOLUME_DOWN',
                  this._currentInputService.VolumeDownCommand
                )
              );
            }
          } else {
            for (
              let i = 0, len = this.numberOfCommandsSentForVolumeControl;
              i < len;
              i++
            ) {
              this.harmonyBase.sendCommand(
                this,
                HarmonyAsTVKeysTools.getOverrideCommand(
                  this,
                  'VOLUME_UP',
                  this._currentInputService.VolumeUpCommand
                )
              );
            }
          }
        }
        callback(null);
      }.bind(this)
    );
  },

  bindVolumeCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentActivity > 0) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - SET Characteristic.Volume : ' +
              value
          );
          this.volumesLevel[this._currentActivity] = value;
        }
        callback(null);
      }.bind(this)
    );

    characteristic.on(
      'get',
      function(callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - GET Characteristic.Volume'
        );

        if (this.volumesLevel[this._currentActivity])
          callback(null, this.volumesLevel[this._currentActivity]);
        else callback(null, HarmonyConst.DEFAULT_VOLUME);
      }.bind(this)
    );
  },

  bindConfiguredNameCharacteristic: function(characteristic, service) {
    characteristic.on(
      'set',
      function(value, callback) {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - SET Characteristic.ConfiguredName : ' +
            value
        );
        let idConf = 0;
        if (service.UUID == Service.InputSource.UUID)
          idConf = service.activityId;

        this.savedNames[idConf] = value;
        fs.writeFile(
          this.savedNamesFile,
          JSON.stringify(this.savedNames),
          err => {
            if (err) {
              this.log(
                '(' +
                  this.name +
                  ')' +
                  'ERROR - error occured could not write configured name %s',
                err
              );
            } else {
              this.log.debug(
                '(' +
                  this.name +
                  ')' +
                  'INFO - configured name successfully saved! New name: %s ID: %s',
                value,
                idConf
              );
            }
          }
        );

        callback(null);
      }.bind(this)
    );
  },

  bindCurrentVisibilityStateCharacteristic: function(characteristic, service) {
    characteristic.on(
      'get',
      function(callback) {
        let idConf = service.activityId;
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - GET Characteristic.CurrentVisibilityState : ' +
            (this.savedVisibility[idConf]
              ? this.savedVisibility[idConf]
              : 'DEFAULT - ' + Characteristic.TargetVisibilityState.SHOWN)
        );
        if (this.savedVisibility[idConf])
          callback(null, this.savedVisibility[idConf]);
        else callback(null, Characteristic.CurrentVisibilityState.SHOWN);
      }.bind(this)
    );
  },

  bindTargetVisibilityStateCharacteristic(characteristic, service) {
    characteristic.on(
      'get',
      function(callback) {
        let idConf = service.activityId;
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - GET Characteristic.TargetVisibilityState : ' +
            (this.savedVisibility[idConf]
              ? this.savedVisibility[idConf]
              : 'DEFAULT - ' + Characteristic.TargetVisibilityState.SHOWN)
        );
        if (this.savedVisibility[idConf])
          callback(null, this.savedVisibility[idConf]);
        else callback(null, Characteristic.TargetVisibilityState.SHOWN);
      }.bind(this)
    );

    characteristic.on(
      'set',
      function(value, callback) {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - SET Characteristic.TargetVisibilityState : ' +
            value
        );

        let idConf = service.activityId;

        let oldValue = this.savedVisibility[idConf]
          ? this.savedVisibility[idConf]
          : Characteristic.CurrentVisibilityState.SHOWN;
        this.savedVisibility[idConf] = value;
        fs.writeFile(
          this.savedVisibilityFile,
          JSON.stringify(this.savedVisibility),
          err => {
            if (err) {
              this.savedVisibility[idConf] = oldValue;
              this.log(
                '(' +
                  this.name +
                  ')' +
                  'ERROR - error occured could not write visibility state %s',
                err
              );
            } else {
              this.log.debug(
                '(' +
                  this.name +
                  ')' +
                  'INFO - configured visibility successfully saved! New visibility: %s ID: %s',
                value,
                idConf
              );
            }

            service
              .getCharacteristic(Characteristic.CurrentVisibilityState)
              .updateValue(this.savedVisibility[idConf]);

            callback(null);
          }
        );
      }.bind(this)
    );
  },

  bindPowerModeSelectionCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentInputService !== undefined) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - SET Characteristic.PowerModeSelection : ' +
              value
          );
          this.harmonyBase.sendCommand(
            this,
            HarmonyAsTVKeysTools.getOverrideCommand(
              this,
              'SETUP',
              this._currentInputService.SetupCommand
            )
          );
        }
        callback(null);
      }.bind(this)
    );
  },

  bindCharacteristicEventsForTV: function(homebridgeAccessory) {
    this.bindActiveCharacteristic(
      this.mainService.getCharacteristic(Characteristic.Active),
      this.mainService,
      homebridgeAccessory
    );

    this.bindActiveIdentifierCharacteristic(
      this.mainService.getCharacteristic(Characteristic.ActiveIdentifier),
      homebridgeAccessory
    );

    this.bindRemoteKeyCharacteristic(
      this.mainService.getCharacteristic(Characteristic.RemoteKey)
    );

    this.bindPowerModeSelectionCharacteristic(
      this.mainService.getCharacteristic(Characteristic.PowerModeSelection)
    );

    this.bindConfiguredNameCharacteristic(
      this.mainService.getCharacteristic(Characteristic.ConfiguredName),
      this.mainService
    );
  },

  bindCharacteristicEventsForSpeaker: function() {
    this.bindMuteCharacteristic(
      this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
    );
    this.bindVolumeSelectorCharacteristic(
      this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
    );
    this.bindVolumeCharacteristic(
      this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
    );
  },

  bindCharacteristicEventsForInputs: function() {
    for (let i = 0, len = this.inputServices.length; i < len; i++) {
      this.bindConfiguredNameCharacteristic(
        this.inputServices[i].getCharacteristic(Characteristic.ConfiguredName),
        this.inputServices[i]
      );

      this.bindCurrentVisibilityStateCharacteristic(
        this.inputServices[i].getCharacteristic(
          Characteristic.CurrentVisibilityState
        ),
        this.inputServices[i]
      );

      this.bindTargetVisibilityStateCharacteristic(
        this.inputServices[i].getCharacteristic(
          Characteristic.TargetVisibilityState
        ),
        this.inputServices[i]
      );
    }
  },

  //SWITCHES METHODS

  showActivity: function(activity) {
    if (
      activity.id != -1 &&
      this.activitiesToPublishAsAccessoriesSwitch &&
      !this.activitiesToPublishAsAccessoriesSwitch.includes(activity.label)
    )
      return false;
    else return activity.id != -1 || this.showTurnOffActivity;
  },

  checkOn(service) {
    this.log.debug(
      '(' +
        this.name +
        ')' +
        'checkOn : ' +
        this._currentActivity +
        '/' +
        service.activityId +
        '/' +
        (this.showTurnOffActivity == 'inverted') +
        '/' +
        (this.showTurnOffActivity == 'stateless')
    );
    if (service.activityId == -1) {
      if (
        this._currentActivity == -1 &&
        (this.showTurnOffActivity == 'inverted' ||
          this.showTurnOffActivity == 'stateless')
      ) {
        return false;
      }
      if (
        this._currentActivity != -1 &&
        this.showTurnOffActivity == 'inverted'
      ) {
        return true;
      }
    }

    return this._currentActivity == service.activityId;
  },

  handleActivityOk: function(commandToSend) {
    this._currentSetAttemps = 0;
    this._currentActivity = commandToSend;
    this._currentActivityLastUpdate = Date.now();

    for (let a = 0; a < this._foundAccessories.length; a++) {
      let foundHarmonyAccessory = this._foundAccessories[a];
      for (let s = 0; s < foundHarmonyAccessory.services.length; s++) {
        let otherService = foundHarmonyAccessory.services[s];

        if (otherService.type == HarmonyConst.ACTIVITY_TYPE) {
          let characteristic = otherService.getCharacteristic(
            Characteristic.On
          );

          HarmonyTools.disablePreviousActivity(
            this,
            characteristic,
            otherService,
            commandToSend,
            characteristic.value
          );
          HarmonyTools.handleOffActivity(
            this,
            characteristic,
            otherService,
            commandToSend
          );
        }
      }
    }
  },

  getService: function(homebridgeAccessory, idToFind) {
    var service;
    for (let a = 0; a < homebridgeAccessory.services.length; a++) {
      if (homebridgeAccessory.services[a].ActivityId == idToFind) {
        service = homebridgeAccessory.services[a];
        this.log.debug(
          '(' + this.name + ')' + 'INFO - ' + service.displayName + ' activated'
        );
        break;
      }
    }
    return service;
  },

  handleActivityInProgress: function(homebridgeAccessory, commandToSend) {
    this._currentSetAttemps = this._currentSetAttemps + 1;

    //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
    var that = this;
    setTimeout(function() {
      if (that._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE) {
        that.log.debug(
          '(' +
            that.name +
            ')' +
            'INFO - activityCommand : RETRY to send command ' +
            commandToSend
        );
        that.activityCommand(homebridgeAccessory, commandToSend);
      } else {
        that.log(
          '(' +
            that.name +
            ')' +
            'ERROR - activityCommand : could not SET status, no more RETRY : ' +
            commandToSend
        );
        that.refreshPlatform();
      }
    }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
  },

  activityCommand: function(homebridgeAccessory, commandToSend) {
    this.harmonyBase.harmony
      .startActivity(commandToSend)
      .then(data => {
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - activityCommand : Returned from hub ' +
            JSON.stringify(data)
        );

        if (HarmonyTools.isCommandOk(data)) {
          this.handleActivityOk(commandToSend);
          if (this.TVAccessory) this.handleRefreshOfCharacteristic();
        } else if (HarmonyTools.isCommandInProgress(data)) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'WARNING - activityCommand : could not SET status : ' +
              JSON.stringify(data)
          );
          this.handleActivityInProgress(homebridgeAccessory, commandToSend);
        } else {
          this.log(
            '(' +
              this.name +
              ')' +
              'ERROR - activityCommand : could not SET status, no data'
          );
        }
      })
      .catch(e => {
        this.log('(' + this.name + ')' + 'ERROR - activityCommand : ' + e);
      });
  },

  setSwitchOnCharacteristic: function(
    homebridgeAccessory,
    characteristic,
    service,
    value,
    callback
  ) {
    let doCommand = true;
    let commandToSend = value ? service.activityId : '-1';
    let currentValue = characteristic.value;

    //Actitiy in skippedIfSameState
    if (HarmonyTools.isActivtyToBeSkipped(this, service.subtype)) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : SET on an activty in skippedIfsameState list ' +
          service.subtype
      );

      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' is ' +
          currentValue +
          ', wants to set to ' +
          value
      );

      //GLOBAL OFF SWITCH : do command only if it is off and we want to set it on since on state can't be reversed
      //ELSE, we do the command only if state is different.
      doCommand =
        service.activityId == -1
          ? (this.showTurnOffActivity == 'inverted' &&
              currentValue &&
              !value) ||
            (this.showTurnOffActivity != 'inverted' && !currentValue && value)
          : currentValue !== value;
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : SET on an activty not in skippedIfSameStateActivities list ' +
          service.subtype
      );
    }

    if (doCommand) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' will be sent command ' +
          commandToSend
      );
      this.activityCommand(homebridgeAccessory, commandToSend);
      callback();
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' will not be sent any command '
      );
      callback();
      setTimeout(function() {
        characteristic.updateValue(currentValue);
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  bindCharacteristicEventsForSwitch: function(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'set',
        function(value, callback) {
          this.setSwitchOnCharacteristic(
            homebridgeAccessory,
            service.getCharacteristic(Characteristic.On),
            service,
            value,
            callback
          );
        }.bind(this)
      )
      .on(
        'get',
        function(callback) {
          this.refreshService(service, callback);
        }.bind(this)
      );
  },
};
