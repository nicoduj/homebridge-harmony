DEFAULT_HUB_PORT = '8088';
TIMEOUT_REFRESH_CURRENT_ACTIVITY = 1500;
CURRENT_ACTIVITY_NOT_SET_VALUE = -9999;
MAX_ATTEMPS_STATUS_UPDATE = 12;
DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE = 2000;
DELAY_TO_UPDATE_STATUS = 800;
DELAY_TO_RELAUNCH_TIMER = 8000;

var Service, Characteristic;
var request = require('request');
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

module.exports = {
  HarmonyPlatformAsTVPlatform: HarmonyPlatformAsTVPlatform,
};

function HarmonyPlatformAsTVPlatform(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.log = log;
  this.hubIP = config['hubIP'];

  this.name = config['name'];
  this.devMode = config['DEVMODE'];
  this.refreshTimer = config['refreshTimer'];

  this.mainActivity = config['mainActivity'];
  this.addAllActivitiesToSkipedIfSameStateActivitiesList =
    config['addAllActivitiesToSkipedIfSameStateActivitiesList'];
  this.skipedIfSameStateActivities = config['skipedIfSameStateActivities'];

  this._currentActivity = -9999;
  this._currentActivityLastUpdate = undefined;
  this._currentSetAttemps = 0;
  this._foundAccessories = [];

  if (
    this.refreshTimer &&
    this.refreshTimer > 0 &&
    (this.refreshTimer < 5 || this.refreshTimer > 600)
  )
    this.refreshTimer = 300;

  this.log.debug(
    'INFO : following activites controls will be ignored if they are in the same state : ' +
      (this.addAllActivitiesToSkipedIfSameStateActivitiesList
        ? 'ALL'
        : this.skipedIfSameStateActivities)
  );

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object
    this.api = api;
    var that = this;
    this.api.on(
      'shutdown',
      function() {
        that.log('shutdown');
        if (that.timerID) {
          clearInterval(that.timerID);
          that.timerID = undefined;
        }
      }.bind(this)
    );
  }
}

HarmonyPlatformAsTVPlatform.prototype = {
  setTimer: function(on) {
    if (this.refreshTimer && this.refreshTimer > 0) {
      if (on && this.timerID == undefined) {
        this.log.debug(
          'Setting Timer for background refresh every  : ' +
            this.refreshTimer +
            's'
        );
        this.timerID = setInterval(
          () => this.refreshAccessory(),
          this.refreshTimer * 1000
        );
      } else if (!on && this.timerID !== undefined) {
        this.log.debug('Clearing Timer');
        clearInterval(this.timerID);
        this.timerID = undefined;
      }
    }
  },

  accessories: function(callback) {
    this.log('Loading activities...');

    var that = this;

    let headers = {
      Origin: 'http://localhost.nebula.myharmony.com',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    };

    let hubUrl = `http://${this.hubIP}:${DEFAULT_HUB_PORT}/`;

    let jsonBody = {
      'id ': 1,
      cmd: 'connect.discoveryinfo?get',
      params: {},
    };

    request(
      {
        url: hubUrl,
        method: 'POST',
        headers: headers,
        body: jsonBody,
        json: true,
      },
      function(error, response, body) {
        if (error) {
          that.log('Error retrieving info from hub : ' + error.message);
        } else if (response && response.statusCode !== 200) {
          that.log(
            'Did not received 200 statuts, but  ' +
              response.statusCode +
              ' instead from hub'
          );
        } else if (body && body.data) {
          that.friendlyName = body.data.friendlyName;
          that.remote_id = body.data.remoteId;
          that.domain = url.parse(body.data.discoveryServerUri).hostname;
          that.email = body.data.email;
          that.account_id = body.data.accountId;

          wsUrl = `ws://${that.hubIP}:${DEFAULT_HUB_PORT}/?domain=${
            that.domain
          }&hubId=${that.remote_id}`;

          that.wsp = new WebSocketAsPromised(wsUrl, {
            createWebSocket: url => new W3CWebSocket(url),
            packMessage: data => JSON.stringify(data),
            unpackMessage: message => JSON.parse(message),
            attachRequestId: (data, requestId) => {
              data.hbus.id = requestId;
              return data;
            },
            extractRequestId: data => data && data.id,
          });

          params = {
            verb: 'get',
            format: 'json',
          };

          payload = {
            hubId: that.remote_id,
            timeout: 30,
            hbus: {
              cmd: `vnd.logitech.harmony/vnd.logitech.harmony.engine?config`,
              id: 0,
              params: params,
            },
          };

          that.wsp
            .open()
            .then(() =>
              that.wsp.onUnpackedMessage.addListener(data => {
                that.wsp.removeAllListeners();

                that.log.debug('Hub config : ' + JSON.stringify(data));
                let activities = data.data.activity;

                let services = [];

                that.log('Creating Main TV Service');
                that.mainService = {
                  controlService: new Service.Television(
                    that.name,
                    'tvService'
                  ),
                  characteristics: [
                    Characteristic.Active,
                    Characteristic.ActiveIdentifier,
                    Characteristic.ConfiguredName,
                    Characteristic.SleepDiscoveryMode,
                    Characteristic.RemoteKey,
                  ],
                };
                that.mainService.controlService.subtype = that.name + ' TV';

                that.inputServices = [];

                for (let i = 0, len = activities.length; i < len; i++) {
                  if (activities[i].id != -1) {
                    let inputName = activities[i].label;
                    if (that.devMode) {
                      inputName = 'DEV' + inputName;
                    }

                    if (this.mainActivity == activities[i].label) {
                      that.mainActivityId = activities[i].id;
                      that.mainService.activityName = inputName;
                      that.mainService.activityId = activities[i].id;
                      that.mainService.controlService.id =
                        'M' + activities[i].id;
                      services.push(that.mainService);

                      that.tvSpeakerService = {
                        controlService: new Service.TelevisionSpeaker(
                          that.name + ' Volume',
                          'TVSpeaker'
                        ),
                        characteristics: [
                          Characteristic.Mute,
                          Characteristic.VolumeControlType,
                          Characteristic.VolumeSelector,
                          Characteristic.ConfiguredName,
                        ],
                      };
                      that.tvSpeakerService.controlService.id =
                        'V' + activities[i].id;
                      that.tvSpeakerService.controlService.subtype =
                        that.name + ' Volume';
                      that.mainService.controlService.addLinkedService(
                        that.tvSpeakerService
                      );
                      services.push(that.tvSpeakerService);
                    }

                    let inputSourceService = {
                      controlService: new Service.InputSource(
                        inputName,
                        'Input'
                      ),
                      characteristics: [
                        Characteristic.Identifier,
                        Characteristic.ConfiguredName,
                        Characteristic.InputSourceType,
                        Characteristic.IsConfigured,
                        Characteristic.CurrentVisibilityState,
                      ],
                    };
                    inputSourceService.controlService.id = activities[i].id;
                    inputSourceService.activityName = inputName;
                    inputSourceService.activityId = activities[i].id;
                    inputSourceService.controlService.subtype =
                      inputName + ' Activity';
                    that.mainService.controlService.addLinkedService(
                      inputSourceService
                    );
                    services.push(inputSourceService);
                    that.inputServices.push(inputSourceService);
                  }
                }
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

                //timer for background refresh
                that.setTimer(true);

                callback(that._foundAccessories);
              })
            )
            .then(() => that.wsp.sendPacked(payload))
            .catch(e => {
              that.log('ERROR : GetConfiguration :' + e);
              callback(that._foundAccessories);
            });
        } else {
          that.log(
            'Error : No config retrieved from hub, check IP and connectivity'
          );
          callback(that._foundAccessories);
        }
      }
    );
  },

  updateCharacteristic: function(characteristic, value, callback) {
    try {
      if (callback) {
        callback(undefined, value);
      } else {
        characteristic.updateValue(value);
      }
    } catch (error) {
      characteristic.updateValue(value);
    }
  },

  refreshCurrentActivity: function(callback) {
    if (
      this._currentActivity > CURRENT_ACTIVITY_NOT_SET_VALUE &&
      this._currentActivityLastUpdate &&
      Date.now() - this._currentActivityLastUpdate <
        TIMEOUT_REFRESH_CURRENT_ACTIVITY
    ) {
      // we don't refresh since status was retrieved not so far away
      this.log.debug(
        'INFO : NO refresh needed since last update was on :' +
          this._currentActivity +
          ' and current Activity is set'
      );
      callback();
    } else {
      this.log.debug(
        'INFO : Refresh needed since last update is too old or current Activity is not set : ' +
          this._currentActivity
      );

      params = {
        verb: 'get',
        format: 'json',
      };

      payload = {
        hubId: this.remote_id,
        timeout: 30,
        hbus: {
          cmd:
            'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
          id: 0,
          params: params,
        },
      };

      this.wsp
        .open()
        .then(() =>
          this.wsp.onUnpackedMessage.addListener(data => {
            this.wsp.removeAllListeners();

            if (
              data &&
              data.data &&
              data.code &&
              (data.code == 200 || data.code == 100)
            ) {
              this._currentActivity = data.data.result;
              this._currentActivityLastUpdate = Date.now();
            } else {
              this.log.debug(
                'WARNING : could not refresh current Activity :' + data
                  ? JSON.stringify(data)
                  : 'no data'
              );
              this._currentActivity = CURRENT_ACTIVITY_NOT_SET_VALUE;
            }
            callback();
          })
        )
        .then(() => this.wsp.sendPacked(payload))
        .catch(e => {
          this.log('ERROR : RefreshCurrentActivity : ' + e);
          this._currentActivity = CURRENT_ACTIVITY_NOT_SET_VALUE;
          callback();
        });
    }
  },

  refreshAccessory: function() {
    this.refreshCharacteristic(
      this.mainService.getCharacteristic(characteristic.Active),
      undefined
    );
    this.refreshCharacteristic(
      this.mainService.getCharacteristic(characteristic.ActiveIdentifier),
      undefined
    );
  },

  refreshCharacteristic: function(characteristic, callback) {
    this.refreshCurrentActivity(() => {
      if (this._currentActivity > CURRENT_ACTIVITY_NOT_SET_VALUE) {
        if (characteristic instanceof characteristic.Active) {
          this.updateCharacteristic(
            characteristic,
            this._currentActivity != -1,
            callback
          );
        } else if (characteristic instanceof characteristic.ActiveIdentifier) {
          this.updateCharacteristic(
            characteristic,
            this._currentActivity,
            callback
          );
        }
      } else {
        this.log.debug('WARNING : no current Activity');
        if (characteristic instanceof characteristic.Active) {
          this.updateCharacteristic(characteristic, false, callback);
        } else if (characteristic instanceof characteristic.ActiveIdentifier) {
          this.updateCharacteristic(characteristic, -1, callback);
        }
      }
    });
  },

  sendInputCommand: function(homebridgeAccessory, value, callback) {
    let doCommand = true;
    let commandToSend = value;
    //Actitiy in skipedIfSameState

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
      this.log.debug(
        'INFO : SET on an activty in skipedIfsameState list ' + inputName
      );

      //GLOBAL OFF SWITCH : do command only if we are not off
      if (commandToSend == -1) {
        doCommand =
          this._currentActivity != -1 &&
          this._currentActivity > CURRENT_ACTIVITY_NOT_SET_VALUE;
      }
      //ELSE, we do the command only if state is different.
      else {
        doCommand = this._currentActivity !== value;
      }
      if (doCommand) {
        this.log.debug('INFO : Activty ' + inputName + ' will be activated ');
      } else {
        this.log.debug(
          'INFO : Activty ' + inputName + ' will not be activated '
        );
      }
    } else {
      this.log.debug(
        'INFO : SET on an activty not in skipedIfameState list ' + inputName
      );
    }

    if (doCommand) {
      homebridgeAccessory.platform.activityCommand(homebridgeAccessory);
      callback();
    } else {
      callback();
      setTimeout(function() {
        this.refreshAccessory();
      }, DELAY_TO_UPDATE_STATUS);
    }
  },

  activityCommand: function(homebridgeAccessory) {
    //timer for background refresh
    this.setTimer(false);
    params = {
      async: 'true',
      timestamp: 0,
      args: {
        rule: 'start',
      },
      activityId: commandToSend,
    };

    cmd = 'harmony.activityengine?runactivity';

    payload = {
      hubId: this.remote_id,
      timeout: 30,
      hbus: {
        cmd: cmd,
        id: 0,
        params: params,
      },
    };

    this.wsp
      .open()
      .then(() =>
        this.wsp.onUnpackedMessage.addListener(data => {
          this.wsp.removeAllListeners();

          if (
            data &&
            data.code &&
            data.code == 200 &&
            data.msg &&
            data.msg == 'OK'
          ) {
            this._currentSetAttemps = 0;

            this._currentActivity = params.activityId;

            if (this._currentActivity != -1) {
              this.updateCharacteristic(
                this.mainActivity.getCharacteristic(
                  Characteristic.ActiveIdentifier
                ),
                this._currentActivity
              );
              this.updateCharacteristic(
                this.mainActivity.getCharacteristic(Characteristic.Active),
                true
              );
            } else {
              this.updateCharacteristic(
                this.mainActivity.getCharacteristic(Characteristic.Active),
                false
              );
            }

            //timer for background refresh - we delay it since activity can take some time to get up

            var that = this;
            setTimeout(function() {
              that.setTimer(true);
            }, DELAY_TO_RELAUNCH_TIMER);
          } else if (data) {
            if (data.code == 202 || data.code == 100) {
              this._currentSetAttemps = this._currentSetAttemps + 1;
              //get characteristic
              this.log.debug(
                'WARNING : could not SET status : ' + JSON.stringify(data)
              );

              //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
              var that = this;
              setTimeout(function() {
                if (that._currentSetAttemps < MAX_ATTEMPS_STATUS_UPDATE) {
                  that.log.debug('RETRY to send command ' + params.activityId);
                  that.command(cmd, params, homebridgeAccessory);
                } else {
                  that.log(
                    'ERROR : could not SET status, no more RETRY : ' +
                      +params.activityId
                  );
                  that.refreshAccessory();
                  //timer for background refresh
                  that.setTimer(true);
                }
              }, DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
            }
          } else {
            this.log('ERROR : could not SET status, no data');
            //timer for background refresh
            this.setTimer(true);
          }
        })
      )
      .then(() => this.wsp.sendPacked(payload))
      .catch(e => {
        this.log('ERROR : sendCommand :' + e);
        //timer for background refresh
        this.setTimer(true);
      });
  },

  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (characteristic instanceof Characteristic.Active) {
      //set to main activity or off
      characteristic.on(
        'set',
        function(value, callback, context) {
          this.sendInputCommand(
            homebridgeAccessory,
            value == 1 ? this.mainActivityId : -1,
            callback
          );
        }.bind(this)
      );

      characteristic.on(
        'get',
        function(callback) {
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
        function(value, callback, context) {
          this.sendInputCommand(homebridgeAccessory, value, callback);
        }.bind(this)
      );
      characteristic.on(
        'get',
        function(callback) {
          homebridgeAccessory.platform.refreshCharacteristic(
            characteristic,
            callback
          );
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.RemoteKey) {
      characteristic.on(
        'set',
        function(value, callback, context) {
          callback();
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.ConfiguredName) {
      if (service instanceof Service.TelevisionSpeaker) {
        characteristic.updateValue(this.name + 'Volume');
      } else if (service instanceof Service.Television) {
        characteristic.updateValue(this.name);
      } else if (service instanceof Service.InputSource) {
        characteristic.updateValue(service.controlService.name);
      }
    } else if (characteristic instanceof Characteristic.SleepDiscoveryMode) {
      characteristic.updateValue(
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      );
    } else if (characteristic instanceof Characteristic.Mute) {
      characteristic.on(
        'set',
        function(value, callback, context) {
          callback();
        }.bind(this)
      );

      characteristic.on(
        'get',
        function(callback) {
          callback(null, false);
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.Active) {
      characteristic.updateValue(Characteristic.Active.ACTIVE);
    } else if (characteristic instanceof Characteristic.VolumeControlType) {
      characteristic.updateValue(Characteristic.VolumeControlType.ABSOLUTE);
    } else if (characteristic instanceof Characteristic.VolumeSelector) {
      characteristic.on(
        'set',
        function(value, callback, context) {
          callback();
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.Identifier) {
      characteristic.updateValue(service.controlService.id.substring(1));
    } else if (characteristic instanceof Characteristic.InputSourceType) {
      characteristic.updateValue(Characteristic.InputSourceType.APPLICATION);
    } else if (characteristic instanceof Characteristic.IsConfigured) {
      characteristic.updateValue(Characteristic.IsConfigured.CONFIGURED);
    } else if (
      characteristic instanceof Characteristic.CurrentVisibilityState
    ) {
      characteristic.updateValue(Characteristic.CurrentVisibilityState.SHOWN);
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
    let informationService = homebridgeAccessory.platform.getInformationService(
      homebridgeAccessory
    );
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
};

function HarmonyAccessory(services) {
  this.services = services;
}
