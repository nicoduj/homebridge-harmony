var Service, Characteristic;
const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');

module.exports = {
  HarmonyPlatformAsSwitches: HarmonyPlatformAsSwitches,
};

function HarmonyPlatformAsSwitches(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);

  this.showTurnOffActivity = config['showTurnOffActivity'];
  this.publishActivitiesAsIndividualAccessories =
    config['publishActivitiesAsIndividualAccessories'];

  if (this.publishActivitiesAsIndividualAccessories == undefined)
    this.publishActivitiesAsIndividualAccessories = true;
}

HarmonyPlatformAsSwitches.prototype = {
  onMessage(newActivity) {
    this.refreshCurrentActivity(newActivity);
    this.refreshAccessory();
  },

  readAccessories: function(data, callback) {
    var that = this;
    let activities = data.data.activity;

    let services = [];

    for (let i = 0, len = activities.length; i < len; i++) {
      if (activities[i].id != -1 || that.showTurnOffActivity) {
        let switchName = activities[i].label;
        let accessoryName = that.name + '-' + activities[i].label;

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

        if (that.publishActivitiesAsIndividualAccessories) {
          that.log('Adding Accessory : ' + accessoryName);
          let myHarmonyAccessory = new HarmonyAccessory(services);
          myHarmonyAccessory.getServices = function() {
            return that.getServices(myHarmonyAccessory);
          };
          myHarmonyAccessory.platform = that;
          myHarmonyAccessory.name = accessoryName;
          myHarmonyAccessory.model = that.name;
          myHarmonyAccessory.manufacturer = 'Harmony';
          myHarmonyAccessory.serialNumber = that.hubIP;
          that._foundAccessories.push(myHarmonyAccessory);
          services = [];
        }
      }
    }

    if (!that.publishActivitiesAsIndividualAccessories) {
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

  refreshCurrentActivity: function(response) {
    this._currentActivity = response;
    this._currentActivityLastUpdate = Date.now();
  },

  refreshService: function(service, homebridgeAccessory, callback) {
    var serviceControl = service.controlService;
    var characteristic = serviceControl.getCharacteristic(Characteristic.On);

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this._currentActivity == serviceControl.id;

        this.log.debug(
          'Got status for ' +
            serviceControl.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        homebridgeAccessory.platform.harmonyBase.updateCharacteristic(
          characteristic,
          characteristicIsOn,
          callback
        );
      } else {
        this.log.debug('WARNING : no current Activity');
        homebridgeAccessory.platform.harmonyBase.updateCharacteristic(
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

  activityCommand: function(homebridgeAccessory, commandToSend) {
    this.harmonyBase.harmony
      .startActivity(commandToSend)
      .then(data => {
        this.log.debug(
          'INFO - activityCommand : Returned from hub ' + JSON.stringify(data)
        );

        var serviceControl;

        for (let a = 0; a < homebridgeAccessory.services.length; a++) {
          if (
            homebridgeAccessory.services[a].controlService.id == commandToSend
          ) {
            serviceControl = homebridgeAccessory.services[a].controlService;
            this.log(serviceControl.displayName + ' activated');
            break;
          }
        }

        if (
          data &&
          data.code &&
          data.code == 200 &&
          data.msg &&
          data.msg == 'OK'
        ) {
          this._currentSetAttemps = 0;

          for (let a = 0; a < this._foundAccessories.length; a++) {
            let foundHarmonyAccessory = this._foundAccessories[a];
            for (let s = 0; s < foundHarmonyAccessory.services.length; s++) {
              let otherServiceControl =
                foundHarmonyAccessory.services[s].controlService;

              let characteristic = otherServiceControl.getCharacteristic(
                Characteristic.On
              );

              //we disable previous activities that were on
              if (
                otherServiceControl.id != -1 &&
                otherServiceControl.id != commandToSend &&
                characteristic.value
              ) {
                this.log.debug(
                  'Switching off ' + otherServiceControl.displayName
                );
                characteristic.updateValue(false);
              }

              //we turn off Off Activity if another activity was launched
              if (otherServiceControl.id == -1 && commandToSend != -1) {
                this.log.debug(
                  'New activity on , turning off off Activity ' +
                    otherServiceControl.displayName
                );
                characteristic.updateValue(false);
              }

              //we turn on Off Activity if we turned off an activity (or turn on the general switch)
              if (otherServiceControl.id == -1 && commandToSend == -1) {
                this.log.debug(
                  'Turning on off Activity ' + otherServiceControl.displayName
                );
                characteristic.updateValue(true);
              }
            }
          }

          this._currentActivity = commandToSend;
        } else if (data && (data.code == 202 || data.code == 100)) {
          this._currentSetAttemps = this._currentSetAttemps + 1;
          //get characteristic
          this.log.debug(
            'WARNING - activityCommand : could not SET status : ' +
              JSON.stringify(data)
          );

          var charactToSet = serviceControl.getCharacteristic(
            Characteristic.On
          );

          //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
          var that = this;
          setTimeout(function() {
            if (
              that._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE
            ) {
              that.log.debug(
                'INFO - activityCommand : RETRY to send command ' +
                  serviceControl.displayName
              );
              that.activityCommand(homebridgeAccessory, commandToSend);
            } else {
              that.log(
                'ERROR - activityCommand : could not SET status, no more RETRY : ' +
                  serviceControl.displayName
              );
              charactToSet.updateValue(false);
            }
          }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
        } else {
          this.log('ERROR - activityCommand : could not SET status, no data');
        }
      })
      .catch(e => {
        this.log('ERROR - activityCommand : ' + e);
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
          this.activityCommand(homebridgeAccessory, commandToSend);
          callback();
        } else {
          callback();
          setTimeout(function() {
            characteristic.updateValue(currentValue);
          }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
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

  getServices: function(homebridgeAccessory) {
    return this.harmonyBase.getServices(homebridgeAccessory);
  },
};

function HarmonyAccessory(services) {
  this.services = services;
}
