const HarmonyConst = require('./harmonyConst');

module.exports = {
  isPlatformWithSwitch(platform) {
    if (
      platform.showTurnOffActivity ||
      platform.switchAccessories ||
      (platform.activitiesToPublishAsAccessoriesSwitch &&
        platform.activitiesToPublishAsAccessoriesSwitch.length > 0) ||
      (platform.sequencesToPublishAsAccessoriesSwitch &&
        platform.sequencesToPublishAsAccessoriesSwitch.length > 0) ||
      (platform.devicesToPublishAsAccessoriesSwitch &&
        platform.devicesToPublishAsAccessoriesSwitch.length > 0) ||
      (platform.homeControlsToPublishAsAccessoriesSwitch &&
        platform.homeControlsToPublishAsAccessoriesSwitch.length > 0)
    ) {
      return true;
    } else {
      return false;
    }
  },

  isPlatformEmpty(platform) {
    if (platform.TVAccessory || this.isPlatformWithSwitch(platform)) {
      return false;
    } else {
      return true;
    }
  },

  checkParameter: function(parameter, def) {
    if (parameter == undefined) {
      return def;
    } else {
      if (typeof parameter === 'string') {
        switch (parameter.toLowerCase().trim()) {
          case 'true':
          case 'yes':
            return true;
          case 'false':
          case 'no':
          case null:
            return false;
          default:
            return parameter;
        }
      } else {
        return parameter;
      }
    }
  },

  checkTurnOffActivityOption: function(str) {
    if (str == null || str == undefined) return false;

    if (typeof str === 'boolean') {
      return str === true;
    }

    if (typeof str === 'string') {
      switch (str.toLowerCase().trim()) {
        case 'true':
        case 'yes':
        case '1':
          return true;
        case 'false':
        case 'no':
        case '0':
        case null:
          return false;
        default:
          return str;
      }
    }
  },

  serviceIsNotTv(service) {
    return (
      service.type === HarmonyConst.DEVICE_TYPE ||
      service.type === HarmonyConst.DEVICEMACRO_TYPE ||
      service.type === HarmonyConst.SEQUENCE_TYPE ||
      service.type === HarmonyConst.HOME_TYPE
    );
  },

  isActivtyToBeSkipped: function(platform, activity) {
    return (
      platform.addAllActivitiesToSkippedIfSameStateActivitiesList ||
      (platform.skippedIfSameStateActivities &&
        platform.skippedIfSameStateActivities.includes(activity))
    );
  },

  processCommands: async function(hb, platform, commands) {
    for (const command of commands) {
      let commandTosend = command.split('|');
      let timeToWait = HarmonyConst.DELAY_FOR_MACRO;
      if (commandTosend.length === 2) timeToWait = commandTosend[1];
      else timeToWait = HarmonyConst.DELAY_FOR_MACRO;
      await processCommand(hb, platform, commandTosend[0], timeToWait);
    }
  },

  disablePreviousActivity: function(
    platform,
    characteristic,
    service,
    commandToSend,
    on
  ) {
    //we disable previous activities that were on
    if (service.activityId != -1 && service.activityId != commandToSend && on) {
      platform.log.debug('Switching off ' + service.displayName);
      characteristic.updateValue(false);
    }
  },

  handleOffActivity: function(
    platform,
    characteristic,
    service,
    commandToSend
  ) {
    //we turn off Off Activity if another activity was launched
    if (service.activityId == -1 && commandToSend != -1) {
      platform.log.debug(
        'New activity on , turning off off Activity ' + service.displayName
      );
      characteristic.updateValue(
        platform.showTurnOffActivity == 'inverted' ? true : false
      );
    }

    //we turn on Off Activity if we turned off an activity (or turn on the general switch)
    if (service.activityId == -1 && commandToSend == -1) {
      platform.log.debug('Turning on off Activity ' + service.displayName);
      characteristic.updateValue(
        platform.showTurnOffActivity != 'inverted' &&
          platform.showTurnOffActivity != 'stateless'
          ? true
          : false
      );
    }
  },

  isCommandOk: function(data) {
    return (
      data && data.code && data.code == 200 && data.msg && data.msg == 'OK'
    );
  },

  isCommandInProgress: function(data) {
    return data && (data.code == 202 || data.code == 100);
  },
};

async function processCommand(hb, platform, command, timeToWait) {
  // notice that we can await a function
  // that returns a promise
  await hb.sendCommand(platform, command);
  await delay(timeToWait);
}

function delay(timeToWait) {
  return new Promise(resolve => setTimeout(resolve, timeToWait));
}
