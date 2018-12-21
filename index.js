DEFAULT_HUB_PORT = '8088'

var Service, Characteristic, HomebridgeAPI;
var request = require("request");
const url = require('url');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');



function HarmonyPlatform(log, config){
  this.log       = log;
  this.hupIP     = config["hubIP"];
  this._msgId = 0;


}

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;
  homebridge.registerPlatform("homebridge-harmonyHub", "HarmonyHub", HarmonyPlatform);
}

HarmonyPlatform.prototype = {

  accessories: function(callback) {
    this.log("Loading activities...");

    var that = this;

    var headers = {
      'Origin': 'http://localhost.nebula.myharmony.com',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
  }
  
  var hubUrl = `http://${this.hupIP}:${DEFAULT_HUB_PORT}/`
  
 var jsonBody = {
      "id ": 1,
      "cmd": "connect.discoveryinfo?get",
      "params": {}
  }
  
  request({
      url: hubUrl,
      method: 'POST',
      headers: headers,
      body: jsonBody,
      json: true
  }, 
      function (error, response, body) {
          if (error) {
              that.log(error.message);
          }
          else if (response && response.statusCode !== 200) {
            that.log('No 200 return ' + response.statusCode);
          }
          else if (body && body.data) {
              that.friendlyName = body.data.friendlyName;
              that.remote_id = body.data.remoteId;
              that.domain =  (url.parse(body.data.discoveryServerUri).hostname) ; 
              that.email = body.data.email;
              that.account_id = body.data.accountId;
  
              wsUrl = `ws://${that.hupIP}:${DEFAULT_HUB_PORT}/?domain=${that.domain}&hubId=${that.remote_id}`;

              that.wsp = new WebSocketAsPromised(wsUrl, {
                createWebSocket: url => new W3CWebSocket(url),
                packMessage: data => JSON.stringify(data),
                unpackMessage: message => JSON.parse(message)
              });

              that._msgId = that._msgId + 1;

              params = {
                  "verb"  : "get",
                  "format": "json"
              }
  
              payload = {
                  "hubId"  : that.remote_id,
                  "timeout": 30,
                  "hbus"   : {
                      "cmd": `vnd.logitech.harmony/vnd.logitech.harmony.engine?config`,
                      "id" : that._msgId,
                      "params": params
                  }
              }
  
              that.wsp.onUnpackedMessage.addListener((data) => 
                                                  {
                                                    that.wsp.close();
                                                    that.wsp.removeAllListeners();
                                                    var foundAccessories = [];
                                                    var services = [];

                                                    var activities = data.data.activity;

                                                    for (var i = 0, len = activities.length; i < len; i++) {
                                                        
                                                        if (activities[i].id != -1)
                                                        {
                                                          that.log(activities[i].label + "/" + activities[i].id);
                                                          var service = {
                                                            controlService: new Service.Switch(activities[i].label),
                                                            characteristics: [Characteristic.On]
                                                          };
                                                          service.controlService.subtype = activities[i].label;
                                                          service.controlService.id = activities[i].id;
                                                          services.push(service);
                                                        }
                                                    }
                                                    accessory = new HarmonyAccessory(services);
                                                    accessory.getServices = function() {
                                                      return that.getServices(accessory);
                                                    };
                                                    accessory.platform 			= that;
                                                    accessory.remoteAccessory	= activities;
                                                    accessory.name				= "Harmony" + data.id;
                                                    accessory.model				= "Harmony";
                                                    accessory.manufacturer		= "Harmony";
                                                    accessory.serialNumber		= "<unknown>";
                                                    foundAccessories.push(accessory);

                                                    callback(foundAccessories);
                                                  });
  
              that.wsp.open()
                .then(() => that.wsp.sendPacked(payload))
                .catch((e) => {console.error(e); callback(null);});

          }
          else {
              console.log('No body');
              callback(null);
          } 
    });

  },
  command: function(cmd,params, homebridgeAccessory) {

  this._msgId = this._msgId + 1;
  payload = {
      "hubId"  : this.remote_id,
      "timeout": 30,
      "hbus"   : {
          "cmd": cmd,
          "id" : this._msgId,
          "params": params
      }
  }

  var that = this;
  that.wsp.onUnpackedMessage.addListener((data) => 
                                      {
                                        that.wsp.close();
                                        that.wsp.removeAllListeners();
                                        that.log("launch for " + params.activityId);
                                      });

  that.wsp.open()
    .then(() => that.wsp.sendPacked(payload))
    .catch((e) => {console.error(e); callback();});

  },
getInformationService: function(homebridgeAccessory) {
  var informationService = new Service.AccessoryInformation();
  informationService
  .setCharacteristic(Characteristic.Name, homebridgeAccessory.name)
  .setCharacteristic(Characteristic.Manufacturer, homebridgeAccessory.manufacturer)
  .setCharacteristic(Characteristic.Model, homebridgeAccessory.model)
  .setCharacteristic(Characteristic.SerialNumber, homebridgeAccessory.serialNumber);
  return informationService;
},

bindCharacteristicEvents: function(characteristic, service, homebridgeAccessory) {

  characteristic
  .on('set', function(value, callback, context) {
    if (context !== 'fromSetValue') {
      params = {
        "async": "false",
        "timestamp": 0,
        "args": {
            "rule": "start"
        },
        "activityId": value?service.controlService.id:"-1"
      };
      cmd = 'harmony.activityengine?runactivity';
      homebridgeAccessory.platform.command(cmd,params,homebridgeAccessory);
    }
    callback();
  }.bind(this) );
  characteristic
  .on('get', function(callback) {

    this.log("get status for " + service.controlService.displayName);

    this._msgId = this._msgId + 1;

    params = {
        "verb"  : "get",
        "format": "json"
    }

    payload = {
        "hubId"  : this.remote_id,
        "timeout": 30,
        "hbus"   : {
            "cmd": 'vnd.logitech.harmony/vnd.logitech.harmony.engine?getCurrentActivity',
            "id" : this._msgId,
            "params": params
        }
    }


    var that = this;
    that.wsp.onUnpackedMessage.addListener((data) => 
                                        {
                                          that.wsp.close();
                                          that.wsp.removeAllListeners();
                                          that.log (data.data.result + "vs" + service.controlService.id);
                                          if (data.data.result == service.controlService.id)
                                          {
                                            callback(undefined, true);
                                          }
                                          else
                                          {
                                            callback(undefined, false);
                                          }         
                                        });

    that.wsp.open()
      .then(() => that.wsp.sendPacked(payload))
      .catch((e) => {console.error(e); callback(undefined, false);});
  
  }.bind(this) );
},


getServices: function(homebridgeAccessory) {
  var services = [];
  var informationService = homebridgeAccessory.platform.getInformationService(homebridgeAccessory);
  services.push(informationService);
  for (var s = 0; s < homebridgeAccessory.services.length; s++) {
    var service = homebridgeAccessory.services[s];
    for (var i=0; i < service.characteristics.length; i++) {
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

