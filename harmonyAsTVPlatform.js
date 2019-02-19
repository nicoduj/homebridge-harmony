var Service, Characteristic;

const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');

module.exports = {
  HarmonyPlatformAsTVPlatform: HarmonyPlatformAsTVPlatform,
};

function HarmonyPlatformAsTVPlatform(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);
  this.mainActivity = config['mainActivity'];
}

HarmonyPlatformAsTVPlatform.prototype = {
  onMessage(newActivity) {
    this.updateCurrentInputService(newActivity);

    this.harmonyBase.updateCharacteristic(
      this.mainService.controlService.getCharacteristic(Characteristic.Active),
      this._currentActivity > 0,
      null
    );
    this.harmonyBase.updateCharacteristic(
      this.mainService.controlService.getCharacteristic(
        Characteristic.ActiveIdentifier
      ),
      this._currentActivity,
      null
    );
  },

  ///CREATION / STARTUP

  configureMainActivity: function(activity, services) {
    let inputName = activity.label;
    if (this.devMode) {
      inputName = 'DEV' + inputName;
    }
    this.log('INFO - Configuring Main Activity ' + inputName);

    this.mainActivityId = activity.id;
    this.mainService.activityName = inputName;
    this.mainService.activityId = activity.id;
    this.mainService.controlService.id = 'M' + activity.id;

    this.log('INFO - Creating TV Speaker Service');
    this.tvSpeakerService = {
      controlService: new Service.TelevisionSpeaker(
        this.name,
        'TVSpeaker' + this.name
      ),
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
        Characteristic.VolumeControlType.RELATIVE
      );

    this.tvSpeakerService.controlService.id = 'V' + activity.id;
    this.tvSpeakerService.controlService.subtype = this.name + ' Volume';
    this.mainService.controlService.addLinkedService(
      this.tvSpeakerService.controlService
    );
  },

  readAccessories: function(data, callback) {
    var that = this;

    let activities = data.data.activity;

    let services = [];

    that.log('INFO - Creating Main TV Service');
    that.mainService = {
      controlService: new Service.Television(
        that.name,
        'tvService' + that.name
      ),
      characteristics: [
        Characteristic.Active,
        Characteristic.ActiveIdentifier,
        Characteristic.RemoteKey,
      ],
    };
    that.mainService.controlService.subtype = that.name + ' TV';
    that.mainService.controlService
      .setCharacteristic(Characteristic.ConfiguredName, that.name)
      .setCharacteristic(Characteristic.Name, that.name)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      )
      .setCharacteristic(Characteristic.ActiveIdentifier, -1)
      .setCharacteristic(Characteristic.Active, false);

    that.inputServices = [];
    that.log.debug(
      'INFO - accessories : main activity name : ' + that.mainActivity
    );
    let mainActivityConfigured = false;

    for (let i = 0, len = activities.length; i < len; i++) {
      if (activities[i].id != -1) {
        let inputName = activities[i].label;
        if (that.devMode) {
          inputName = 'DEV' + inputName;
        }
        that.log.debug(
          'INFO - accessories : activity to configure : ' + inputName
        );
        if (that.mainActivity == inputName) {
          that.configureMainActivity(activities[i], services);
          mainActivityConfigured = true;
        }

        that.log('INFO - Creating InputSourceService ' + inputName);
        let inputSourceService = {
          controlService: new Service.InputSource(
            inputName,
            'Input' + that.name + inputName
          ),
          characteristics: [],
        };
        inputSourceService.controlService.id = activities[i].id;
        inputSourceService.activityName = inputName;
        inputSourceService.activityId = activities[i].id;
        inputSourceService.controlService.subtype = inputName + ' Activity';

        //keys
        let controlGroup = activities[i].controlGroup;
        for (let j = 0, len = controlGroup.length; j < len; j++) {
          let functions = controlGroup[j].function;
          if (controlGroup[j].name == 'Volume') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'Mute') {
                that.log('INFO - Mapping Mute for ' + inputName);
                inputSourceService.MuteCommand = functions[k].action;
              } else if (functions[k].name == 'VolumeDown') {
                that.log('INFO - Mapping VolumeDown for ' + inputName);
                inputSourceService.VolumeDownCommand = functions[k].action;
              } else if (functions[k].name == 'VolumeUp') {
                that.log('INFO - Mapping VolumeUp for ' + inputName);
                inputSourceService.VolumeUpCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'NavigationBasic') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'DirectionDown') {
                that.log('INFO - Mapping DirectionDown for ' + inputName);
                inputSourceService.DirectionDownCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionLeft') {
                that.log('INFO - Mapping DirectionLeft for ' + inputName);
                inputSourceService.DirectionLeftCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionRight') {
                that.log('INFO - Mapping DirectionRight for ' + inputName);
                inputSourceService.DirectionRightCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionUp') {
                that.log('INFO - Mapping DirectionUp for ' + inputName);
                inputSourceService.DirectionUpCommand = functions[k].action;
              } else if (functions[k].name == 'Select') {
                that.log('INFO - Mapping Select for ' + inputName);
                inputSourceService.SelectCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'TransportBasic') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'Stop') {
                that.log('INFO - Mapping Stop for ' + inputName);
                inputSourceService.StopCommand = functions[k].action;
              } else if (functions[k].name == 'Play') {
                that.log('INFO - Mapping Play for ' + inputName);
                inputSourceService.PlayCommand = functions[k].action;
              } else if (functions[k].name == 'Rewind') {
                that.log('INFO - Mapping Rewind for ' + inputName);
                inputSourceService.RewindCommand = functions[k].action;
              } else if (functions[k].name == 'Pause') {
                that.log('INFO - Mapping Pause for ' + inputName);
                inputSourceService.PauseCommand = functions[k].action;
              } else if (functions[k].name == 'FastForward') {
                that.log('INFO - Mapping FastForward for ' + inputName);
                inputSourceService.FastForwardCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'NavigationDVD') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (
                functions[k].name == 'Return' ||
                functions[k].name == 'Back'
              ) {
                that.log('INFO - Mapping Return for ' + inputName);
                inputSourceService.ReturnCommand = functions[k].action;
              } else if (functions[k].name == 'Menu') {
                that.log('INFO - Mapping Menu for ' + inputName);
                inputSourceService.MenuCommand = functions[k].action;
              }
            }
          } else if (
            activities[i].controlGroup[j].name == 'TransportExtended'
          ) {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'SkipBackward') {
                that.log('INFO - Mapping SkipBackward for ' + inputName);
                inputSourceService.SkipBackwardCommand = functions[k].action;
              } else if (functions[k].name == 'SkipForward') {
                that.log('INFO - Mapping SkipForward for ' + inputName);
                inputSourceService.SkipForwardCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'GameType3') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'Home') {
                that.log('INFO - Mapping Home for ' + inputName);
                inputSourceService.HomeCommand = functions[k].action;
              }
            }
          }
        }

        inputSourceService.controlService
          .setCharacteristic(Characteristic.Identifier, activities[i].id)
          .setCharacteristic(Characteristic.ConfiguredName, inputName)
          .setCharacteristic(Characteristic.Name, inputName)
          .setCharacteristic(
            Characteristic.IsConfigured,
            Characteristic.IsConfigured.CONFIGURED
          )
          .setCharacteristic(
            Characteristic.InputSourceType,
            Characteristic.InputSourceType.APPLICATION
          )
          .setCharacteristic(
            Characteristic.CurrentVisibilityState,
            Characteristic.CurrentVisibilityState.SHOWN
          )
          .setCharacteristic(
            Characteristic.TargetVisibilityState,
            Characteristic.TargetVisibilityState.SHOWN
          );

        that.mainService.controlService.addLinkedService(
          inputSourceService.controlService
        );

        that.inputServices.push(inputSourceService);
      }
    }

    if (!mainActivityConfigured) {
      that.log(
        'WARNING - No main Activity that match config file found, default to first one'
      );
      that.configureMainActivity(activities[0], services);
    }
    for (let s = 0, len = that.inputServices.length; s < len; s++) {
      services.push(that.inputServices[s]);
    }
    services.push(that.tvSpeakerService);
    services.push(that.mainService);

    that.log('INFO - Adding Accessory : ' + that.name);
    let myHarmonyAccessory = new HarmonyAccessory(services);
    myHarmonyAccessory.getServices = function() {
      return that.getServices(myHarmonyAccessory);
    };
    myHarmonyAccessory.platform = that;
    myHarmonyAccessory.name = that.name;
    myHarmonyAccessory.model = that.name;
    myHarmonyAccessory.manufacturer = 'Harmony';
    myHarmonyAccessory.serialNumber = that.name + that.hubIP;
    that._foundAccessories.push(myHarmonyAccessory);

    if (
      that.devicesToPublishAsAccessoriesSwitch &&
      that.devicesToPublishAsAccessoriesSwitch.length > 0
    ) {
      that.harmonyBase.getDevicesAccessories(that, data);
    }

    //first refresh
    setTimeout(function() {
      that.refreshAccessory();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);

    callback(that._foundAccessories);
  },

  accessories: function(callback) {
    this.harmonyBase.configureAccessories(this, callback);
  },

  ///REFRESHING TOOLS

  refreshAccessory: function() {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      this.updateCurrentInputService(this._currentActivity);

      this.harmonyBase.updateCharacteristic(
        this.mainService.controlService.getCharacteristic(
          Characteristic.Active
        ),
        this._currentActivity > 0,
        null
      );
      this.harmonyBase.updateCharacteristic(
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
          this.harmonyBase.updateCharacteristic(
            characteristic,
            this._currentActivity > 0,
            callback
          );
        } else if (characteristic instanceof Characteristic.ActiveIdentifier) {
          this.log.debug(
            'INFO - refreshCharacteristic : updating Characteristic.ActiveIdentifier to ' +
              this._currentActivity
          );
          this.harmonyBase.updateCharacteristic(
            characteristic,
            this._currentActivity,
            callback
          );
        }
      } else {
        this.log.debug('WARNING - refreshCharacteristic : no current Activity');
        if (characteristic instanceof Characteristic.Active) {
          this.harmonyBase.updateCharacteristic(
            characteristic,
            false,
            callback
          );
        } else if (characteristic instanceof Characteristic.ActiveIdentifier) {
          this.harmonyBase.updateCharacteristic(characteristic, -1, callback);
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

    if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
      for (let i = 0, len = this.inputServices.length; i < len; i++) {
        if (this.inputServices[i].activityId == this._currentActivity) {
          this._currentInputService = this.inputServices[i];
          break;
        }
      }
    } else {
      this._currentInputService = -1;
    }
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
    this.harmonyBase.harmony
      .startActivity(commandToSend)
      .then(data => {
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

            this.harmonyBase.updateCharacteristic(
              this.mainService.controlService.getCharacteristic(
                Characteristic.ActiveIdentifier
              ),
              this._currentActivity
            );
            this.harmonyBase.updateCharacteristic(
              this.mainService.controlService.getCharacteristic(
                Characteristic.Active
              ),
              true
            );
          } else {
            this.log.debug('INFO - updating characteristics to off');

            this.harmonyBase.updateCharacteristic(
              this.mainService.controlService.getCharacteristic(
                Characteristic.Active
              ),
              false
            );

            this.harmonyBase.updateCharacteristic(
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
                'INFO - activityCommand : RETRY to send command ' +
                  commandToSend
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
      })
      .catch(e => {
        this.log('ERROR - activityCommand : ' + e);
      });
  },

  //HOMEKIT CHARACTERISTICS EVENTS
  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (service.type === HarmonyConst.DEVICE_TYPE || service.type === HarmonyConst.DEVICEMACRO_TYPE ) {
      this.harmonyBase.bindCharacteristicEvents(
        this,
        characteristic,
        service,
        homebridgeAccessory
      );
    } else if (characteristic instanceof Characteristic.Active) {
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
                this.sendInputCommand(
                  homebridgeAccessory,
                  '' + activityToLaunch
                );
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
    } else if (characteristic instanceof Characteristic.ActiveIdentifier) {
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
    } else if (characteristic instanceof Characteristic.RemoteKey) {
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
            switch (true) {
              case newValue === Characteristic.RemoteKey.ARROW_UP:
                this.log.debug(
                  'INFO - sending DirectionUpCommand for ARROW_UP'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.DirectionUpCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.ARROW_DOWN:
                this.log.debug(
                  'INFO - sending DirectionDownCommand for ARROW_DOWN'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.DirectionDownCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.ARROW_LEFT:
                this.log.debug(
                  'INFO - sending DirectionLeftCommand for ARROW_LEFT'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.DirectionLeftCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.ARROW_RIGHT:
                this.log.debug(
                  'INFO - sending DirectionRightCommand for ARROW_RIGHT'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.DirectionRightCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.SELECT:
                this.log.debug('INFO - sending SelectCommand for SELECT');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.SelectCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.PLAY_PAUSE:
                this.log.debug('INFO - sending PlayCommand for PLAY_PAUSE');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.PlayCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.INFORMATION:
                this.log.debug('INFO - sending MenuCommand for INFORMATION');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.MenuCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.BACK:
                this.log.debug('INFO - sending ReturnCommand for BACK');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.ReturnCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.EXIT:
                this.log.debug('INFO - sending HomeCommand for EXIT');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.HomeCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.REWIND:
                this.log.debug('INFO - sending RewindCommand for REWIND');
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.RewindCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.FAST_FORWARD:
                this.log.debug(
                  'INFO - sending FastForwardCommand for FAST_FORWARD'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.FastForwardCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.NEXT_TRACK:
                this.log.debug(
                  'INFO - sending SkipForwardCommand for NEXT_TRACK'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.SkipForwardCommand
                );
                break;
              case newValue === Characteristic.RemoteKey.PREVIOUS_TRACK:
                this.log.debug(
                  'INFO - sending SkipBackwardCommand for PREVIOUS_TRACK'
                );
                this.harmonyBase.sendCommand(
                  this,
                  this._currentInputService.SkipBackwardCommand
                );
                break;
            }
          }
          callback(null);
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.Mute) {
      characteristic.on(
        'set',
        function(value, callback) {
          if (this._currentActivity > 0) {
            this.log.debug('INFO - SET Characteristic.Mute : ' + value);
            this.harmonyBase.sendCommand(
              this,
              this._currentInputService.MuteCommand
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
    } else if (characteristic instanceof Characteristic.VolumeSelector) {
      characteristic.on(
        'set',
        function(value, callback) {
          if (this._currentActivity > 0) {
            this.log.debug(
              'INFO - SET Characteristic.VolumeSelector : ' + value
            );
            if (value === Characteristic.VolumeSelector.DECREMENT) {
              this.harmonyBase.sendCommand(
                this,
                this._currentInputService.VolumeDownCommand
              );
            } else {
              this.harmonyBase.sendCommand(
                this,
                this._currentInputService.VolumeUpCommand
              );
            }
          }
          callback(null);
        }.bind(this)
      );
    }
  },

  getServices: function(homebridgeAccessory) {
    return this.harmonyBase.getServices(homebridgeAccessory);
  },
};

function HarmonyAccessory(services) {
  this.services = services;
}
