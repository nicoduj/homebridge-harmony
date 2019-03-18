var Service, Characteristic;

const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');
const HarmonyTools = require('./harmonyTools.js');
const HarmonyAsTVKeysTools = require('./harmonyAsTVKeysTools.js');

const fs = require('fs');

module.exports = {
  HarmonyPlatformAsTVPlatform: HarmonyPlatformAsTVPlatform,
};

function HarmonyPlatformAsTVPlatform(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);

  this.mainActivity = config['mainActivity'];
  this.playPauseBehavior = HarmonyTools.checkParameter(
    config['playPauseBehavior'],
    false
  );

  this.remoteOverrideCommandsList = config['remoteOverrideCommandsList'];

  this.log.debug('INFO - playPause option set to ' + this.playPauseBehavior);
  this.playStatus = {};
  this.volumesLevel = {};

  this.prefsDir = api.user.storagePath();
  // check if prefs directory ends with a /, if not then add it
  if (this.prefsDir.endsWith('/') === false) {
    this.prefsDir = this.prefsDir + '/';
  }

  this.savedNamesFile =
    this.prefsDir + 'harmonyPluginNames_' + this.hubIP.split('.').join('');
  this.savedVisibilityFile =
    this.prefsDir + 'harmonyPluginVisibility_' + this.hubIP.split('.').join('');

  this.savedNames = {};
  try {
    this.savedNames = JSON.parse(fs.readFileSync(this.savedNamesFile));
  } catch (err) {
    this.log.debug('INFO - input names file does not exist');
  }

  this.savedVisibility = {};
  try {
    this.savedVisibility = JSON.parse(
      fs.readFileSync(this.savedVisibilityFile)
    );
  } catch (err) {
    this.log.debug('INFO - input visibility file does not exist');
  }
}

HarmonyPlatformAsTVPlatform.prototype = {
  onMessage(newActivity) {
    this.handleRefreshOfCharacteristic(newActivity);
  },

  ///CREATION / STARTUP

  configureMainService: function(accessory) {
    let subType = this.name + ' TV';
    this.mainService = accessory.getServiceByUUIDAndSubType(this.name, subType);

    if (!this.mainService) {
      this.log('INFO - Creating TV Service');
      this.mainService = new Service.Television(
        this.name,
        'tvService' + this.name
      );
      this.mainService.subtype = subType;
      accessory.addService(this.mainService);
    }

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
      'INFO - accessories : main activity name : ' + this.mainActivity
    );
  },

  configureMainActivity: function(accessory, activity) {
    let inputName = activity.label;
    if (this.devMode) {
      inputName = 'DEV' + inputName;
    }
    this.log('INFO - Configuring Main Activity ' + inputName);

    this.mainActivityId = activity.id;
    this.mainService.activityName = inputName;
    this.mainService.activityId = activity.id;

    let subType = this.name + ' Volume';
    this.tvSpeakerService = accessory.getServiceByUUIDAndSubType(
      this.name,
      subType
    );

    if (!this.tvSpeakerService) {
      this.log('INFO - Creating TV Speaker Service');
      this.tvSpeakerService = new Service.TelevisionSpeaker(
        this.name,
        'TVSpeaker' + this.name
      );
      this.tvSpeakerService.subtype = subType;
      accessory.addService(this.tvSpeakerService);
    }

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
      this.log('INFO - Creating Input Service - ' + inputName);
      inputSourceService = new Service.InputSource(
        this.name,
        'Input' + this.name + inputName
      );
      inputSourceService.subtype = subType;
      accessory.addService(inputSourceService);
    }

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

  readAccessories: function(data) {
    let activities = data.data.activity;

    let accessoriesToAdd = [];

    myHarmonyAccessory = this.harmonyBase.checkAccessory(this, this.name);
    if (!myHarmonyAccessory) {
      myHarmonyAccessory = this.harmonyBase.createAccessory(this, this.name);
      accessoriesToAdd.push(myHarmonyAccessory);
    }

    this.log('INFO - configuring Main TV Service');
    this.configureMainService(myHarmonyAccessory);

    let mainActivityConfigured = false;

    for (let i = 0, len = activities.length; i < len; i++) {
      if (activities[i].id != -1) {
        let inputName = this.devMode
          ? 'DEV' + activities[i].label
          : activities[i].label;
        let inputId = activities[i].id;

        this.log.debug(
          'INFO - accessories : activity to configure : ' + inputName
        );

        if (this.mainActivity == inputName) {
          this.configureMainActivity(myHarmonyAccessory, activities[i]);
          mainActivityConfigured = true;
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
        'WARNING - No main Activity that match config file found, default to first one'
      );
      this.configureMainActivity(myHarmonyAccessory, activities[0]);
    }

    this.bindCharacteristicEventsForInputs(myHarmonyAccessory);

    //creating accessories
    this.harmonyBase.addAccesories(this, accessoriesToAdd);

    this.harmonyBase.getDevicesAccessories(this, data);
    this.harmonyBase.getSequencesAccessories(this, data);

    //first refresh
    var that = this;
    setTimeout(function() {
      that.refreshAccessory();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);
  },

  //ask for retrieving info from hub
  loadAccessories: function() {
    this.harmonyBase.configureAccessories(this);
  },

  //Cache call method
  configureAccessory: function(accessory) {
    this.log(accessory.displayName, 'Configure Accessory');
    this._foundAccessories.push(accessory);
  },

  ///REFRESHING TOOLS

  handleRefreshOfCharacteristic(activity) {
    this.updateCurrentInputService(activity);

    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.controlService.getCharacteristic(Characteristic.Active),
      this._currentActivity > 0,
      null
    );
    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.controlService.getCharacteristic(
        Characteristic.ActiveIdentifier
      ),
      this._currentActivity,
      null
    );
  },

  refreshAccessory: function() {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      this.handleRefreshOfCharacteristic(this._currentActivity);
    });
  },

  refreshCharacteristic: function(characteristic, callback) {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        if (characteristic.UUID == Characteristic.Active.UUID) {
          this.log.debug(
            'INFO - refreshCharacteristic : updating Characteristic.Active to ' +
              (this._currentActivity != -1)
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            this._currentActivity > 0,
            callback
          );
        } else if (
          characteristic.UUID == Characteristic.ActiveIdentifier.UUID
        ) {
          this.log.debug(
            'INFO - refreshCharacteristic : updating Characteristic.ActiveIdentifier to ' +
              this._currentActivity
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            this._currentActivity,
            callback
          );
        }
      } else {
        this.log.debug('WARNING - refreshCharacteristic : no current Activity');
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

  refreshCurrentActivity: function(response) {
    this.updateCurrentInputService(response);
  },

  updateCurrentInputService: function(newActivity) {
    if (!newActivity) return;

    this._currentActivity = newActivity;
    this._currentActivityLastUpdate = Date.now();

    if (this._currentActivity > 0) {
      for (let i = 0, len = this.inputServices.length; i < len; i++) {
        if (this.inputServices[i].activityId == this._currentActivity) {
          this._currentInputService = this.inputServices[i];
          break;
        }
      }
    } else {
      this._currentInputService = -1;
    }

    this.keysMap = HarmonyAsTVKeysTools.mapKeysForActivity(this);
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
        'INFO - sendInputCommand : Activty ' + inputName + ' will be activated '
      );
    } else {
      this.log.debug(
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
        that.refreshAccessory();
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  activityCommand: function(homebridgeAccessory, commandToSend) {
    this.harmonyBase.harmony.startActivity(commandToSend).then(data => {
      if (
        data &&
        data.code &&
        data.code == 200 &&
        data.msg &&
        data.msg == 'OK'
      ) {
        this._currentSetAttemps = 0;

        this.log.debug('INFO - activityCommand : command sent');
        this.handleRefreshOfCharacteristic(commandToSend);
      } else if (data && (data.code == 202 || data.code == 100)) {
        this._currentSetAttemps = this._currentSetAttemps + 1;
        //get characteristic
        this.log.debug(
          'WARNING - activityCommand : could not SET status : ' +
            JSON.stringify(data)
        );

        //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
        var that = this;
        setTimeout(function() {
          if (
            that._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE
          ) {
            that.log.debug(
              'INFO - activityCommand : RETRY to send command ' + commandToSend
            );
            that.activityCommand(homebridgeAccessory, commandToSend);
          } else {
            that.log(
              'ERROR - activityCommand : could not SET status, no more RETRY : ' +
                commandToSend
            );
            that.refreshAccessory();
          }
        }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
      }
    });
  },

  handlePlayPause: function() {
    this.log.debug(
      'INFO - current play status is : ' +
        this.playStatus[this._currentActivity] +
        ' with playPause option set to :' +
        this.playPauseBehavior
    );
    this.log.debug(
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
      this.log.debug('INFO - sending PlayCommand for PLAY_PAUSE');
      this.harmonyBase.sendCommand(
        this,
        this.keysMap[Characteristic.RemoteKey.PLAY_PAUSE]
      );
      this.playStatus[this._currentActivity] = '';
    } else {
      this.log.debug('INFO - sending PauseCommand for PLAY_PAUSE');
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

  bindActiveCharacteristic(characteristic, service, homebridgeAccessory) {
    //set to main activity / activeIdentifier or off

    characteristic.on(
      'set',
      function(value, callback) {
        this.log.debug('INFO - SET Characteristic.Active ' + value);

        if (value == 0) {
          this.log.debug('INFO - switching off');
          this.sendInputCommand(homebridgeAccessory, '-1');

          callback(null);
        } else {
          this.harmonyBase.refreshCurrentActivity(this, () => {
            if (this._currentActivity < 0) {
              let activityToLaunch = service.getCharacteristic(
                Characteristic.ActiveIdentifier
              ).value;
              this.log.debug(
                'INFO - current Activity to launch - ' + activityToLaunch
              );
              if (!activityToLaunch) {
                activityToLaunch = this.mainActivityId;
              }
              this.sendInputCommand(homebridgeAccessory, '' + activityToLaunch);
            }
            callback(null);
          });
        }
      }.bind(this)
    );

    characteristic.on(
      'get',
      function(callback) {
        this.log.debug('INFO - GET Characteristic.Active ');
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
        this.log.debug('INFO - SET Characteristic.ActiveIdentifier ' + value);
        this.sendInputCommand(homebridgeAccessory, '' + value);
        callback(null);
      }.bind(this)
    );
    characteristic.on(
      'get',
      function(callback) {
        this.log.debug('INFO - GET Characteristic.ActiveIdentifier');
        this.refreshCharacteristic(characteristic, callback);
      }.bind(this)
    );
  },

  bindRemoteKeyCharacteristic: function(characteristic) {
    characteristic.on(
      'set',
      function(newValue, callback) {
        this.log.debug(
          'INFO - SET Characteristic.RemoteKey : ' +
            newValue +
            ' with currentActivity ' +
            this._currentActivity
        );

        if (this._currentActivity > 0) {
          if (newValue === Characteristic.RemoteKey.PLAY_PAUSE) {
            this.handlePlayPause();
          } else if (this.keysMap[newValue]) {
            this.log.debug('INFO - sending command for ' + newValue);
            this.harmonyBase.sendCommand(this, this.keysMap[newValue]);
          } else {
            this.log.debug('INFO - no command to send for ' + newValue);
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
        if (this._currentActivity > 0) {
          this.log.debug('INFO - SET Characteristic.Mute : ' + value);
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
        this.log.debug('INFO - GET Characteristic.Mute');
        callback(null, false);
      }.bind(this)
    );
  },

  bindVolumeSelectorCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentActivity > 0) {
          this.log.debug('INFO - SET Characteristic.VolumeSelector : ' + value);
          if (value === Characteristic.VolumeSelector.DECREMENT) {
            this.harmonyBase.sendCommand(
              this,
              HarmonyAsTVKeysTools.getOverrideCommand(
                this,
                'VOLUME_DOWN',
                this._currentInputService.VolumeDownCommand
              )
            );
          } else {
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
        callback(null);
      }.bind(this)
    );
  },

  bindVolumeCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function(value, callback) {
        if (this._currentActivity > 0) {
          this.log.debug('INFO - SET Characteristic.Volume : ' + value);
          this.volumesLevel[this._currentActivity] = value;
        }
        callback(null);
      }.bind(this)
    );

    characteristic.on(
      'get',
      function(callback) {
        this.log.debug('INFO - GET Characteristic.Volume');

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
        this.log.debug('INFO - SET Characteristic.ConfiguredName : ' + value);
        let idConf = 0;
        if (service instanceof Service.InputSource) idConf = service.activityId;

        this.savedNames[idConf] = value;
        fs.writeFile(
          this.savedNamesFile,
          JSON.stringify(this.savedNames),
          err => {
            if (err) {
              this.log(
                'ERROR - error occured could not write configured name %s',
                err
              );
            } else {
              this.log.debug(
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
          'INFO - SET Characteristic.TargetVisibilityState : ' + value
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
                'ERROR - error occured could not write visibility state %s',
                err
              );
            } else {
              this.log.debug(
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
        this.log.debug(
          'INFO - SET Characteristic.PowerModeSelection : ' + value
        );
        this.harmonyBase.sendCommand(
          this,
          HarmonyAsTVKeysTools.getOverrideCommand(
            this,
            'SETUP',
            this._currentInputService.SetupCommand
          )
        );
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
};
