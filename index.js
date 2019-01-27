DEFAULT_HUB_PORT = '8088';
TIMEOUT_REFRESH_CURRENT_ACTIVITY = 1500;
CURRENT_ACTIVITY_NOT_SET_VALUE = -9999;
MAX_ATTEMPS_STATUS_UPDATE = 12;
DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE = 2000;
DELAY_TO_UPDATE_STATUS = 800;

var Service, Characteristic;
var request = require('request');
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

function HarmonyPlatform(log, config, api) {
  this.log = log;
  this.hubIP = config['hubIP'];
  this.showTurnOffActivity = config['showTurnOffActivity'];
  this.name = config['name'];
  this.devMode = config['DEVMODE'];
  this.refreshTimer = config['refreshTimer'];
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
    (this.refreshTimer < 15 || this.refreshTimer > 600)
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

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  homebridge.registerPlatform(
    'homebridge-harmonyHub',
    'HarmonyHubWebSocket',
    HarmonyPlatform
  );
};

HarmonyPlatform.prototype = {
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

                for (let i = 0, len = activities.length; i < len; i++) {
                  if (activities[i].id != -1 || that.showTurnOffActivity) {
                    let services = [];

                    let switchName = activities[i].label;

                    if (that.devMode) {
                      switchName = 'DEV' + switchName;
                    }
                    that.log('Discovered Activity : ' + switchName);
                    let service = {
                      controlService: new Service.Switch(switchName),
                      characteristics: [Characteristic.On],
                    };
                    service.controlService.subtype = switchName;
                    service.controlService.id = activities[i].id;
                    services.push(service);

                    let myHarmonyAccessory = new HarmonyAccessory(services);
                    myHarmonyAccessory.getServices = function() {
                      return that.getServices(myHarmonyAccessory);
                    };
                    myHarmonyAccessory.platform = that;
                    myHarmonyAccessory.name = switchName;
                    myHarmonyAccessory.model = that.name;
                    myHarmonyAccessory.manufacturer = 'Harmony';
                    myHarmonyAccessory.serialNumber = that.hubIP;
                    that._foundAccessories.push(myHarmonyAccessory);
                  }
                }
                //timer for background refresh
                that.setTimer(true);

                callback(that._foundAccessories);
              })
            )
            .then(() => that.wsp.sendPacked(payload))
            .catch(e => {
              that.log('ERROR : GetConfiguration :' + e);
              callback(foundAccessories);
            });
        } else {
          that.log(
            'Error : No config retrieved from hub, check IP and connectivity'
          );
          callback(foundAccessories);
        }
      }
    );
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

  refreshService: function(service, homebridgeAccessory, callback) {
    var serviceControl = service.controlService;
    var characteristic = serviceControl.getCharacteristic(Characteristic.On);

    this.refreshCurrentActivity(() => {
      if (this._currentActivity > CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this._currentActivity == serviceControl.id;

        this.log.debug(
          'Got status for ' +
            serviceControl.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        homebridgeAccessory.platform.updateCharacteristic(
          characteristic,
          characteristicIsOn,
          callback
        );
      } else {
        this.log.debug('WARNING : no current Activity');
        homebridgeAccessory.platform.updateCharacteristic(
          characteristic,
          characteristic.value,
          callback
        );
      }
    });
  },

  refreshAccessory: function() {
    for (let a = 0; a < this._foundAccessories.length; a++) {
      let myHarmonyAccessory = this._foundAccessories[a];
      for (let s = 0; s < myHarmonyAccessory.services.length; s++) {
        let service = myHarmonyAccessory.services[s];
        this.refreshService(service, myHarmonyAccessory, undefined);
      }
    }
  },

  command: function(cmd, params, homebridgeAccessory) {
    //timer for background refresh
    this.setTimer(false);

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

            let serviceControl = homebridgeAccessory.services[0].controlService;
            this.log(serviceControl.displayName + ' activated');

            for (let s = 0; s < this._foundAccessories.length; s++) {
              let otherServiceControl = this._foundAccessories[s].services[0]
                .controlService;
              let characteristic = otherServiceControl.getCharacteristic(
                Characteristic.On
              );

              //we disable previous activities that were on
              if (
                otherServiceControl.id != -1 &&
                otherServiceControl.id != params.activityId &&
                characteristic.value
              ) {
                this.log.debug(
                  'Switching off ' + otherServiceControl.displayName
                );
                characteristic.updateValue(false);
              }

              //we turn off Off Activity if another activity was launched
              if (otherServiceControl.id == -1 && params.activityId != -1) {
                this.log.debug(
                  'New activity on , turning off off Activity ' +
                    otherServiceControl.displayName
                );
                characteristic.updateValue(false);
              }

              //we turn on Off Activity if we turned off an activity (or turn on the general switch)
              if (otherServiceControl.id == -1 && params.activityId == -1) {
                this.log.debug(
                  'Turning on off Activity ' + serviceControl.displayName
                );
                characteristic.updateValue(true);
              }
            }

            this._currentActivity = params.activityId;
            //timer for background refresh
            this.setTimer(true);
          } else if (data) {
            if (data.code == 202 || data.code == 100) {
              this._currentSetAttemps = this._currentSetAttemps + 1;
              //get characteristic
              this.log.debug(
                'WARNING : could not SET status : ' + JSON.stringify(data)
              );

              var serviceControl =
                homebridgeAccessory.services[0].controlService;
              var charactToSet = serviceControl.getCharacteristic(
                Characteristic.On
              );

              //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
              var that = this;
              setTimeout(function() {
                if (that._currentSetAttemps < MAX_ATTEMPS_STATUS_UPDATE) {
                  that.log.debug(
                    'RETRY to SET ON : ' + serviceControl.displayName
                  );
                  charactToSet.setValue(true, callback, undefined);
                } else {
                  that.log(
                    'ERROR : could not SET status, no more RETRY : ' +
                      +serviceControl.displayName
                  );
                  charactToSet.updateValue(false);
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
    characteristic.on(
      'set',
      function(value, callback, context) {
        let doCommand = true;
        let commandToSend = value ? service.controlService.id : '-1';
        let currentValue = characteristic.value;
        //Actitiy in skipedIfSameState
        if (
          this.addAllActivitiesToSkipedIfSameStateActivitiesList ||
          (this.skipedIfSameStateActivities &&
            this.skipedIfSameStateActivities.includes(
              service.controlService.subtype
            ))
        ) {
          this.log.debug(
            'INFO : SET on an activty in skipedIfsameState list ' +
              service.controlService.subtype
          );

          this.log.debug(
            'INFO : Activty ' +
              service.controlService.subtype +
              ' is ' +
              currentValue +
              ', wants to set to ' +
              value
          );
          //GLOBAL OFF SWITCH : do command only if it is off and we want to set it on since on state can't be reversed
          if (service.controlService.id == -1) {
            doCommand = !currentValue && value;
          }
          //ELSE, we do the command only if state is different.
          else {
            doCommand = currentValue !== value;
          }
          if (doCommand) {
            this.log.debug(
              'INFO : Activty ' +
                service.controlService.subtype +
                ' will be sent command ' +
                commandToSend
            );
          } else {
            this.log.debug(
              'INFO : Activty ' +
                service.controlService.subtype +
                ' will not be sent any command '
            );
          }
        } else {
          this.log.debug(
            'INFO : SET on an activty not in skipedIfsameState list ' +
              service.controlService.subtype
          );
        }

        if (doCommand) {
          params = {
            async: 'true',
            timestamp: 0,
            args: {
              rule: 'start',
            },
            activityId: commandToSend,
          };
          cmd = 'harmony.activityengine?runactivity';
          homebridgeAccessory.platform.command(
            cmd,
            params,
            homebridgeAccessory
          );
          callback();
        } else {
          callback();
          setTimeout(function() {
            characteristic.updateValue(currentValue);
          }, DELAY_TO_UPDATE_STATUS);
        }
      }.bind(this)
    );
    characteristic.on(
      'get',
      function(callback) {
        homebridgeAccessory.platform.refreshService(
          service,
          homebridgeAccessory,
          callback
        );
      }.bind(this)
    );
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
