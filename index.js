DEFAULT_HUB_PORT = '8088'

var Service, Characteristic, HomebridgeAPI;
var request = require("request");
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

function HarmonyPlatform(log, config) {
  this.log = log;
  this.hubIP = config["hubIP"];
  this.showTurnOffActivity = config["showTurnOffActivity"];
  this.TurnOffActivityName  = config["turnOffActivityName"];
  this.name = config["name"];
  this.devMode = config["DEVMODE"];
  this._msgId = 0;
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  homebridge.registerPlatform("homebridge-harmonyHub", "HarmonyHub", HarmonyPlatform);
}

HarmonyPlatform.prototype = {

  accessories: function (callback) {
    this.log("Loading activities...");

    var that = this;

    var headers = {
      'Origin': 'http://localhost.nebula.myharmony.com',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
    }

    var hubUrl = `http://${this.hubIP}:${DEFAULT_HUB_PORT}/`

    var jsonBody = {
      "id ": 1,
      "cmd": "connect.discoveryinfo?get",
      "params": {}
    }

    var foundAccessories = [];

    request({
      url: hubUrl,
      method: 'POST',
      headers: headers,
      body: jsonBody,
      json: true
    },
      function (error, response, body) {
        if (error) {
          that.log("Error retrieving info from hub : " + error.message);
        }
        else if (response && response.statusCode !== 200) {
          that.log("Did not received 200 statuts, but  " + response.statusCode + " instead from hub");
        }
        else if (body && body.data) {
          that.friendlyName = body.data.friendlyName;
          that.remote_id = body.data.remoteId;
          that.domain = (url.parse(body.data.discoveryServerUri).hostname);
          that.email = body.data.email;
          that.account_id = body.data.accountId;

          wsUrl = `ws://${that.hubIP}:${DEFAULT_HUB_PORT}/?domain=${that.domain}&hubId=${that.remote_id}`;

          that.wsp = new WebSocketAsPromised(wsUrl, {
            createWebSocket: url => new W3CWebSocket(url),
            packMessage: data => JSON.stringify(data),
            unpackMessage: message => JSON.parse(message)
          });

          that._msgId = that._msgId + 1;

          params = {
            "verb": "get",
            "format": "json"
          }

          payload = {
            "hubId": that.remote_id,
            "timeout": 30,
            "hbus": {
              "cmd": `vnd.logitech.harmony/vnd.logitech.harmony.engine?config`,
              "id": that._msgId,
              "params": params
            }
          }

          that.wsp.onUnpackedMessage.addListener((data) => {
            that.wsp.removeAllListeners();
            var services = [];

            var activities = data.data.activity;

            for (var i = 0, len = activities.length; i < len; i++) {

              if (activities[i].id != -1 || that.showTurnOffActivity) {
                var switchName = activities[i].label;
                if (activities[i].id == -1 && that.TurnOffActivityName)
                {
                  switchName = that.TurnOffActivityName
                }
                if (that.devMode)
                {
                  switchName = "DEV" + switchName;
                }
                that.log("Discovered Activity : " + switchName);
                var service = {
                  controlService: new Service.Switch(switchName) ,
                  characteristics: [Characteristic.On]
                };
                service.controlService.subtype = switchName;
                service.controlService.id = activities[i].id;
                services.push(service);
              }
            }
            accessory = new HarmonyAccessory(services);
            accessory.getServices = function () {
              return that.getServices(accessory);
            };
            accessory.platform = that;
            accessory.remoteAccessory = activities;
            accessory.name = that.name;
            accessory.model = "Harmony";
            accessory.manufacturer = "Harmony";
            accessory.serialNumber = "<unknown>";
            foundAccessories.push(accessory);

            callback(foundAccessories);
          });

          that.wsp.open()
            .then(() => that.wsp.sendPacked(payload))
            .catch((e) => { that.log("Error :" + e); callback(foundAccessories); });
        }
        else {
          that.log("Error : No config retrieved from hub, check IP and connectivity");
          callback(foundAccessories);
        }
      });

  },
  command: function (cmd, params, homebridgeAccessory) {

    this._msgId = this._msgId + 1;
    payload = {
      "hubId": this.remote_id,
      "timeout": 30,
      "hbus": {
        "cmd": cmd,
        "id": this._msgId,
        "params": params
      }
    }

    this.wsp.onUnpackedMessage.addListener((data) => {
      this.wsp.removeAllListeners();

      for (var s = 0; s < homebridgeAccessory.services.length; s++) {
        var service = homebridgeAccessory.services[s];
        var characteristic = service.controlService.getCharacteristic(service.characteristics[0]);

        if (service.controlService.id == params.activityId)
        {
          this.log(service.controlService.displayName + " launched");
        }

        if (service.controlService.id !=-1 && service.controlService.id != params.activityId && characteristic.value)
        {
          this.log("Switching off " + service.controlService.displayName);
          characteristic.updateValue(false,undefined,'fromSetValue');
        }

        if (service.controlService.id == -1 && params.activityId == -1)
        {
          this.log("Everything is off, turning on off Activity " + service.controlService.displayName);
          characteristic.updateValue(true,undefined,'fromSetValue');
        }

        if (service.controlService.id == -1 && params.activityId != -1 && characteristic.value)
        {
          this.log("New activity on , turning off off Activity " + service.controlService.displayName);
          characteristic.updateValue(false,undefined,'fromSetValue');
        }
      }
    });

    this.wsp.open()
      .then(() => this.wsp.sendPacked(payload))
      .catch((e) => { this.log("Error :" + e); });

  },
  getInformationService: function (homebridgeAccessory) {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, homebridgeAccessory.name)
      .setCharacteristic(Characteristic.Manufacturer, homebridgeAccessory.manufacturer)
      .setCharacteristic(Characteristic.Model, homebridgeAccessory.model)
      .setCharacteristic(Characteristic.SerialNumber, homebridgeAccessory.serialNumber);
    return informationService;
  },

  bindCharacteristicEvents: function (characteristic, service, homebridgeAccessory) {

    characteristic
      .on('set', function (value, callback, context) {
        if (context !== 'fromSetValue') {
          params = {
            "async": "false",
            "timestamp": 0,
            "args": {
              "rule": "start"
            },
            "activityId": value ? service.controlService.id : "-1"
          };
          cmd = 'harmony.activityengine?runactivity';
          homebridgeAccessory.platform.command(cmd, params, homebridgeAccessory);
        }
        callback();
      }.bind(this));
    characteristic
      .on('get', function (callback) {

        this._msgId = this._msgId + 1;

        params = {
          "verb": "get",
          "format": "json"
        }

        payload = {
          "hubId": this.remote_id,
          "timeout": 30,
          "hbus": {
            "cmd": 'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
            "id": this._msgId,
            "params": params
          }
        }

        this.wsp.onUnpackedMessage.addListener((data) => {
          this.wsp.removeAllListeners();
          this.log("Got status for " + service.controlService.displayName);

          callback(null, data.data.result == service.controlService.id);
        });

        this.wsp.open()
          .then(() => this.wsp.sendPacked(payload))
          .catch((e) => { this.log("Error : " + e); });

        callback(undefined, false);

      }.bind(this));
  },


  getServices: function (homebridgeAccessory) {
    var services = [];
    var informationService = homebridgeAccessory.platform.getInformationService(homebridgeAccessory);
    services.push(informationService);
    for (var s = 0; s < homebridgeAccessory.services.length; s++) {
      var service = homebridgeAccessory.services[s];
      for (var i = 0; i < service.characteristics.length; i++) {
        var characteristic = service.controlService.getCharacteristic(service.characteristics[i]);
        if (characteristic == undefined)
          characteristic = service.controlService.addCharacteristic(service.characteristics[i]);
        homebridgeAccessory.platform.bindCharacteristicEvents(characteristic, service, homebridgeAccessory);
      }
      services.push(service.controlService);
    }
    return services;
  }
}

function HarmonyAccessory(services) {
  this.services = services;
}
