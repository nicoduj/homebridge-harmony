var Service, Characteristic, Accessory, UUIDGen;
const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');
const HarmonyTools = require('./harmonyTools.js');

module.exports = {
  HarmonyPlatformAsSwitches: HarmonyPlatformAsSwitches,
};

function HarmonyPlatformAsSwitches(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  Accessory = api.platformAccessory;
  UUIDGen = api.hap.uuid;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);

  this.showTurnOffActivity = config['showTurnOffActivity'];
  this.publishActivitiesAsIndividualAccessories = HarmonyTools.checkParemeter(
    config['publishActivitiesAsIndividualAccessories'],
    true
  );

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

HarmonyPlatformAsSwitches.prototype = {
  onMessage(newActivity) {
    this.refreshCurrentActivity(newActivity);
    this.refreshAccessory();
  },

  showActivity: function(activity) {
    return activity.id != -1 || this.showTurnOffActivity;
  },

  readAccessories: function(data) {
    let activities = data.data.activity;

    let accessoriesToAdd = [];
    var myHarmonyAccessory;

    if (!this.publishActivitiesAsIndividualAccessories) {
      myHarmonyAccessory = this.harmonyBase.checkAccessory(this, this.name);
      if (!myHarmonyAccessory) {
        myHarmonyAccessory = this.harmonyBase.createAccessory(this, this.name);
        accessoriesToAdd.push(myHarmonyAccessory);
      }
    }

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showActivity(activities[i])) {
        let switchName = this.devMode
          ? 'DEV' + activities[i].label
          : activities[i].label;

        let accessoryName = this.name + '-' + activities[i].label;

        if (this.publishActivitiesAsIndividualAccessories) {
          myHarmonyAccessory = this.harmonyBase.checkAccessory(
            this,
            accessoryName
          );
          if (!myHarmonyAccessory) {
            myHarmonyAccessory = this.harmonyBase.createAccessory(
              this,
              accessoryName
            );
            accessoriesToAdd.push(myHarmonyAccessory);
          }
        }

        this.log('INFO - Discovered Activity : ' + switchName);

        let subType = switchName;
        let service = myHarmonyAccessory.getServiceByUUIDAndSubType(
          subType,
          subType
        );

        if (!service) {
          this.log('INFO - Creating Switch Service');
          service = new Service.Switch(switchName);
          service.subtype = subType;
          myHarmonyAccessory.addService(service);
        }
        service.activityId = activities[i].id;
        service.type = HarmonyConst.ACTIVITY_TYPE;

        this.bindCharacteristicEventsForSwitch(myHarmonyAccessory, service);
      }
    }

    this.harmonyBase.getDevicesAccessories(this, data);
    this.harmonyBase.getSequencesAccessories(this, data);

    //creating accessories
    this.harmonyBase.addAccesories(this, accessoriesToAdd);

    //first refresh
    var that = this;
    setTimeout(function() {
      that.refreshAccessory();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);
  },

  loadAccessories: function() {
    this.harmonyBase.configureAccessories(this);
  },

  //Cache call method
  configureAccessory: function(accessory) {
    this.log(accessory.displayName, 'Configure Accessory');
    this._foundAccessories.push(accessory);
  },

  refreshCurrentActivity: function(response) {
    this._currentActivity = response;
    this._currentActivityLastUpdate = Date.now();
  },

  checkOn(service) {
    this.log.debug(
      'checkOn : ' +
        this._currentActivity +
        '/' +
        service.activityId +
        '/' +
        (this.showTurnOffActivity == 'inverted') +
        '/' +
        (this.showTurnOffActivity == 'stateless')
    );
    if (service.activityId == -1) {
      if (
        this._currentActivity == -1 &&
        (this.showTurnOffActivity == 'inverted' ||
          this.showTurnOffActivity == 'stateless')
      ) {
        return false;
      }
      if (
        this._currentActivity != -1 &&
        this.showTurnOffActivity == 'inverted'
      ) {
        return true;
      }
    }

    return this._currentActivity == service.activityId;
  },

  refreshService: function(service, callback) {
    var characteristic = service.getCharacteristic(Characteristic.On);

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this.checkOn(service);

        this.log.debug(
          'Got status for ' +
            service.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        this.harmonyBase.handleCharacteristicUpdate(
          this,
          characteristic,
          characteristicIsOn,
          callback
        );
      } else {
        this.log.debug('WARNING : no current Activity');
        this.harmonyBase.handleCharacteristicUpdate(
          this,
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
        this.refreshService(service, undefined);
      }
    }
  },

  isActivityOk: function(data) {
    return (
      data && data.code && data.code == 200 && data.msg && data.msg == 'OK'
    );
  },

  isActivityInProgress: function(data) {
    return data && (data.code == 202 || data.code == 100);
  },

  handleActivityOk: function(commandToSend) {
    this._currentSetAttemps = 0;

    for (let a = 0; a < this._foundAccessories.length; a++) {
      let foundHarmonyAccessory = this._foundAccessories[a];
      for (let s = 0; s < foundHarmonyAccessory.services.length; s++) {
        let otherService = foundHarmonyAccessory.services[s];

        let characteristic = otherService.getCharacteristic(Characteristic.On);

        HarmonyTools.disablePreviousActivity(
          this,
          characteristic,
          otherService,
          commandToSend,
          characteristic.value
        );
        HarmonyTools.handleOffActivity(
          this,
          characteristic,
          otherService,
          commandToSend
        );
      }
    }

    this._currentActivity = commandToSend;
  },

  getService: function(homebridgeAccessory, idToFind) {
    var service;
    for (let a = 0; a < homebridgeAccessory.services.length; a++) {
      if (homebridgeAccessory.services[a].ActivityId == idToFind) {
        service = homebridgeAccessory.services[a];
        this.log('INFO - ' + service.displayName + ' activated');
        break;
      }
    }
    return service;
  },

  handleActivityInProgress: function(homebridgeAccessory, commandToSend) {
    this._currentSetAttemps = this._currentSetAttemps + 1;

    //get characteristic
    var service = this.getService(homebridgeAccessory, commandToSend);
    var charactToSet = service.getCharacteristic(Characteristic.On);

    //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
    var that = this;
    setTimeout(function() {
      if (that._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE) {
        that.log.debug(
          'INFO - activityCommand : RETRY to send command ' +
            service.displayName
        );
        that.activityCommand(homebridgeAccessory, commandToSend);
      } else {
        that.log(
          'ERROR - activityCommand : could not SET status, no more RETRY : ' +
            service.displayName
        );
        charactToSet.updateValue(false);
      }
    }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
  },

  activityCommand: function(homebridgeAccessory, commandToSend) {
    this.harmonyBase.harmony
      .startActivity(commandToSend)
      .then(data => {
        this.log.debug(
          'INFO - activityCommand : Returned from hub ' + JSON.stringify(data)
        );

        if (this.isActivityOk(data)) {
          this.handleActivityOk(commandToSend);
        } else if (this.isActivityInProgress(data)) {
          this.log.debug(
            'WARNING - activityCommand : could not SET status : ' +
              JSON.stringify(data)
          );
          this.handleActivityInProgress(homebridgeAccessory, commandToSend);
        } else {
          this.log('ERROR - activityCommand : could not SET status, no data');
        }
      })
      .catch(e => {
        this.log('ERROR - activityCommand : ' + e);
      });
  },

  setSwitchOnCharacteristic: function(
    homebridgeAccessory,
    characteristic,
    service,
    value,
    callback
  ) {
    let doCommand = true;
    let commandToSend = value ? service.controlService.id : '-1';
    let currentValue = characteristic.value;

    //Actitiy in skippedIfSameState
    if (
      HarmonyTools.isActivtyToBeSkipped(this, service.controlService.subtype)
    ) {
      this.log.debug(
        'INFO : SET on an activty in skippedIfsameState list ' +
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
      //ELSE, we do the command only if state is different.
      doCommand =
        service.controlService.id == -1
          ? !currentValue && value
          : currentValue !== value;
    } else {
      this.log.debug(
        'INFO : SET on an activty not in pIfsameState list ' +
          service.controlService.subtype
      );
    }

    if (doCommand) {
      this.log.debug(
        'INFO : Activty ' +
          service.controlService.subtype +
          ' will be sent command ' +
          commandToSend
      );
      this.activityCommand(homebridgeAccessory, commandToSend);
      callback();
    } else {
      this.log.debug(
        'INFO : Activty ' +
          service.controlService.subtype +
          ' will not be sent any command '
      );
      callback();
      setTimeout(function() {
        characteristic.updateValue(currentValue);
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  bindCharacteristicEventsForSwitch: function(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'set',
        function(value, callback) {
          this.setSwitchOnCharacteristic(
            homebridgeAccessory,
            service.getCharacteristic(Characteristic.On),
            service,
            value,
            callback
          );
        }.bind(this)
      )
      .on(
        'get',
        function(callback) {
          this.refreshService(service, callback);
        }.bind(this)
      );
  },
};
