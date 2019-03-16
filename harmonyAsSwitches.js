var Service, Characteristic;
const HarmonyBase = require('./harmonyBase').HarmonyBase;
const HarmonyConst = require('./harmonyConst');
const HarmonyTools = require('./harmonyTools.js');

module.exports = {
  HarmonyPlatformAsSwitches: HarmonyPlatformAsSwitches,
};

function HarmonyPlatformAsSwitches(log, config, api) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;

  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, api, this);

  this.showTurnOffActivity = config['showTurnOffActivity'];
  this.publishActivitiesAsIndividualAccessories = HarmonyTools.checkParemeter(
    config['publishActivitiesAsIndividualAccessories'],
    true
  );

  this._currentActivity = -1;
}

HarmonyPlatformAsSwitches.prototype = {
  onMessage(newActivity) {
    this.refreshCurrentActivity(newActivity);
    this.refreshAccessory();
  },

  addAccessory: function(services, accessoryName) {
    this.log('INFO - Adding Accessory : ' + accessoryName);
    let myHarmonyAccessory = new HarmonyTools.HarmonyAccessory(services);
    var that = this;
    myHarmonyAccessory.getServices = function() {
      return that.getServices(myHarmonyAccessory);
    };
    myHarmonyAccessory.platform = this;
    myHarmonyAccessory.name = accessoryName;
    myHarmonyAccessory.model = this.name;
    myHarmonyAccessory.manufacturer = 'Harmony';
    myHarmonyAccessory.serialNumber = this.hubIP;
    this._foundAccessories.push(myHarmonyAccessory);
  },

  readOptionnalAccessories: function(data) {
    if (
      this.devicesToPublishAsAccessoriesSwitch &&
      this.devicesToPublishAsAccessoriesSwitch.length > 0
    ) {
      this.harmonyBase.getDevicesAccessories(this, data);
    }

    if (
      this.sequencesToPublishAsAccessoriesSwitch &&
      this.sequencesToPublishAsAccessoriesSwitch.length > 0
    ) {
      this.harmonyBase.getSequencesAccessories(this, data);
    }
  },

  showActivity: function(activity) {
    return activity.id != -1 || this.showTurnOffActivity;
  },

  readAccessories: function(data, callback) {
    let activities = data.data.activity;
    let services = [];

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showActivity(activities[i])) {
        let switchName = this.devMode
          ? 'DEV' + activities[i].label
          : activities[i].label;
        let accessoryName = this.name + '-' + activities[i].label;

        this.log('INFO - Discovered Activity : ' + switchName);

        let service = {
          controlService: new Service.Switch(switchName),
          characteristics: [Characteristic.On],
        };

        service.controlService.subtype = switchName;
        service.controlService.id = activities[i].id;
        service.type = HarmonyConst.ACTIVITY_TYPE;
        services.push(service);

        if (this.publishActivitiesAsIndividualAccessories) {
          this.addAccessory(services, accessoryName);
          services = [];
        }
      }
    }

    if (!this.publishActivitiesAsIndividualAccessories) {
      this.addAccessory(services, this.name);
    }

    this.readOptionnalAccessories(data);

    //first refresh

    var that = this;
    setTimeout(function() {
      that.refreshAccessory();
    }, HarmonyConst.DELAY_LAUNCH_REFRESH);

    callback(this._foundAccessories);
  },

  accessories: function(callback) {
    this.harmonyBase.configureAccessories(this, callback);
  },

  refreshCurrentActivity: function(response) {
    this._currentActivity = response;
    this._currentActivityLastUpdate = Date.now();
  },

  checkOn(serviceControl) {
    this.log.debug(
      'checkOn : ' +
        this._currentActivity +
        '/' +
        serviceControl.id +
        '/' +
        (this.showTurnOffActivity == 'inverted') +
        '/' +
        (this.showTurnOffActivity == 'stateless')
    );
    if (serviceControl.id == -1) {
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

    return this._currentActivity == serviceControl.id;
  },

  refreshService: function(service, homebridgeAccessory, callback) {
    var serviceControl = service.controlService;
    var characteristic = serviceControl.getCharacteristic(Characteristic.On);

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this.checkOn(serviceControl);

        this.log.debug(
          'Got status for ' +
            serviceControl.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        homebridgeAccessory.platform.harmonyBase.handleCharacteristicUpdate(
          this,
          characteristic,
          characteristicIsOn,
          callback
        );
      } else {
        this.log.debug('WARNING : no current Activity');
        homebridgeAccessory.platform.harmonyBase.handleCharacteristicUpdate(
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
        this.refreshService(service, myHarmonyAccessory, undefined);
      }
    }
  },

  getServiceControl: function(homebridgeAccessory, idToFind) {
    var serviceControl;
    for (let a = 0; a < homebridgeAccessory.services.length; a++) {
      if (homebridgeAccessory.services[a].controlService.id == idToFind) {
        serviceControl = homebridgeAccessory.services[a].controlService;
        this.log('INFO - ' + serviceControl.displayName + ' activated');
        break;
      }
    }
    return serviceControl;
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
        let otherServiceControl =
          foundHarmonyAccessory.services[s].controlService;

        let characteristic = otherServiceControl.getCharacteristic(
          Characteristic.On
        );

        HarmonyTools.disablePreviousActivity(
          this,
          characteristic,
          otherServiceControl,
          commandToSend,
          characteristic.value
        );
        HarmonyTools.handleOffActivity(
          this,
          characteristic,
          otherServiceControl,
          commandToSend
        );
      }
    }

    this._currentActivity = commandToSend;
  },

  handleActivityInProgress: function(homebridgeAccessory, commandToSend) {
    this._currentSetAttemps = this._currentSetAttemps + 1;
    //get characteristic

    var charactToSet = serviceControl.getCharacteristic(Characteristic.On);
    var serviceControl = this.getServiceControl(
      homebridgeAccessory,
      commandToSend
    );

    //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
    var that = this;
    setTimeout(function() {
      if (that._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE) {
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

  isActivtyToBeSkipped: function(activity) {
    return (
      this.addAllActivitiesToSkipedIfSameStateActivitiesList ||
      (this.skipedIfSameStateActivities &&
        this.skipedIfSameStateActivities.includes(activity))
    );
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

    //Actitiy in skipedIfSameState
    if (this.isActivtyToBeSkipped(service.controlService.subtype)) {
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
      //ELSE, we do the command only if state is different.
      doCommand =
        service.controlService.id == -1
          ? !currentValue && value
          : currentValue !== value;
    } else {
      this.log.debug(
        'INFO : SET on an activty not in skipedIfsameState list ' +
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
  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (service.type !== HarmonyConst.ACTIVITY_TYPE) {
      this.harmonyBase.bindCharacteristicEvents(this, characteristic, service);
    } else {
      characteristic.on(
        'set',
        function(value, callback) {
          homebridgeAccessory.platform.setSwitchOnCharacteristic(
            homebridgeAccessory,
            characteristic,
            service,
            value,
            callback
          );
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
    }
  },

  getServices: function(homebridgeAccessory) {
    return this.harmonyBase.getServices(homebridgeAccessory);
  },
};
