DEFAULT_HUB_PORT = '8088';

var Service, Characteristic, HomebridgeAPI;
var request = require('request');
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

function HarmonyPlatform(log, config) {
  this.log = log;
  this.hubIP = config['hubIP'];
  this.showTurnOffActivity = config['showTurnOffActivity'];
  this.turnOffActivityName = config['turnOffActivityName'];
  this.name = config['name'];
  this.devMode = config['DEVMODE'];
  this.refreshTimer = config['refreshTimer'];
  this._msgId = 0;

  this._currentSetAttemps = 0;
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
  accessories: function(callback) {
    this.log('Loading activities...');

    var that = this;

    var headers = {
      Origin: 'http://localhost.nebula.myharmony.com',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    };

    var hubUrl = `http://${this.hubIP}:${DEFAULT_HUB_PORT}/`;

    var jsonBody = {
      'id ': 1,
      cmd: 'connect.discoveryinfo?get',
      params: {},
    };

    var foundAccessories = [];

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
          });

          that._msgId = that._msgId + 1;

          params = {
            verb: 'get',
            format: 'json',
          };

          payload = {
            hubId: that.remote_id,
            timeout: 30,
            hbus: {
              cmd: `vnd.logitech.harmony/vnd.logitech.harmony.engine?config`,
              id: that._msgId,
              params: params,
            },
          };

          that.wsp.onUnpackedMessage.addListener(data => {
            that.wsp.removeAllListeners();
            var services = [];

            that.log.debug('Hub config : ' + JSON.stringify(data));
            var activities = data.data.activity;

            for (var i = 0, len = activities.length; i < len; i++) {
              if (activities[i].id != -1 || that.showTurnOffActivity) {
                var switchName = activities[i].label;
                if (activities[i].id == -1 && that.turnOffActivityName) {
                  switchName = that.turnOffActivityName;
                }
                if (that.devMode) {
                  switchName = 'DEV' + switchName;
                }
                that.log('Discovered Activity : ' + switchName);
                var service = {
                  controlService: new Service.Switch(switchName),
                  characteristics: [Characteristic.On],
                };
                service.controlService.subtype = switchName;
                service.controlService.id = activities[i].id;
                services.push(service);
              }
            }
            accessory = new HarmonyAccessory(services);
            accessory.getServices = function() {
              return that.getServices(accessory);
            };
            accessory.platform = that;
            accessory.remoteAccessory = activities;
            accessory.name = that.name;
            accessory.model = 'Harmony';
            accessory.manufacturer = 'Harmony';
            accessory.serialNumber = that.hubIP;
            foundAccessories.push(accessory);

            //timer for background refresh
            if (that.refreshTimer && that.refreshTimer > 0) {
              that.log(
                'Setting Timer for background refresh every  : ' +
                  that.refreshTimer * 1000
              ) + 's';
              that.timerID = setInterval(
                () => that.refreshAccessories(accessory),
                that.refreshTimer * 1000
              );
            }
            callback(foundAccessories);
          });

          that.wsp
            .open()
            .then(() => that.wsp.sendPacked(payload))
            .catch(e => {
              that.log('Error :' + e);
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
  updateAccessory: function(characteristic, characteristicIsOn, callback) {
    try {
      if (callback) callback(undefined, characteristicIsOn);
      else {
        characteristic.updateValue(characteristicIsOn, undefined, undefined);
      }
    } catch (error) {
      characteristic.updateValue(characteristicIsOn, undefined, undefined);
    }
  },
  refreshAccessory: function(service, homebridgeAccessory, callback) {
    this._msgId = this._msgId + 1;

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
        id: this._msgId,
        params: params,
      },
    };

    this.wsp.onUnpackedMessage.addListener(data => {
      this.wsp.removeAllListeners();

      var serviceControl = service.controlService;
      var characteristic = serviceControl.getCharacteristic(Characteristic.On);

      if (
        data &&
        data.data &&
        data.code &&
        (data.code == 200 || data.code == 100)
      ) {
        var characteristicIsOn = false;

        if (data.data.result == serviceControl.id) {
          characteristicIsOn = true;
        }

        this.log.debug(
          'Got status for ' +
            serviceControl.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        homebridgeAccessory.platform.updateAccessory(
          characteristic,
          characteristicIsOn,
          callback
        );
      } else if (data) {
        this.log.debug(
          'WARNING : could not get status :' + JSON.stringify(data)
        );
        homebridgeAccessory.platform.updateAccessory(
          characteristic,
          characteristic.value,
          callback
        );
      } else {
        this.log('ERROR : could not set status, no data');
        homebridgeAccessory.platform.updateAccessory(
          characteristic,
          characteristic.value,
          callback
        );
      }
    });

    this.wsp
      .open()
      .then(() => this.wsp.sendPacked(payload))
      .catch(e => {
        this.log('Error : ' + e);
        callback(undefined, false);
      });
  },
  refreshAccessories: function(homebridgeAccessory) {
    for (var s = 0; s < homebridgeAccessory.services.length; s++) {
      var service = homebridgeAccessory.services[s];
      homebridgeAccessory.platform.refreshAccessory(
        service,
        homebridgeAccessory,
        undefined
      );
    }
  },
  command: function(cmd, params, homebridgeAccessory) {
    this._msgId = this._msgId + 1;
    payload = {
      hubId: this.remote_id,
      timeout: 30,
      hbus: {
        cmd: cmd,
        id: this._msgId,
        params: params,
      },
    };

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

        for (var s = 0; s < homebridgeAccessory.services.length; s++) {
          var serviceControl = homebridgeAccessory.services[s].controlService;
          var characteristic = serviceControl.getCharacteristic(
            Characteristic.On
          );

          if (serviceControl.id == params.activityId) {
            this.log(serviceControl.displayName + ' activated');
          }

          //we disable previous activiies that were on
          if (
            serviceControl.id != -1 &&
            serviceControl.id != params.activityId &&
            characteristic.value
          ) {
            this.log.debug('Switching off ' + serviceControl.displayName);
            characteristic.updateValue(false, undefined, undefined);
          }

          //we turn off Off Activity if another activity was launched
          if (serviceControl.id == -1 && params.activityId != -1) {
            this.log.debug(
              'New activity on , turning off off Activity ' +
                serviceControl.displayName
            );
            characteristic.updateValue(false, undefined, undefined);
          }

          //we turn on Off Activity if we turned off an activity (or turn on the general switch)
          if (serviceControl.id == -1 && params.activityId == -1) {
            this.log.debug(
              'Turning on off Activity ' + serviceControl.displayName
            );
            characteristic.updateValue(true, undefined, undefined);
          }
        }
      } else if (data) {
        if (data.code == 202 || data.code == 100) {
          this._currentSetAttemps = this._currentSetAttemps + 1;
          //get characteristic
          this.log.debug(
            'WARNING : could not SET status : ' + JSON.stringify(data)
          );

          var charactToSet;
          for (var s = 0; s < homebridgeAccessory.services.length; s++) {
            var serviceControl = homebridgeAccessory.services[s].controlService;
            var characteristic = serviceControl.getCharacteristic(
              Characteristic.On
            );
            if (serviceControl.id == params.activityId) {
              charactToSet = characteristic;
              break;
            }
          }

          //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
          var that = this;
          setTimeout(function() {
            if (that._currentSetAttemps < 10) {
              that.log.debug('RETRY to SET ON : ' + serviceControl.displayName);
              charactToSet.setValue(true, undefined, undefined);
            } else {
              that.log(
                'ERROR : could not SET status, no more RETRY : ' +
                  +serviceControl.displayName
              );
              charactToSet.updateValue(false, undefined, undefined);
            }
          }, 2000);
        }
      } else {
        this.log('ERROR : could not SET status, no data');
      }
    });

    this.wsp
      .open()
      .then(() => this.wsp.sendPacked(payload))
      .catch(e => this.log('Error :' + e));
  },
  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    characteristic.on(
      'set',
      function(value, callback, context) {
        params = {
          async: 'false',
          timestamp: 0,
          args: {
            rule: 'start',
          },
          activityId: value ? service.controlService.id : '-1',
        };
        cmd = 'harmony.activityengine?runactivity';
        homebridgeAccessory.platform.command(cmd, params, homebridgeAccessory);
        callback();
      }.bind(this)
    );
    characteristic.on(
      'get',
      function(callback) {
        homebridgeAccessory.platform.refreshAccessory(
          service,
          homebridgeAccessory,
          callback
        );
      }.bind(this)
    );
  },
  getInformationService: function(homebridgeAccessory) {
    var informationService = new Service.AccessoryInformation();
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
    var services = [];
    var informationService = homebridgeAccessory.platform.getInformationService(
      homebridgeAccessory
    );
    services.push(informationService);
    for (var s = 0; s < homebridgeAccessory.services.length; s++) {
      var service = homebridgeAccessory.services[s];
      for (var i = 0; i < service.characteristics.length; i++) {
        var characteristic = service.controlService.getCharacteristic(
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
