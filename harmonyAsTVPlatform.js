var Service, Characteristic, Accessory, UUIDGen;

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
  Accessory = api.platformAccessory;
  UUIDGen = api.hap.uuid;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);
  this.mainActivity = config['mainActivity'];
  this.playPauseBehavior = HarmonyTools.checkParemeter(
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

  this._currentActivity = -1;

  if (api) {
    this.api.on(
      'didFinishLaunching',
      function() {
        this.log('DidFinishLaunching');
        this.loadAccessories();
      }.bind(this)
    );
  }
}

HarmonyPlatformAsTVPlatform.prototype = {
  onMessage(newActivity) {
    this.updateCurrentInputService(newActivity);

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

  ///CREATION / STARTUP

  configureMainService: function(accessory) {
    let subType = this.name + ' TV';
    var ctrlService = accessory.getService(subType);

    if (!ctrlService) {
      this.log('INFO - Creating TV Service');
      ctrlService = new Service.Television(this.name, 'tvService' + this.name);
      ctrlService.subtype = subType;
    }

    this.mainService = {
      controlService: ctrlService,
      characteristics: [
        Characteristic.Active,
        Characteristic.ActiveIdentifier,
        Characteristic.RemoteKey,
        Characteristic.ConfiguredName,
        Characteristic.PowerModeSelection,
      ],
    };

    if (this.savedNames && this.savedNames[0]) {
      mainServiceName = this.savedNames[0];
    } else {
      mainServiceName = this.name;
    }

    this.mainService.controlService
      .setCharacteristic(Characteristic.ConfiguredName, mainServiceName)
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      )
      .setCharacteristic(Characteristic.ActiveIdentifier, -1)
      .setCharacteristic(Characteristic.Active, false);

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
    this.mainService.controlService.id = 'M' + activity.id;

    let subType = this.name + ' Volume';
    var ctrlService = accessory.getService(subType);

    if (!ctrlService) {
      this.log('INFO - Creating TV Speaker Service');
      ctrlService = new Service.TelevisionSpeaker(
        this.name,
        'TVSpeaker' + this.name
      );
      ctrlService.subtype = subType;
    }

    this.tvSpeakerService = {
      controlService: ctrlService,
      characteristics: [
        Characteristic.Mute,
        Characteristic.VolumeSelector,
        Characteristic.Volume,
      ],
    };
    this.tvSpeakerService.controlService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(
        Characteristic.VolumeControlType,
        Characteristic.VolumeControlType.ABSOLUTE
      );

    this.tvSpeakerService.controlService.id = 'V' + activity.id;
    this.mainService.controlService.addLinkedService(
      this.tvSpeakerService.controlService
    );
  },

  configureInputSourceService: function(
    accessory,
    inputName,
    inputId,
    activity
  ) {
    let subType = inputName + ' Activity';
    var ctrlService = accessory.getService(subType);

    if (!ctrlService) {
      this.log('INFO - Creating Input Service - ' + inputName);
      ctrlService = new Service.InputSource(
        this.name,
        'Input' + this.name + inputName
      );
      ctrlService.subtype = subType;
    }

    let inputSourceService = {
      controlService: ctrlService,
      characteristics: [
        Characteristic.ConfiguredName,
        Characteristic.CurrentVisibilityState,
        Characteristic.TargetVisibilityState,
      ],
    };
    inputSourceService.controlService.id = inputId;
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

    inputSourceService.controlService
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
    let services = [];

    uuid = UUIDGen.generate(this.name);

    let myHarmonyAccessory = this._foundAccessories.find(x => (x.UUID = uuid));
    var isNew = false;
    //we di not find an create one
    if (!myHarmonyAccessory) {
      this.log('INFO - Adding Accessory : ' + this.name);
      myHarmonyAccessory = new Accessory(this.name, uuid);

      myHarmonyAccessory.platform = this;
      myHarmonyAccessory.name = this.name;
      myHarmonyAccessory.model = this.name;
      myHarmonyAccessory.manufacturer = 'Harmony';
      myHarmonyAccessory.serialNumber = this.name + this.hubIP;

      this.harmonyBase.configureInformationService(myHarmonyAccessory);
      isNew = true;
    } else {
      this.log('INFO - Found Accessory : ' + this.name);
      myHarmonyAccessory.platform = this;
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

        this.log('INFO - Creating InputSourceService ' + inputName);

        let inputSourceService = this.configureInputSourceService(
          myHarmonyAccessory,
          inputName,
          inputId,
          activities[i]
        );

        this.mainService.controlService.addLinkedService(
          inputSourceService.controlService
        );

        this.inputServices.push(inputSourceService);
      }
    }

    if (!mainActivityConfigured) {
      this.log(
        'WARNING - No main Activity that match config file found, default to first one'
      );
      this.configureMainActivity(myHarmonyAccessory, activities[0]);
    }

    for (let s = 0, len = this.inputServices.length; s < len; s++) {
      services.push(this.inputServices[s]);
    }
    services.push(this.tvSpeakerService);
    services.push(this.mainService);

    this.harmonyBase.bindServices(myHarmonyAccessory, services, isNew);

    if (isNew) {
      this._foundAccessories.push(myHarmonyAccessory);
      this.api.registerPlatformAccessories(
        'homebridge-harmonyHub',
        'HarmonyHubWebSocket',
        [myHarmonyAccessory]
      );
    }

    //    this.harmonyBase.getDevicesAccessories(this, data);
    //    this.harmonyBase.getSequencesAccessories(this, data);

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

  refreshAccessory: function() {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      this.updateCurrentInputService(this._currentActivity);

      this.harmonyBase.handleCharacteristicUpdate(
        this,
        this.mainService.controlService.getCharacteristic(
          Characteristic.Active
        ),
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
    });
  },

  refreshCharacteristic: function(characteristic, callback) {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        if (characteristic instanceof Characteristic.Active) {
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
        } else if (characteristic instanceof Characteristic.ActiveIdentifier) {
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
        if (characteristic instanceof Characteristic.Active) {
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            false,
            callback
          );
        } else if (characteristic instanceof Characteristic.ActiveIdentifier) {
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

    let inputName = '';
    for (let i = 0, len = this.inputServices.length; i < len; i++) {
      if (this.inputServices[i].activityId == commandToSend) {
        inputName = this.inputServices[i].activityName;
        break;
      }
    }

    if (
      this.addAllActivitiesToSkipedIfSameStateActivitiesList ||
      (this.skipedIfSameStateActivities &&
        this.skipedIfSameStateActivities.includes(inputName))
    ) {
      //GLOBAL OFF SWITCH : do command only if we are not off
      if (commandToSend == -1) {
        doCommand =
          this._currentActivity != -1 &&
          this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE;
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
      homebridgeAccessory.platform.activityCommand(
        homebridgeAccessory,
        commandToSend
      );
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

        this.updateCurrentInputService(commandToSend);

        if (this._currentActivity != -1) {
          this.log.debug(
            'INFO - updating characteristics to ' + this._currentActivity
          );

          this.harmonyBase.handleCharacteristicUpdate(
            this,
            this.mainService.controlService.getCharacteristic(
              Characteristic.ActiveIdentifier
            ),
            this._currentActivity
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            this.mainService.controlService.getCharacteristic(
              Characteristic.Active
            ),
            true
          );
        } else {
          this.log.debug('INFO - updating characteristics to off');

          this.harmonyBase.handleCharacteristicUpdate(
            this,
            this.mainService.controlService.getCharacteristic(
              Characteristic.Active
            ),
            false
          );

          this.harmonyBase.handleCharacteristicUpdate(
            this,
            this.mainService.controlService.getCharacteristic(
              Characteristic.ActiveIdentifier
            ),
            -1
          );
        }
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
    /*
      .catch(e => {
        this.log('ERROR - activityCommand : ' + e);
      });*/
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
              let activityToLaunch = service.controlService.getCharacteristic(
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
        this.log.debug('INFO - GET Characteristic.Active');
        homebridgeAccessory.platform.refreshCharacteristic(
          characteristic,
          callback
        );
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
        homebridgeAccessory.platform.refreshCharacteristic(
          characteristic,
          callback
        );
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
        if (service.controlService instanceof Service.InputSource)
          idConf = service.controlService.id;

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
        let idConf = service.controlService.id;
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
        let idConf = service.controlService.id;
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

        let idConf = service.controlService.id;

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

            service.controlService
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
            'MENU',
            this._currentInputService.MenuCommand
          )
        );
        callback(null);
      }.bind(this)
    );
  },

  bindCharacteristicEventsForTV: function(characteristic, homebridgeAccessory) {
    if (characteristic instanceof Characteristic.ActiveIdentifier) {
      this.bindActiveIdentifierCharacteristic(
        characteristic,
        homebridgeAccessory
      );
    } else if (characteristic instanceof Characteristic.RemoteKey) {
      this.bindRemoteKeyCharacteristic(characteristic);
    } else if (characteristic instanceof Characteristic.PowerModeSelection) {
      this.bindPowerModeSelectionCharacteristic(characteristic);
    }
  },

  bindCharacteristicEventsForSpeaker: function(characteristic) {
    if (characteristic instanceof Characteristic.Mute) {
      this.bindMuteCharacteristic(characteristic);
    } else if (characteristic instanceof Characteristic.VolumeSelector) {
      this.bindVolumeSelectorCharacteristic(characteristic);
    } else if (characteristic instanceof Characteristic.Volume) {
      this.bindVolumeCharacteristic(characteristic);
    }
  },

  bindCharacteristicEventsForInputs: function(characteristic, service) {
    if (characteristic instanceof Characteristic.CurrentVisibilityState) {
      this.bindCurrentVisibilityStateCharacteristic(characteristic, service);
    } else if (characteristic instanceof Characteristic.TargetVisibilityState) {
      this.bindTargetVisibilityStateCharacteristic(characteristic, service);
    }
  },

  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (HarmonyTools.serviceIsNotTv(service)) {
      this.harmonyBase.bindCharacteristicEvents(this, characteristic, service);
    } else if (characteristic instanceof Characteristic.ConfiguredName) {
      this.bindConfiguredNameCharacteristic(characteristic, service);
    } else if (characteristic instanceof Characteristic.Active) {
      this.bindActiveCharacteristic(
        characteristic,
        service,
        homebridgeAccessory
      );
    } else if (service.controlService instanceof Service.Television) {
      this.bindCharacteristicEventsForTV(characteristic, homebridgeAccessory);
    } else if (service.controlService instanceof Service.TelevisionSpeaker) {
      this.bindCharacteristicEventsForSpeaker(characteristic);
    } else if (service.controlService instanceof Service.InputSource) {
      this.bindCharacteristicEventsForInputs(characteristic, service);
    }
  },
};
