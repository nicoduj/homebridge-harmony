var Service, Characteristic, Accessory, AccessoryType, AccessControlManagement, AccessControlEvent;

import fs from 'fs';
import path from 'path';
import {HarmonyBase} from './harmonyBase.js';
import HarmonyConst from './harmonyConst.js';
import HarmonyTools from './harmonyTools.js';
import HarmonyAsTVKeysTools from './harmonyAsTVKeysTools.js';
import {HarmonyRelativeVolume} from './harmonyRelativeVolume.js';

function HarmonySubPlatform(log, config, api, mainPlatform) {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  Accessory = api.hap.Accessory;
  AccessoryType = api.hap.Categories;
  AccessControlManagement = api.hap.AccessControlManagement;
  AccessControlEvent = api.hap.AccessControlEvent;

  this.api = api;
  this.mainPlatform = mainPlatform;
  this.harmonyBase = new HarmonyBase(api);
  this.harmonyBase.configCommonProperties(log, config, this);

  this.TVAccessory = HarmonyTools.checkParameter(config['TVAccessory'], true);
  this.receiverIcon = HarmonyTools.checkParameter(config['ReceiverIcon'], false);

  this.sortInput = HarmonyTools.checkParameter(config['sortInput'], 0);

  this.publishGeneralMuteSwitch = HarmonyTools.checkParameter(
    config['publishGeneralMuteSwitch'],
    false
  );

  this.publishGeneralVolumeSlider = HarmonyTools.checkParameter(
    config['publishGeneralVolumeSlider'],
    false
  );

  this.publishGeneralVolumeSwitches = HarmonyTools.checkParameter(
    config['publishGeneralVolumeSwitches'],
    false
  );

  this.linkVolumeControlToTV = HarmonyTools.checkParameter(config['linkVolumeControlToTV'], false);

  this.numberOfCommandsSentForVolumeControl = HarmonyTools.checkParameter(
    config['numberOfCommandsSentForVolumeControl'],
    1
  );

  this.relativeVolumeControl = config['relativeVolumeControl'] === true;
  if (this.relativeVolumeControl) this.volumeControl = new HarmonyRelativeVolume(this);

  if (this.TVAccessory) {
    this.mainActivity = config['mainActivity'];
    this.playPauseBehavior = HarmonyTools.checkParameter(config['playPauseBehavior'], false);

    this.activitiesToPublishAsInputForTVMode = config['activitiesToPublishAsInputForTVMode'];

    this.remoteOverrideCommandsList = config['remoteOverrideCommandsList'];

    this.configureAccesscontrol = HarmonyTools.checkParameter(
      config['configureAccesscontrol'],
      false
    );

    if (Array.isArray(this.remoteOverrideCommandsList)) {
      this.log.debug('(' + this.name + ')' + 'INFO - remoteOverrideCommandsList is in new format');
      const NewRemoteOverrideCommandsList = Object.create(null);
      this.remoteOverrideCommandsList.forEach((x) => {
        if (!x || !HarmonyTools.isSafeObjectKey(x.ActivityName) || !Array.isArray(x.CommandsList)) {
          return;
        }

        var commands = Object.create(null);
        x.CommandsList.forEach((y) => {
          if (y && HarmonyTools.isSafeObjectKey(y.CommandName)) {
            commands[y.CommandName] = y.NewCommand;
          }
        });
        NewRemoteOverrideCommandsList[x.ActivityName] = commands;
      });
      this.remoteOverrideCommandsList = NewRemoteOverrideCommandsList;
    }

    this.log.debug(
      '(' +
        this.name +
        ')' +
        'INFO - remoteOverrideCommandsList is : ' +
        JSON.stringify(this.remoteOverrideCommandsList)
    );

    if (
      !this.addAllActivitiesToSkippedIfSameStateActivitiesList &&
      !this.skippedIfSameStateActivities
    ) {
      this.skippedIfSameStateActivities = ['PowerOff'];
    }

    this.log.debug(
      '(' +
        this.name +
        ')' +
        '(' +
        this.name +
        ')' +
        'INFO - playPause option set to ' +
        this.playPauseBehavior
    );
    this.playStatus = {};
    this.volumesLevel = {};

    this.prefsDir = api.user.storagePath();
    // check if prefs directory ends with a /, if not then add it
    if (this.prefsDir.endsWith('/') === false) {
      this.prefsDir = this.prefsDir + '/';
    }

    const prefsName = HarmonyTools.safeFileNameSegment(this.name);
    const prefsHub = HarmonyTools.safeFileNameSegment(
      HarmonyTools.isNil(this.hubIP) ? this.name : this.hubIP.split('.').join('')
    );

    this.savedNamesFile = path.join(
      this.prefsDir,
      'harmonyPluginNames_' + prefsName + '_' + prefsHub
    );
    this.savedVisibilityFile = path.join(
      this.prefsDir,
      'harmonyPluginVisibility_' + prefsName + '_' + prefsHub
    );

    this.savedNames = Object.create(null);
    try {
      this.savedNames = HarmonyTools.parseJsonObject(
        fs.readFileSync(this.savedNamesFile, 'utf8'),
        Object.create(null)
      );
    } catch (err) {
      this.log.debug('(' + this.name + ')' + 'INFO - input names file does not exist');
    }

    this.savedVisibility = Object.create(null);
    try {
      this.savedVisibility = HarmonyTools.parseJsonObject(
        fs.readFileSync(this.savedVisibilityFile, 'utf8'),
        Object.create(null)
      );
    } catch (err) {
      this.log.debug('(' + this.name + ')' + 'INFO - input visibility file does not exist');
    }
  }

  this.isPlatformWithSwitch = HarmonyTools.isPlatformWithSwitch(config);

  if (this.isPlatformWithSwitch) {
    this.showTurnOffActivity = HarmonyTools.checkTurnOffActivityOption(
      config['showTurnOffActivity']
    );

    this.publishSwitchActivitiesAsIndividualAccessories = HarmonyTools.checkParameter(
      config['publishSwitchActivitiesAsIndividualAccessories'],
      true
    );

    this.activitiesToPublishAsAccessoriesSwitch = config['activitiesToPublishAsAccessoriesSwitch'];

    this.switchAccessories = config['switchAccessories'];
    if (!this.switchAccessories && !this.activitiesToPublishAsAccessoriesSwitch) {
      this.activitiesToPublishAsAccessoriesSwitch = [];
    }
  }

  this._confirmedAccessories = [];
  this._confirmedServices = [];
}

HarmonySubPlatform.prototype = {
  //MAIN METHODS

  onMessage(newActivity) {
    this.refreshCurrentActivityOnSubPlatform(newActivity);
  },

  readAccessories: function (data, homedata) {
    let accessoriesToAdd = [];
    if (this.TVAccessory)
      accessoriesToAdd.push.apply(accessoriesToAdd, this.readTVAccessories(data));

    if (this.isPlatformWithSwitch)
      accessoriesToAdd.push.apply(accessoriesToAdd, this.readSwitchAccessories(data));

    this.harmonyBase.setupFoundAccessories(this, accessoriesToAdd, data, homedata);
  },

  readSwitchAccessories: function (data) {
    var activities = data.data.activity;

    var accessoriesToAdd = [];
    var myHarmonyAccessory;

    if (!this.publishSwitchActivitiesAsIndividualAccessories) {
      var name = 'Switch';
      myHarmonyAccessory = this.harmonyBase.checkAccessory(this, name);
      if (!myHarmonyAccessory) {
        myHarmonyAccessory = this.harmonyBase.createAccessory(this, name);
        accessoriesToAdd.push(myHarmonyAccessory);
      }
      myHarmonyAccessory.category = AccessoryType.SWITCH;
      this._confirmedAccessories.push(myHarmonyAccessory);
    }

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showActivity(activities[i])) {
        var switchName = activities[i].label;

        if (this.publishSwitchActivitiesAsIndividualAccessories) {
          //Handle special case
          if (switchName === 'TV') switchName = 'TV-Switch';

          myHarmonyAccessory = this.harmonyBase.checkAccessory(this, switchName);
          if (!myHarmonyAccessory) {
            myHarmonyAccessory = this.harmonyBase.createAccessory(this, switchName);
            accessoriesToAdd.push(myHarmonyAccessory);
          }
          myHarmonyAccessory.category = AccessoryType.SWITCH;
          this._confirmedAccessories.push(myHarmonyAccessory);
        }

        this.log('(' + this.name + ')' + 'INFO - Discovered Activity : ' + switchName);
        var subType = switchName;
        var service = this.harmonyBase.getSwitchService(
          this,
          myHarmonyAccessory,
          switchName,
          subType
        );

        service.activityName = activities[i].label;
        service.activityId = activities[i].id;
        service.type = HarmonyConst.ACTIVITY_TYPE;
        this._confirmedServices.push(service);

        this.bindCharacteristicEventsForSwitch(myHarmonyAccessory, service);
      }
    }

    return accessoriesToAdd;
  },

  readTVAccessories: function (data) {
    var activities = data.data.activity;
    var accessoriesToAdd = [];
    var name = 'TV';

    var myHarmonyAccessory = this.harmonyBase.checkAccessory(this, name);

    if (!myHarmonyAccessory) {
      myHarmonyAccessory = this.harmonyBase.createAccessory(this, name);
      accessoriesToAdd.push(myHarmonyAccessory);
    }

    myHarmonyAccessory.category = AccessoryType.TELEVISION;
    if (this.receiverIcon) myHarmonyAccessory.category = AccessoryType.AUDIO_RECEIVER;

    this._confirmedAccessories.push(myHarmonyAccessory);

    this.log('(' + this.name + ')' + 'INFO - configuring Main TV Service');
    this.configureMainService(myHarmonyAccessory);

    var mainActivityConfigured = false;
    var defaultActivity = undefined;

    //Pre-sort so the input sorces are set alphabetically or by activityOrder
    // "sort input list in TV accessory : 0-default,1:Alpha,2:activityOrder property of hub, 3:activitiesToPublishAsInputForTVMode order (defaults to 0).",
    this.log.debug('(' + this.name + ')' + 'INFO - accessories : Sort Order : ' + this.sortInput);

    if (this.sortInput == 1) activities.sort((a, b) => a.label.localeCompare(b.label));
    else if (this.sortInput == 2) activities.sort((a, b) => a.activityOrder - b.activityOrder);
    else if (this.sortInput > 2 && this.activitiesToPublishAsInputForTVMode) {
      var refArray = this.activitiesToPublishAsInputForTVMode;
      activities.sort(function (a, b) {
        return refArray.indexOf(a.label) - refArray.indexOf(b.label);
      });
    }

    for (let i = 0, len = activities.length; i < len; i++) {
      if (this.showInput(activities[i])) {
        var inputName = activities[i].label;
        var inputId = activities[i].id;

        this.log.debug(
          '(' + this.name + ')' + 'INFO - readTVAccessories : activity to configure : ' + inputName
        );

        if (this.mainActivity == inputName) {
          this.configureMainActivity(myHarmonyAccessory, activities[i]);
          mainActivityConfigured = true;
        } else if (HarmonyTools.isNil(defaultActivity)) {
          defaultActivity = activities[i];
        }

        var inputSourceService = this.configureInputSourceService(
          myHarmonyAccessory,
          inputName,
          inputId,
          activities[i],
          this.inputServices.length + 1
        );

        this.mainService.addLinkedService(inputSourceService);
        this.inputServices.push(inputSourceService);
      }
    }

    if (!mainActivityConfigured) {
      this.log(
        '(' +
          this.name +
          ')' +
          'WARNING - No main Activity that match config file found, default to first one'
      );
      if (HarmonyTools.isNil(defaultActivity))
        this.log(
          '(' + this.name + ')' + 'ERROR - No  Activity at all was found for this TV accessory'
        );
      else this.configureMainActivity(myHarmonyAccessory, defaultActivity);
    }

    //AccessControl
    if (this.configureAccesscontrol) this.configureAccessControlService(myHarmonyAccessory);

    this.bindCharacteristicEventsForInputs(myHarmonyAccessory);

    this.TVFoundAccessory = myHarmonyAccessory;

    return accessoriesToAdd;
  },

  //TV METHODS

  configureAccessControlService: function (myHarmonyAccessory) {
    ////

    try {
      //acces control
      this.log('(' + this.name + ')' + 'INFO - configuring Access Control Service');
      let subType = this.name + ' AccessControlService';
      this.accessControlService = myHarmonyAccessory.getServiceById(this.name, subType);
      var accessControl;

      if (!this.accessControlService) {
        accessControl = new AccessControlManagement(true);
        this.accessControlService = accessControl.getService();
        this.accessControlService.subtype = subType;
        this.accessControlService.displayName = this.name;
        myHarmonyAccessory.addService(this.accessControlService);
      } else {
        accessControl = new AccessControlManagement(true, this.accessControlService);
      }

      this._confirmedServices.push(this.accessControlService);

      accessControl.on(AccessControlEvent.ACCESS_LEVEL_UPDATED, (level) => {
        this.log(
          '(' +
            this.name +
            ')' +
            'INFO - New access control level of ' +
            level +
            '/' +
            myHarmonyAccessory.displayName
        );
      });
      accessControl.on(
        AccessControlEvent.PASSWORD_SETTING_UPDATED,
        (_password, passwordRequired) => {
          if (passwordRequired) {
            this.log(
              '(' +
                this.name +
                ')' +
                'INFO - New access control - Password required' +
                '/' +
                myHarmonyAccessory.displayName
            );
          } else {
            this.log(
              '(' +
                this.name +
                ')' +
                'INFO - access control - No password set! ' +
                '/' +
                myHarmonyAccessory.displayName
            );
          }
        }
      );
    } catch {
      this.log(
        '(' +
          this.name +
          ')' +
          'ERROR - error adding control service, you should try to restart (possible cache problem because of previous bug) or you are not on correct homebridge version' +
          '/' +
          myHarmonyAccessory.displayName
      );
    }
  },

  configureMainService: function (accessory) {
    var subType = 'tvService' + this.name + ' TV';
    this.mainService = accessory.getServiceById(this.name, subType);

    if (!this.mainService) {
      this.log('(' + this.name + ')' + 'INFO - Creating TV Service');
      this.mainService = new Service.Television(this.name, subType);
      this.mainService.name = HarmonyTools.isNil(subType) ? this.name : subType;
      accessory.addService(this.mainService);
    }

    var mainServiceName;

    if (this.savedNames && this.savedNames[0]) {
      mainServiceName = this.savedNames[0];
    } else {
      mainServiceName = this.name;
    }

    this.mainService
      .setCharacteristic(Characteristic.ConfiguredName, mainServiceName)
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      )
      .setCharacteristic(Characteristic.Active, false);

    this._confirmedServices.push(this.mainService);

    this.bindCharacteristicEventsForTV(accessory);

    this.inputServices = [];
    this.log.debug(
      '(' + this.name + ')' + 'INFO - accessories : main activity name : ' + this.mainActivity
    );
  },

  configureMainActivity: function (accessory, activity) {
    var inputName = activity.label;

    this.log('(' + this.name + ')' + 'INFO - Configuring Main Activity ' + inputName);

    this.mainActivityId = activity.id;
    this.mainService.activityName = inputName;
    this.mainService.activityId = activity.id;

    var subType = 'TVSpeaker' + this.name + ' Volume';
    this.tvSpeakerService = accessory.getServiceById(this.name, subType);

    if (!this.tvSpeakerService) {
      this.log('(' + this.name + ')' + 'INFO - Creating TV Speaker Service');
      this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, subType);
      this.tvSpeakerService.name = HarmonyTools.isNil(subType) ? this.name : subType;
      accessory.addService(this.tvSpeakerService);
    }

    this.tvSpeakerService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(
        Characteristic.VolumeControlType,
        this.relativeVolumeControl
          ? Characteristic.VolumeControlType.RELATIVE
          : Characteristic.VolumeControlType.ABSOLUTE
      );

    this._confirmedServices.push(this.tvSpeakerService);
    this.bindCharacteristicEventsForSpeaker(this.tvSpeakerService);

    this.mainService.addLinkedService(this.tvSpeakerService);
  },

  configureInputSourceService: function (accessory, inputName, inputId, activity, order) {
    var subType = 'Input ' + inputName + ' Activity';
    var inputSourceService = accessory.getServiceById(this.name, subType);

    if (!inputSourceService) {
      this.log(
        '(' +
          this.name +
          ')' +
          'INFO - Creating Input Service - ' +
          inputName +
          ' in position ' +
          order
      );
      inputSourceService = new Service.InputSource(this.name, subType);

      inputSourceService.name = HarmonyTools.isNil(subType) ? inputName : subType;
      accessory.addService(inputSourceService);
    }

    inputSourceService.activityName = inputName;
    inputSourceService.activityId = inputId;

    var controlGroup = activity.controlGroup;

    HarmonyAsTVKeysTools.mapKeys(this, controlGroup, inputName, inputSourceService);
    var inputServiceName;

    if (this.savedNames && this.savedNames[inputId]) {
      this.log(
        '(' + this.name + ')' + 'INFO - Input Service name saved - ' + this.savedNames[inputId]
      );
      inputServiceName = this.savedNames[inputId];
    } else {
      this.log('(' + this.name + ')' + 'INFO - Input Service name - ' + inputName);
      inputServiceName = inputName;
    }

    inputSourceService
      .setCharacteristic(Characteristic.Identifier, order)
      .setCharacteristic(Characteristic.Name, inputName)
      .setCharacteristic(Characteristic.ConfiguredName, inputServiceName)
      .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED);

    this._confirmedServices.push(inputSourceService);
    return inputSourceService;
  },

  showInput: function (activity) {
    if (
      activity.id != -1 &&
      this.activitiesToPublishAsInputForTVMode &&
      !this.activitiesToPublishAsInputForTVMode.includes(activity.label)
    )
      return false;
    else return activity.id != -1;
  },

  ///REFRESHING TOOLS

  handleRefreshOfCharacteristic() {
    this.updateCurrentInputService();

    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.getCharacteristic(Characteristic.Active),
      HarmonyTools.isNotNil(this._currentInputService)
    );

    this.harmonyBase.handleCharacteristicUpdate(
      this,
      this.mainService.getCharacteristic(Characteristic.ActiveIdentifier),
      HarmonyTools.transformActivityIdToActiveIdentifier(
        this._currentInputService,
        this.inputServices
      )
    );
  },

  localRefresh: function () {
    //TV
    if (this.TVAccessory) this.handleRefreshOfCharacteristic();

    if (this.relativeVolumeControl) {
      for (const service of this._confirmedServices) {
        if (service.type === HarmonyConst.GENERALVOLUME_TYPE) {
          this.volumeControl.refreshSlider(service);
        }
      }
    }

    //SWITCH ACTIVITIEs
    if (this.isPlatformWithSwitch) {
      for (let a = 0; a < this._foundAccessories.length; a++) {
        let myHarmonyAccessory = this._foundAccessories[a];
        for (let s = 0; s < myHarmonyAccessory.services.length; s++) {
          let service = myHarmonyAccessory.services[s];
          if (
            service.type == HarmonyConst.ACTIVITY_TYPE ||
            service.type == HarmonyConst.GENERALVOLUME_TYPE ||
            service.type == HarmonyConst.GENERALVOLUMEUP_TYPE ||
            service.type == HarmonyConst.GENERALVOLUMEDOWN_TYPE
          )
            this.refreshService(service, false);
        }
      }
    }
  },

  refreshPlatform: function () {
    this.harmonyBase.refreshCurrentActivity(this, () => {
      this.harmonyBase.refreshHomeAccessory(this);
    });
  },

  updateCurrentInputService: function () {
    if (this._currentActivity > 0) {
      let inputFound = false;
      for (let i = 0, len = this.inputServices.length; i < len; i++) {
        if (this.inputServices[i].activityId == this._currentActivity) {
          this._currentInputService = this.inputServices[i];
          inputFound = true;
          break;
        }
      }
      if (!inputFound) {
        this._currentInputService = undefined;
      }
    } else {
      this._currentInputService = undefined;
    }

    this.keysMap = HarmonyAsTVKeysTools.mapKeysForActivity(this);
  },

  refreshCurrentActivityOnSubPlatform: function (response) {
    this._currentActivityLastUpdate = Date.now();

    if (HarmonyTools.isNil(response)) return;
    if (this.relativeVolumeControl && this._currentActivity !== response)
      this.volumeControl.cancel();
    this._currentActivity = response;

    this.localRefresh();
  },

  refreshService: function (service, callback) {
    var characteristic = service.getCharacteristic(Characteristic.On);

    //return immediately
    if (callback) {
      callback(undefined, service.getCharacteristic(Characteristic.On).value);
    }

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        let characteristicIsOn = this.checkOn(service);

        this.log.debug(
          '(' +
            this.name +
            ')' +
            'Got status for ' +
            service.displayName +
            ' - was ' +
            characteristic.value +
            ' set to ' +
            characteristicIsOn
        );
        this.harmonyBase.handleCharacteristicUpdate(this, characteristic, characteristicIsOn);
      } else {
        this.log.debug('(' + this.name + ')' + 'WARNING : no current Activity');
        this.harmonyBase.handleCharacteristicUpdate(this, characteristic, characteristic.value);
      }
    });
  },

  ///COMANDS
  sendInputCommand: function (homebridgeAccessory, value, deadline = Infinity) {
    let doCommand = true;
    let commandToSend = value;

    let inputName = commandToSend == -1 ? 'PowerOff' : '';

    for (let i = 0, len = this.inputServices.length; i < len; i++) {
      if (this.inputServices[i].activityId == commandToSend) {
        inputName = this.inputServices[i].activityName;
        break;
      }
    }

    if (HarmonyTools.isActivtyToBeSkipped(this, inputName)) {
      //GLOBAL OFF SWITCH : do command only if we are not off
      if (commandToSend == -1) {
        doCommand = this._currentActivity > 0;
      }
      //ELSE, we do the command only if state is different.
      else {
        doCommand = this._currentActivity !== value;
      }
    }

    if (doCommand) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO - sendInputCommand : Activty ' +
          inputName +
          ' will be activated '
      );
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO - sendInputCommand : Activty ' +
          inputName +
          ' will not be activated '
      );
    }

    if (doCommand) {
      this.activityRequestVersion = (this.activityRequestVersion || 0) + 1;
      this.inputCommand = this.activityCommand(
        homebridgeAccessory,
        commandToSend,
        deadline,
        this.activityRequestVersion
      );
      return this.inputCommand;
    } else {
      setTimeout(() => {
        this.refreshPlatform();
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  sendMappedCommand(command, deadline) {
    if (Array.isArray(command) && command.length) {
      return HarmonyTools.processCommands(this.harmonyBase, this, command, deadline);
    }
    if (typeof command === 'string' && command && command !== 'undefined') {
      return this.harmonyBase.sendCommand(this, command, deadline);
    }
    throw new this.api.hap.HapStatusError(-70412);
  },

  handlePlayPause: async function (deadline) {
    if (!this._currentInputService) throw new this.api.hap.HapStatusError(-70412);
    const activity = this._currentActivity;
    const play =
      !this.playPauseBehavior ||
      HarmonyTools.isNil(this._currentInputService.PauseCommand) ||
      HarmonyTools.isNil(this.playStatus[activity]) ||
      this.playStatus[activity] === 'PAUSED';
    const command = play
      ? this.keysMap[Characteristic.RemoteKey.PLAY_PAUSE]
      : HarmonyAsTVKeysTools.getOverrideCommand(this, 'PAUSE') ||
        this._currentInputService.PauseCommand;
    await this.sendMappedCommand(command, deadline);
    if (this._currentActivity === activity) this.playStatus[activity] = play ? '' : 'PAUSED';
  },

  writeTVCommand(callback, action) {
    const deadline = Date.now() + 6000;
    HarmonyTools.withDeadline(() => action(deadline), deadline).then(
      () => callback(null),
      (error) => {
        this.log('(' + this.name + ') ERROR - TV command: ' + error.message);
        callback(
          error instanceof this.api.hap.HapStatusError
            ? error
            : new this.api.hap.HapStatusError(-70402)
        );
      }
    );
  },

  //HOMEKIT CHARACTERISTICS EVENTS

  refreshCharacteristic: function (characteristic, callback) {
    if (callback) {
      //return immediately
      callback(undefined, characteristic.value);
    }

    this.harmonyBase.refreshCurrentActivity(this, () => {
      if (this._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE) {
        if (characteristic.UUID == Characteristic.Active.UUID) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - refreshCharacteristic : updating Characteristic.Active to ' +
              HarmonyTools.isNotNil(this._currentInputService)
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            HarmonyTools.isNotNil(this._currentInputService)
          );
        } else if (characteristic.UUID == Characteristic.ActiveIdentifier.UUID) {
          this.log.debug(
            '(' +
              this.name +
              ')' +
              'INFO - refreshCharacteristic : updating Characteristic.ActiveIdentifier to ' +
              HarmonyTools.transformActivityIdToActiveIdentifier(
                this._currentInputService,
                this.inputServices
              )
          );
          this.harmonyBase.handleCharacteristicUpdate(
            this,
            characteristic,
            HarmonyTools.transformActivityIdToActiveIdentifier(
              this._currentInputService,
              this.inputServices
            )
          );
        }
      } else {
        this.log.debug(
          '(' + this.name + ')' + 'WARNING - refreshCharacteristic : no current Activity'
        );
        if (characteristic.UUID == Characteristic.Active.UUID) {
          this.harmonyBase.handleCharacteristicUpdate(this, characteristic, false);
        } else if (characteristic.UUID == Characteristic.ActiveIdentifier.UUID) {
          this.harmonyBase.handleCharacteristicUpdate(this, characteristic, 0);
        }
      }
    });
  },

  bindActiveCharacteristic(characteristic, service, homebridgeAccessory) {
    //set to main activity / activeIdentifier or off

    characteristic.on('set', (value, callback) => {
      const version = this.activityRequestVersion;
      this.writeTVCommand(callback, async (deadline) => {
        if (value === 0) return this.sendInputCommand(homebridgeAccessory, '-1', deadline);
        // Home may send ActiveIdentifier alongside Active. Preserve that selection.
        await new Promise((resolve) => setTimeout(resolve, HarmonyConst.DELAY_TO_UPDATE_STATUS));
        if (version !== this.activityRequestVersion) return this.inputCommand;
        if (HarmonyTools.isNil(this._currentInputService)) {
          const activity = HarmonyTools.transformActiveIdentifierToActivityId(
            service.getCharacteristic(Characteristic.ActiveIdentifier).value,
            this.inputServices
          );
          return this.sendInputCommand(
            homebridgeAccessory,
            '' + (activity > 0 ? activity : this.mainActivityId),
            deadline
          );
        }
      });
    });

    characteristic.on(
      'get',
      function (callback) {
        this.log.debug('(' + this.name + ')' + 'INFO - GET Characteristic.Active ');
        this.refreshCharacteristic(characteristic, callback);
      }.bind(this)
    );
  },

  bindActiveIdentifierCharacteristic: function (characteristic, homebridgeAccessory) {
    //set the current Activity
    characteristic.on('set', (value, callback) => {
      this.writeTVCommand(callback, (deadline) => {
        const activity = HarmonyTools.transformActiveIdentifierToActivityId(
          value,
          this.inputServices
        );
        if (activity <= 0) throw new this.api.hap.HapStatusError(-70410);
        return this.sendInputCommand(homebridgeAccessory, '' + activity, deadline);
      });
    });
    characteristic.on(
      'get',
      function (callback) {
        this.log.debug('(' + this.name + ')' + 'INFO - GET Characteristic.ActiveIdentifier');
        this.refreshCharacteristic(characteristic, callback);
      }.bind(this)
    );
  },

  bindRemoteKeyCharacteristic: function (characteristic) {
    characteristic.on('set', (value, callback) => {
      this.writeTVCommand(callback, (deadline) => {
        if (!(this._currentActivity > 0)) throw new this.api.hap.HapStatusError(-70402);
        return value === Characteristic.RemoteKey.PLAY_PAUSE
          ? this.handlePlayPause(deadline)
          : this.sendMappedCommand(this.keysMap[value], deadline);
      });
    });
  },

  bindMuteCharacteristic(characteristic) {
    characteristic.on('set', (value, callback) => {
      this.writeTVCommand(callback, (deadline) => {
        if (!this._currentInputService) throw new this.api.hap.HapStatusError(-70402);
        const command =
          HarmonyAsTVKeysTools.getOverrideCommand(this, 'MUTE') ||
          this._currentInputService.MuteCommand;
        return this.sendMappedCommand(command, deadline);
      });
    });

    characteristic.on(
      'get',
      function (callback) {
        this.log.debug('(' + this.name + ')' + 'INFO - GET Characteristic.Mute');
        callback(null, false);
      }.bind(this)
    );
  },

  bindVolumeSelectorCharacteristic(characteristic) {
    characteristic.on('set', (value, callback) => {
      if (value !== 0 && value !== 1) return callback(new this.api.hap.HapStatusError(-70410));
      if (this.relativeVolumeControl) {
        this.volumeControl
          .step(value === Characteristic.VolumeSelector.DECREMENT ? -1 : 1)
          .then(() => callback(null), callback);
        return;
      }
      this.writeTVCommand(callback, (deadline) => {
        if (!this._currentInputService) throw new this.api.hap.HapStatusError(-70402);
        const down = value === Characteristic.VolumeSelector.DECREMENT;
        const override = HarmonyAsTVKeysTools.getOverrideCommand(
          this,
          down ? 'VOLUME_DOWN' : 'VOLUME_UP'
        );
        const command = down
          ? this._currentInputService.VolumeDownCommand
          : this._currentInputService.VolumeUpCommand;
        return this.sendMappedCommand(
          override || command + '|' + this.numberOfCommandsSentForVolumeControl,
          deadline
        );
      });
    });
  },

  bindVolumeCharacteristic(characteristic) {
    characteristic.on(
      'set',
      function (value, callback) {
        if (this._currentActivity > 0) {
          this.log.debug('(' + this.name + ')' + 'INFO - SET Characteristic.Volume : ' + value);
          this.volumesLevel[this._currentActivity] = value;
        }
        callback(null);
      }.bind(this)
    );

    characteristic.on(
      'get',
      function (callback) {
        this.log.debug('(' + this.name + ')' + 'INFO - GET Characteristic.Volume');

        if (this.volumesLevel[this._currentActivity])
          callback(null, this.volumesLevel[this._currentActivity]);
        else callback(null, HarmonyConst.DEFAULT_VOLUME);
      }.bind(this)
    );
  },

  bindConfiguredNameCharacteristic: function (characteristic, service) {
    characteristic.on(
      'set',
      function (value, callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - SET Characteristic.ConfiguredName : ' + value
        );

        var idConf = 0;
        if (service.UUID == Service.InputSource.UUID) idConf = service.activityId;

        this.savedNames[idConf] = value;
        fs.writeFile(this.savedNamesFile, JSON.stringify(this.savedNames), (err) => {
          if (err) {
            this.log(
              '(' + this.name + ')' + 'ERROR - error occured could not write configured name %s',
              err
            );
          } else {
            this.log.debug(
              '(' +
                this.name +
                ')' +
                'INFO - configured name successfully saved! New name: %s ID: %s',
              value,
              idConf
            );
          }
        });

        callback(null);
      }.bind(this)
    );
  },

  bindCurrentVisibilityStateCharacteristic: function (characteristic, service) {
    characteristic.on(
      'get',
      function (callback) {
        let idConf = service.activityId;
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - GET Characteristic.CurrentVisibilityState : ' +
            (this.savedVisibility[idConf]
              ? this.savedVisibility[idConf]
              : 'DEFAULT - ' + Characteristic.TargetVisibilityState.SHOWN)
        );
        if (this.savedVisibility[idConf]) callback(null, this.savedVisibility[idConf]);
        else callback(null, Characteristic.CurrentVisibilityState.SHOWN);
      }.bind(this)
    );
  },

  bindTargetVisibilityStateCharacteristic(characteristic, service) {
    characteristic.on(
      'get',
      function (callback) {
        let idConf = service.activityId;
        this.log.debug(
          '(' +
            this.name +
            ')' +
            'INFO - GET Characteristic.TargetVisibilityState : ' +
            (this.savedVisibility[idConf]
              ? this.savedVisibility[idConf]
              : 'DEFAULT - ' + Characteristic.TargetVisibilityState.SHOWN)
        );
        if (this.savedVisibility[idConf]) callback(null, this.savedVisibility[idConf]);
        else callback(null, Characteristic.TargetVisibilityState.SHOWN);
      }.bind(this)
    );

    characteristic.on(
      'set',
      function (value, callback) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - SET Characteristic.TargetVisibilityState : ' + value
        );

        let idConf = service.activityId;

        let oldValue = this.savedVisibility[idConf]
          ? this.savedVisibility[idConf]
          : Characteristic.CurrentVisibilityState.SHOWN;
        this.savedVisibility[idConf] = value;
        fs.writeFile(this.savedVisibilityFile, JSON.stringify(this.savedVisibility), (err) => {
          if (err) {
            this.savedVisibility[idConf] = oldValue;
            this.log(
              '(' + this.name + ')' + 'ERROR - error occured could not write visibility state %s',
              err
            );
          } else {
            this.log.debug(
              '(' +
                this.name +
                ')' +
                'INFO - configured visibility successfully saved! New visibility: %s ID: %s',
              value,
              idConf
            );
          }

          service
            .getCharacteristic(Characteristic.CurrentVisibilityState)
            .updateValue(this.savedVisibility[idConf]);

          callback(null);
        });
      }.bind(this)
    );
  },

  bindPowerModeSelectionCharacteristic(characteristic) {
    characteristic.on('set', (value, callback) => {
      this.writeTVCommand(callback, (deadline) => {
        if (!this._currentInputService) throw new this.api.hap.HapStatusError(-70402);
        const command =
          HarmonyAsTVKeysTools.getOverrideCommand(this, 'SETUP') ||
          this._currentInputService.SetupCommand;
        return this.sendMappedCommand(command, deadline);
      });
    });
  },

  bindCharacteristicEventsForTV: function (homebridgeAccessory) {
    this.bindActiveCharacteristic(
      this.mainService.getCharacteristic(Characteristic.Active),
      this.mainService,
      homebridgeAccessory
    );

    this.bindActiveIdentifierCharacteristic(
      this.mainService.getCharacteristic(Characteristic.ActiveIdentifier),
      homebridgeAccessory
    );

    this.bindRemoteKeyCharacteristic(this.mainService.getCharacteristic(Characteristic.RemoteKey));

    this.bindPowerModeSelectionCharacteristic(
      this.mainService.getCharacteristic(Characteristic.PowerModeSelection)
    );

    this.bindConfiguredNameCharacteristic(
      this.mainService.getCharacteristic(Characteristic.ConfiguredName),
      this.mainService
    );
  },

  bindCharacteristicEventsForSpeaker: function () {
    this.bindMuteCharacteristic(this.tvSpeakerService.getCharacteristic(Characteristic.Mute));
    this.bindVolumeSelectorCharacteristic(
      this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
    );
    if (this.relativeVolumeControl) {
      // Optional absolute Volume would imply a real level, which Harmony cannot report.
      const volume = this.tvSpeakerService.characteristics.find(
        (c) => c.UUID === Characteristic.Volume.UUID
      );
      if (volume) this.tvSpeakerService.removeCharacteristic(volume);
    } else {
      this.bindVolumeCharacteristic(this.tvSpeakerService.getCharacteristic(Characteristic.Volume));
    }
  },

  bindCharacteristicEventsForInputs: function () {
    for (let i = 0, len = this.inputServices.length; i < len; i++) {
      this.bindConfiguredNameCharacteristic(
        this.inputServices[i].getCharacteristic(Characteristic.ConfiguredName),
        this.inputServices[i]
      );

      this.bindCurrentVisibilityStateCharacteristic(
        this.inputServices[i].getCharacteristic(Characteristic.CurrentVisibilityState),
        this.inputServices[i]
      );

      this.bindTargetVisibilityStateCharacteristic(
        this.inputServices[i].getCharacteristic(Characteristic.TargetVisibilityState),
        this.inputServices[i]
      );
    }
  },

  //SWITCHES METHODS

  showActivity: function (activity) {
    if (
      activity.id != -1 &&
      this.activitiesToPublishAsAccessoriesSwitch &&
      !this.activitiesToPublishAsAccessoriesSwitch.includes(activity.label)
    )
      return false;
    else return activity.id != -1 || this.showTurnOffActivity;
  },

  checkOn(service) {
    this.log.debug(
      '(' +
        this.name +
        ')' +
        'checkOn : ' +
        this._currentActivity +
        '/' +
        service.type +
        '/' +
        service.activityId +
        '/' +
        (this.showTurnOffActivity == 'inverted') +
        '/' +
        (this.showTurnOffActivity == 'stateless')
    );

    if (service.type == HarmonyConst.GENERALVOLUME_TYPE) {
      if (this.relativeVolumeControl) return this.volumeControl.available(service);
      return (
        this._currentActivity > -1 &&
        HarmonyTools.isNotNil(service.volumeDownCommands[this._currentActivity]) &&
        HarmonyTools.isNotNil(service.volumeUpCommands[this._currentActivity])
      );
    } else if (service.type == HarmonyConst.GENERALVOLUMEUP_TYPE) {
      return (
        this._currentActivity > -1 &&
        HarmonyTools.isNotNil(service.volumeUpCommands[this._currentActivity])
      );
    } else if (service.type == HarmonyConst.GENERALVOLUMEDOWN_TYPE) {
      return (
        this._currentActivity > -1 &&
        HarmonyTools.isNotNil(service.volumeDownCommands[this._currentActivity])
      );
    } else if (service.activityId == -1) {
      if (
        this._currentActivity == -1 &&
        (this.showTurnOffActivity == 'inverted' || this.showTurnOffActivity == 'stateless')
      ) {
        return false;
      }
      if (this._currentActivity != -1 && this.showTurnOffActivity == 'inverted') {
        return true;
      }
    }

    return this._currentActivity == service.activityId;
  },

  handleActivityOk: function (commandToSend) {
    this._currentSetAttemps = 0;
    if (this.relativeVolumeControl && this._currentActivity !== commandToSend)
      this.volumeControl.cancel();
    this._currentActivity = commandToSend;
    this._currentActivityLastUpdate = Date.now();

    for (let a = 0; a < this._foundAccessories.length; a++) {
      let foundHarmonyAccessory = this._foundAccessories[a];
      for (let s = 0; s < foundHarmonyAccessory.services.length; s++) {
        let otherService = foundHarmonyAccessory.services[s];

        if (otherService.type == HarmonyConst.ACTIVITY_TYPE) {
          let characteristic = otherService.getCharacteristic(Characteristic.On);

          HarmonyTools.disablePreviousActivity(
            this,
            characteristic,
            otherService,
            commandToSend,
            characteristic.value
          );
          HarmonyTools.handleOffActivity(this, characteristic, otherService, commandToSend);
        }
      }
    }
  },

  getService: function (homebridgeAccessory, idToFind) {
    var service;
    for (let a = 0; a < homebridgeAccessory.services.length; a++) {
      if (homebridgeAccessory.services[a].ActivityId == idToFind) {
        service = homebridgeAccessory.services[a];
        this.log.debug('(' + this.name + ')' + 'INFO - ' + service.displayName + ' activated');
        break;
      }
    }
    return service;
  },

  handleActivityInProgress: function (homebridgeAccessory, commandToSend, version) {
    this._currentSetAttemps = this._currentSetAttemps + 1;

    //we try again with a delay of 1sec since an activity is in progress and we couldn't update the one.
    setTimeout(() => {
      if (version !== this.activityRequestVersion || this.harmonyBase.stopped) return;
      if (this._currentSetAttemps < HarmonyConst.MAX_ATTEMPS_STATUS_UPDATE) {
        this.log.debug(
          '(' + this.name + ')' + 'INFO - activityCommand : RETRY to send command ' + commandToSend
        );
        this.activityCommand(homebridgeAccessory, commandToSend);
      } else {
        this.log(
          '(' +
            this.name +
            ')' +
            'ERROR - activityCommand : could not SET status, no more RETRY : ' +
            commandToSend
        );
        this.refreshPlatform();
      }
    }, HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE);
  },

  activityCommand: function (
    homebridgeAccessory,
    commandToSend,
    deadline = Infinity,
    version = this.activityRequestVersion
  ) {
    const operation = (async () => {
      if (version !== this.activityRequestVersion || this.harmonyBase.stopped) {
        throw new Error('Activity request cancelled');
      }
      if (this.relativeVolumeControl && this._currentActivity !== commandToSend)
        this.volumeControl.cancel();
      const data = await HarmonyTools.withDeadline(
        () => this.harmonyBase.harmony.startActivity(commandToSend),
        deadline
      );
      if (version !== this.activityRequestVersion || this.harmonyBase.stopped) {
        throw new Error('Activity request cancelled');
      }
      if (HarmonyTools.isCommandOk(data)) {
        this.handleActivityOk(commandToSend);
        if (this.TVAccessory) this.handleRefreshOfCharacteristic();
      } else if (HarmonyTools.isCommandInProgress(data)) {
        if (!Number.isFinite(deadline)) {
          this.handleActivityInProgress(homebridgeAccessory, commandToSend, version);
        } else {
          await HarmonyTools.withDeadline(
            () =>
              new Promise((resolve) =>
                setTimeout(
                  resolve,
                  Math.min(HarmonyConst.DELAY_BETWEEN_ATTEMPS_STATUS_UPDATE, deadline - Date.now())
                )
              ),
            deadline
          );
          if (version !== this.activityRequestVersion)
            throw new Error('Activity request cancelled');
          if (this._currentActivity !== commandToSend)
            return this.activityCommand(homebridgeAccessory, commandToSend, deadline, version);
        }
      } else {
        throw new Error('Hub rejected activity');
      }
    })();
    operation.catch((error) =>
      this.log('(' + this.name + ') ERROR - activityCommand: ' + error.message)
    );
    return operation;
  },

  setSwitchOnCharacteristic: function (
    homebridgeAccessory,
    characteristic,
    service,
    value,
    callback
  ) {
    let doCommand = true;
    let commandToSend = value ? service.activityId : '-1';
    let currentValue = characteristic.value;

    //Actitiy in skippedIfSameState
    if (HarmonyTools.isActivtyToBeSkipped(this, service.activityName)) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : SET on an activty in skippedIfsameState list ' +
          service.subtype
      );

      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' is ' +
          currentValue +
          ', wants to set to ' +
          value
      );

      //GLOBAL OFF SWITCH : do command only if it is off and we want to set it on since on state can't be reversed
      //ELSE, we do the command only if state is different.
      doCommand =
        service.activityId == -1
          ? (this.showTurnOffActivity == 'inverted' && currentValue && !value) ||
            (this.showTurnOffActivity != 'inverted' && !currentValue && value)
          : currentValue !== value;
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : SET on an activty not in skippedIfSameStateActivities list ' +
          service.subtype
      );
    }

    if (doCommand) {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' will be sent command ' +
          commandToSend
      );
      this.activityCommand(homebridgeAccessory, commandToSend);
      callback();
    } else {
      this.log.debug(
        '(' +
          this.name +
          ')' +
          'INFO : Activty ' +
          service.subtype +
          ' will not be sent any command '
      );
      callback();
      setTimeout(() => {
        characteristic.updateValue(currentValue);
      }, HarmonyConst.DELAY_TO_UPDATE_STATUS);
    }
  },

  bindCharacteristicEventsForSwitch: function (homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'set',
        function (value, callback) {
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
        function (callback) {
          this.refreshService(service, callback);
        }.bind(this)
      );
  },
};

export {HarmonySubPlatform};
