var Service, Characteristic;

const request = require('request');
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');
const HarmonyConst = require('./harmonyConst');

module.exports = {
  HarmonyBase: HarmonyBase,
};

function HarmonyBase(api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
}

HarmonyBase.prototype = {
  configCommonProperties: function(log, config, harmonyPlatform) {
    harmonyPlatform.log = log;
    harmonyPlatform.hubIP = config['hubIP'];

    harmonyPlatform.name = config['name'];
    harmonyPlatform.devMode = config['DEVMODE'];
    harmonyPlatform.refreshTimer = config['refreshTimer'];
    harmonyPlatform.refreshByHub = config['refreshByHub'];
    harmonyPlatform.addAllActivitiesToSkipedIfSameStateActivitiesList =
      config['addAllActivitiesToSkipedIfSameStateActivitiesList'];
    harmonyPlatform.skipedIfSameStateActivities =
      config['skipedIfSameStateActivities'];

    harmonyPlatform._currentActivity = -9999;
    harmonyPlatform._currentActivityLastUpdate = undefined;
    harmonyPlatform._currentSetAttemps = 0;
    harmonyPlatform._foundAccessories = [];

    if (harmonyPlatform.refreshByHub == undefined)
      harmonyPlatform.refreshByHub = true;

    if (
      !harmonyPlatform.refreshByHub &&
      harmonyPlatform.refreshTimer &&
      harmonyPlatform.refreshTimer > 0 &&
      (harmonyPlatform.refreshTimer < 5 || harmonyPlatform.refreshTimer > 600)
    )
      harmonyPlatform.refreshTimer = 300;

    harmonyPlatform.log.debug(
      'INFO : following activites controls will be ignored if they are in the same state : ' +
        (harmonyPlatform.addAllActivitiesToSkipedIfSameStateActivitiesList
          ? 'ALL'
          : harmonyPlatform.skipedIfSameStateActivities)
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
    let informationService = this.getInformationService(homebridgeAccessory);
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

  setTimer: function(on, harmonyPlatform) {
    if (!harmonyPlatform.refreshByHub) {
      if (harmonyPlatform.refreshTimer && harmonyPlatform.refreshTimer > 0) {
        if (on && harmonyPlatform.timerID == undefined) {
          harmonyPlatform.log.debug(
            'INFO - setTimer - Setting Timer for background refresh every  : ' +
              harmonyPlatform.refreshTimer +
              's'
          );
          harmonyPlatform.timerID = setInterval(
            () => harmonyPlatform.refreshAccessory(),
            harmonyPlatform.refreshTimer * 1000
          );
        } else if (!on && harmonyPlatform.timerID !== undefined) {
          harmonyPlatform.log.debug('INFO - setTimer - Clearing Timer');
          clearInterval(harmonyPlatform.timerID);
          harmonyPlatform.timerID = undefined;
        }
      }
    } else {
      if (on) {
        var payload = {
          hubId: harmonyPlatform.remote_id,
          timeout: 30,
          hbus: {
            cmd: 'vnd.logitech.connect/vnd.logitech.statedigest?get',
            id: 0,
            params: {
              verb: 'get',
              format: 'json',
            },
          },
        };

        harmonyPlatform.wspRefresh.onClose.addListener(() => {
          harmonyPlatform.wspRefresh.removeAllListeners();
          harmonyPlatform.log.debug('INFO - RefreshSocket - Closed');
          clearInterval(harmonyPlatform.timerID);
        });

        harmonyPlatform.wspRefresh
          .open()
          .then(() => this._heartbeat(harmonyPlatform))
          .then(() =>
            harmonyPlatform.wspRefresh.onUnpackedMessage.addListener(
              harmonyPlatform._onMessage.bind(harmonyPlatform)
            )
          )
          .then(() => harmonyPlatform.wspRefresh.sendPacked(payload))
          .then(() =>
            harmonyPlatform.log.debug('INFO - RefreshSocket - Opened')
          )
          .catch(e => {
            harmonyPlatform.log('ERROR - setTimer wspRefresh :' + e);
            clearInterval(this.timerID);
            harmonyPlatform.log('INFO - relaunching timer');
            var that = this;
            setTimeout(function() {
              that.setTimer(true);
            }, HarmonyConst.DELAY_TO_RELAUNCH_TIMER);
          });
      } else {
        harmonyPlatform.wspRefresh.close();
      }
    }
  },

  _heartbeat(harmonyPlatform) {
    harmonyPlatform.timerID = setInterval(
      () => harmonyPlatform.wspRefresh.send(''),
      55000
    );
  },

  configureAccessories: function(harmonyPlatform, callback) {
    harmonyPlatform.log('Loading activities...');

    let headers = {
      Origin: 'http://localhost.nebula.myharmony.com',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    };

    let hubUrl = `http://${harmonyPlatform.hubIP}:${
      HarmonyConst.DEFAULT_HUB_PORT
    }/`;

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
          harmonyPlatform.log(
            'Error retrieving info from hub : ' + error.message
          );
        } else if (response && response.statusCode !== 200) {
          harmonyPlatform.log(
            'Did not received 200 statuts, but  ' +
              response.statusCode +
              ' instead from hub'
          );
        } else if (body && body.data) {
          harmonyPlatform.friendlyName = body.data.friendlyName;
          harmonyPlatform.remote_id = body.data.remoteId;
          harmonyPlatform.domain = url.parse(
            body.data.discoveryServerUri
          ).hostname;
          harmonyPlatform.email = body.data.email;
          harmonyPlatform.account_id = body.data.accountId;

          wsUrl = `ws://${harmonyPlatform.hubIP}:${
            HarmonyConst.DEFAULT_HUB_PORT
          }/?domain=${harmonyPlatform.domain}&hubId=${
            harmonyPlatform.remote_id
          }`;

          harmonyPlatform.wsp = new WebSocketAsPromised(wsUrl, {
            createWebSocket: url => new W3CWebSocket(url),
            packMessage: data => JSON.stringify(data),
            unpackMessage: message => JSON.parse(message),
            attachRequestId: (data, requestId) => {
              data.hbus.id = requestId;
              return data;
            },
            extractRequestId: data => data && data.id,
          });

          if (harmonyPlatform.refreshByHub) {
            harmonyPlatform.wspRefresh = new WebSocketAsPromised(wsUrl, {
              createWebSocket: url => new W3CWebSocket(url),
              packMessage: data => JSON.stringify(data),
              unpackMessage: message => JSON.parse(message),
              attachRequestId: (data, requestId) => {
                data.hbus.id = requestId;
                return data;
              },
              extractRequestId: data => data && data.id,
            });
          }

          payload = {
            hubId: harmonyPlatform.remote_id,
            timeout: 30,
            hbus: {
              cmd: `vnd.logitech.harmony/vnd.logitech.harmony.engine?config`,
              id: 0,
              params: {
                verb: 'get',
                format: 'json',
              },
            },
          };

          harmonyPlatform.wsp
            .open()
            .then(() =>
              harmonyPlatform.wsp.onUnpackedMessage.addListener(data => {
                harmonyPlatform.wsp.removeAllListeners();
                harmonyPlatform.log.debug(
                  'Hub config : ' + JSON.stringify(data)
                );

                harmonyPlatform.readAccessories(data, callback);
              })
            )
            .then(() => harmonyPlatform.wsp.sendPacked(payload))
            .catch(e => {
              harmonyPlatform.log('ERROR : GetConfiguration :' + e);
              callback(harmonyPlatform._foundAccessories);
            });
        } else {
          harmonyPlatform.log(
            'Error : No config retrieved from hub, check IP and connectivity'
          );
          callback(harmonyPlatform._foundAccessories);
        }
      }
    );
  },
};
