const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');

module.exports = {
  HarmonyPlatformAsTVPlatform: HarmonyPlatformAsTVPlatform,
};

function HarmonyPlatformAsTVPlatform(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, this);
  this.mainActivity = config['mainActivity'];

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object
    this.api = api;
    var that = this;
    this.api.on(
      'shutdown',
      function() {
        that.log('shutdown');

        if (that.wspRefresh) {
          that.wspRefresh.close();
        } else if (that.timerID) {
          clearInterval(that.timerID);
          that.timerID = undefined;
        }
      }.bind(this)
    );
  }
}

HarmonyPlatformAsTVPlatform.prototype = {
  setTimer: function(on) {
    this.harmonyBase.setTimer(on, this);
  },

  _onMessage(message) {
    this.log.debug(
      'INFO - _onMessage : received message : ' + JSON.stringify(message)
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
      //need to refresh, activity is started.
      this.log.debug('INFO - _onMessage : Refreshing activity');

      this.updateCurrentInputService(message.data.activityId);

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
    }
  },

  ///CREATION / STARTUP

  configureMainActivity: function(activity, services) {
    let inputName = activity.label;
    if (this.devMode) {
      inputName = 'DEV' + inputName;
    }
    this.log('Configuring Main Activity ' + inputName);

    this.mainActivityId = activity.id;
    this.mainService.activityName = inputName;
    this.mainService.activityId = activity.id;
    this.mainService.controlService.id = 'M' + activity.id;

    this.log('Creating TV Speaker Service');
    this.tvSpeakerService = {
      controlService: new Service.TelevisionSpeaker(this.name, 'TVSpeaker'),
      characteristics: [
        Characteristic.Mute,
        Characteristic.VolumeSelector,
        Characteristic.Volume,
      ],
    };
    this.tvSpeakerService.controlService
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

    that.log('Creating Main TV Service');
    that.mainService = {
      controlService: new Service.Television(that.name, 'tvService'),
      characteristics: [
        Characteristic.Active,
        Characteristic.ActiveIdentifier,
        Characteristic.RemoteKey,
      ],
    };
    that.mainService.controlService.subtype = that.name + ' TV';
    that.mainService.controlService
      .setCharacteristic(Characteristic.ConfiguredName, that.name)
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

        that.log('Creating InputSourceService ' + inputName);
        let inputSourceService = {
          controlService: new Service.InputSource(inputName, 'Input'),
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
                that.log('Mapping Mute for ' + inputName);
                inputSourceService.MuteCommand = functions[k].action;
              } else if (functions[k].name == 'VolumeDown') {
                that.log('Mapping VolumeDown for ' + inputName);
                inputSourceService.VolumeDownCommand = functions[k].action;
              } else if (functions[k].name == 'VolumeUp') {
                that.log('Mapping VolumeUp for ' + inputName);
                inputSourceService.VolumeUpCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'NavigationBasic') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'DirectionDown') {
                that.log('Mapping DirectionDown for ' + inputName);
                inputSourceService.DirectionDownCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionLeft') {
                that.log('Mapping DirectionLeft for ' + inputName);
                inputSourceService.DirectionLeftCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionRight') {
                that.log('Mapping DirectionRight for ' + inputName);
                inputSourceService.DirectionRightCommand = functions[k].action;
              } else if (functions[k].name == 'DirectionUp') {
                that.log('Mapping DirectionUp for ' + inputName);
                inputSourceService.DirectionUpCommand = functions[k].action;
              } else if (functions[k].name == 'Select') {
                that.log('Mapping Select for ' + inputName);
                inputSourceService.SelectCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'TransportBasic') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'Stop') {
                that.log('Mapping Stop for ' + inputName);
                inputSourceService.StopCommand = functions[k].action;
              } else if (functions[k].name == 'Play') {
                that.log('Mapping Play for ' + inputName);
                inputSourceService.PlayCommand = functions[k].action;
              } else if (functions[k].name == 'Rewind') {
                that.log('Mapping Rewind for ' + inputName);
                inputSourceService.RewindCommand = functions[k].action;
              } else if (functions[k].name == 'Pause') {
                that.log('Mapping Pause for ' + inputName);
                inputSourceService.PauseCommand = functions[k].action;
              } else if (functions[k].name == 'FastForward') {
                that.log('Mapping FastForward for ' + inputName);
                inputSourceService.FastForwardCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'NavigationDVD') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (
                functions[k].name == 'Return' ||
                functions[k].name == 'Back'
              ) {
                that.log('Mapping Return for ' + inputName);
                inputSourceService.ReturnCommand = functions[k].action;
              } else if (functions[k].name == 'Menu') {
                that.log('Mapping Menu for ' + inputName);
                inputSourceService.MenuCommand = functions[k].action;
              }
            }
          } else if (
            activities[i].controlGroup[j].name == 'TransportExtended'
          ) {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'SkipBackward') {
                that.log('Mapping SkipBackward for ' + inputName);
                inputSourceService.SkipBackwardCommand = functions[k].action;
              } else if (functions[k].name == 'SkipForward') {
                that.log('Mapping SkipForward for ' + inputName);
                inputSourceService.SkipForwardCommand = functions[k].action;
              }
            }
          } else if (activities[i].controlGroup[j].name == 'GameType3') {
            for (let k = 0, len = functions.length; k < len; k++) {
              if (functions[k].name == 'Home') {
                that.log('Mapping Home for ' + inputName);
                inputSourceService.HomeCommand = functions[k].action;
              }
            }
          }
        }

        inputSourceService.controlService
          .setCharacteristic(Characteristic.Identifier, activities[i].id)
          .setCharacteristic(Characteristic.ConfiguredName, inputName)

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

    that.log('Adding Accessory : ' + that.name);
    let myHarmonyAccessory = new HarmonyAccessory(services);
    myHarmonyAccessory.getServices = function() {
      return that.getServices(myHarmonyAccessory);
    };
    myHarmonyAccessory.platform = that;
    myHarmonyAccessory.name = that.name;
    myHarmonyAccessory.model = that.name;
    myHarmonyAccessory.manufacturer = 'Harmony';
    myHarmonyAccessory.serialNumber = that.hubIP;
    that._foundAccessories.push(myHarmonyAccessory);

    //first refresh
    setTimeout(function() {
      that.refreshAccessory();
      that.setTimer(true);
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);

    callback(that._foundAccessories);
  },

  accessories: function(callback) {
    this.harmonyBase.configureAccessories(this, callback);
  },

  ///REFRESHING TOOLS

  refreshAccessory: function() {
    this.refreshCurrentActivity(() => {
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
    this.refreshCurrentActivity(() => {
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

  refreshCurrentActivity: function(callback) {
    if (
      this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE &&
      this._currentActivityLastUpdate &&
      Date.now() - this._currentActivityLastUpdate <
        HarmonyConst.TIMEOUT_REFRESH_CURRENT_ACTIVITY
    ) {
      // we don't refresh since status was retrieved not so far away
      this.log.debug(
        'INFO - refreshCurrentActivity : NO refresh needed since last update was on :' +
          this._currentActivity +
          ' and current Activity is set'
      );
      callback();
    } else {
      this.log.debug(
        'INFO - refreshCurrentActivity : Refresh needed since last update is too old or current Activity is not set : ' +
          this._currentActivity
      );

      payload = {
        hubId: this.remote_id,
        timeout: 30,
        hbus: {
          cmd:
            'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
          id: 0,
          params: {
            verb: 'get',
            format: 'json',
          },
        },
      };

      this.wsp
        .open()
        .then(() =>
          this.wsp.onUnpackedMessage.addListener(data => {
            this.wsp.removeAllListeners();

            if (
              data &&
              data.type !== 'connect.stateDigest?notify' &&
              data.data &&
              data.code &&
              (data.code == 200 || data.code == 100)
            ) {
              this.updateCurrentInputService(data.data.result);
            } else {
              this.log.debug(
                'WARNING - refreshCurrentActivity : could not refresh current Activity :' +
                  (data ? JSON.stringify(data) : 'no data')
              );
              this.updateCurrentInputService(
                HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE
              );
            }
            callback();
          })
        )
        .then(() => this.wsp.sendPacked(payload))
        .catch(e => {
          this.log(
            'ERROR - refreshCurrentActivity : RefreshCurrentActivity : ' + e
          );
          this.updateCurrentInputService(
            HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE
          );
          callback();
        });
    }
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
    //timer for background refresh
    this.setTimer(false);
    var params = {
      async: 'false',
      timestamp: 0,
      args: {
        rule: 'start',
      },
      activityId: commandToSend,
    };

    var payload = {
      hubId: this.remote_id,
      timeout: 30,
      hbus: {
        cmd: 'harmony.activityengine?runactivity',
        id: 0,
        params: params,
      },
    };

    this.log.debug(
      'INFO - activityCommand : sending command ' + JSON.stringify(params)
    );

    this.wsp
      .open()
      .then(() =>
        this.wsp.onUnpackedMessage.addListener(data => {
          this.wsp.removeAllListeners();

          this.log.debug(
            'INFO - activityCommand : Returned from hub ' + JSON.stringify(data)
          );

          if (
            data &&
            data.code &&
            data.code == 200 &&
            data.msg &&
            data.msg == 'OK'
          ) {
            this._currentSetAttemps = 0;

            this.log.debug('INFO - activityCommand : command sent');

            this.updateCurrentInputService(params.activityId);

            if (this._currentActivity != -1) {
              this.log.debug(
                'updating characteristics to ' + this._currentActivity
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
              this.log.debug('updating characteristics to off');

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
            //timer for background refresh - we delay it since activity can take some time to get up
            var that = this;
            setTimeout(function() {
              that.setTimer(true);
            }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_ACTIVITY);
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
                    params.activityId
                );
                that.activityCommand(homebridgeAccessory, commandToSend);
              } else {
                that.log(
                  'ERROR - activityCommand : could not SET status, no more RETRY : ' +
                    params.activityId
                );
                that.refreshAccessory();
                //timer for background refresh
                that.setTimer(true);
              }
            }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
          } else {
            this.log('ERROR - activityCommand : could not SET status, no data');
            //timer for background refresh
            var that = this;
            setTimeout(function() {
              that.setTimer(true);
            }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_COMMAND);
          }
        })
      )
      .then(() => this.wsp.sendPacked(payload))
      .catch(e => {
        this.log('ERROR - activityCommand : ' + e);
        //timer for background refresh
        var that = this;
        setTimeout(function() {
          that.setTimer(true);
        }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_COMMAND);
      });
  },

  sendCommand: function(commandToSend) {
    if (!commandToSend) {
      this.log.debug('INFO - sendCommand : Command not available ');
      return;
    }

    this.setTimer(false);

    var payload = {
      hubId: this.remote_id,
      timeout: 30,
      hbus: {
        cmd: 'vnd.logitech.harmony/vnd.logitech.harmony.engine?holdAction',
        id: 0,
        params: {
          status: 'press',
          timestamp: '0',
          verb: 'render',
          action: commandToSend,
        },
      },
    };

    this.log.debug(
      'INFO - sendCommand : sending press command  ' + JSON.stringify(payload)
    );
    var that = this;

    this.wsp
      .open()
      .then(() => this.wsp.sendPacked(payload))
      .then(() => {
        this.log.debug('INFO - sendCommand release config ');
        payload.hbus.params.status = 'release';
        payload.hbus.params.timestamp = '50';
      })
      .then(() => {
        this.log.debug(
          'INFO - sendCommand2 : sending release command  ' +
            JSON.stringify(payload)
        );
        this.wsp
          .open()
          .then(() => this.wsp.sendPacked(payload))
          .then(() => {
            this.log.debug('INFO - sendCommand2 done');
            setTimeout(function() {
              that.setTimer(true);
            }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_COMMAND);
          })
          .catch(e => {
            this.log('ERROR : sendCommand2 release :' + e);
            //timer for background refresh
            setTimeout(function() {
              that.setTimer(true);
            }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_COMMAND);
          });
      })
      .catch(e => {
        this.log('ERROR : sendCommand press :' + e);
        setTimeout(function() {
          that.setTimer(true);
        }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER_ON_NEW_COMMAND);
      });
  },

  //HOMEKIT CHARACTERISTICS EVENTS
  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (characteristic instanceof Characteristic.Active) {
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
            this.refreshCurrentActivity(() => {
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
          this.refreshCurrentActivity(() => {
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
                  this.sendCommand(
                    this._currentInputService.DirectionUpCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.ARROW_DOWN:
                  this.log.debug(
                    'INFO - sending DirectionDownCommand for ARROW_DOWN'
                  );
                  this.sendCommand(
                    this._currentInputService.DirectionDownCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.ARROW_LEFT:
                  this.log.debug(
                    'INFO - sending DirectionLeftCommand for ARROW_LEFT'
                  );
                  this.sendCommand(
                    this._currentInputService.DirectionLeftCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.ARROW_RIGHT:
                  this.log.debug(
                    'INFO - sending DirectionRightCommand for ARROW_RIGHT'
                  );
                  this.sendCommand(
                    this._currentInputService.DirectionRightCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.SELECT:
                  this.log.debug('INFO - sending SelectCommand for SELECT');
                  this.sendCommand(this._currentInputService.SelectCommand);
                  break;
                case newValue === Characteristic.RemoteKey.PLAY_PAUSE:
                  this.log.debug('INFO - sending PlayCommand for PLAY_PAUSE');
                  this.sendCommand(this._currentInputService.PlayCommand);
                  break;
                case newValue === Characteristic.RemoteKey.INFORMATION:
                  this.log.debug('INFO - sending MenuCommand for INFORMATION');
                  this.sendCommand(this._currentInputService.MenuCommand);
                  break;
                case newValue === Characteristic.RemoteKey.BACK:
                  this.log.debug('INFO - sending ReturnCommand for BACK');
                  this.sendCommand(this._currentInputService.ReturnCommand);
                  break;
                case newValue === Characteristic.RemoteKey.EXIT:
                  this.log.debug('INFO - sending HomeCommand for EXIT');
                  this.sendCommand(this._currentInputService.HomeCommand);
                  break;
                case newValue === Characteristic.RemoteKey.REWIND:
                  this.log.debug('INFO - sending RewindCommand for REWIND');
                  this.sendCommand(this._currentInputService.RewindCommand);
                  break;
                case newValue === Characteristic.RemoteKey.FAST_FORWARD:
                  this.log.debug(
                    'INFO - sending FastForwardCommand for FAST_FORWARD'
                  );
                  this.sendCommand(
                    this._currentInputService.FastForwardCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.NEXT_TRACK:
                  this.log.debug(
                    'INFO - sending SkipForwardCommand for NEXT_TRACK'
                  );
                  this.sendCommand(
                    this._currentInputService.SkipForwardCommand
                  );
                  break;
                case newValue === Characteristic.RemoteKey.PREVIOUS_TRACK:
                  this.log.debug(
                    'INFO - sending SkipBackwardCommand for PREVIOUS_TRACK'
                  );
                  this.sendCommand(
                    this._currentInputService.SkipBackwardCommand
                  );
                  break;
              }
            }
            callback(null);
          });
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.Mute) {
      characteristic.on(
        'set',
        function(value, callback) {
          this.refreshCurrentActivity(() => {
            if (this._currentActivity > 0) {
              this.log.debug('INFO - SET Characteristic.Mute : ' + value);
              this.sendCommand(this._currentInputService.MuteCommand);
            }
            callback(null);
          });
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
          this.refreshCurrentActivity(() => {
            if (this._currentActivity > 0) {
              this.log.debug(
                'INFO - SET Characteristic.VolumeSelector : ' + value
              );
              if (value === Characteristic.VolumeSelector.DECREMENT) {
                this.sendCommand(this._currentInputService.VolumeDownCommand);
              } else {
                this.sendCommand(this._currentInputService.VolumeUpCommand);
              }
            }
            callback(null);
          });
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
