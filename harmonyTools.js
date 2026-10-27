import HarmonyConst from './harmonyConst.js';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_MACRO_COMMANDS = 100;
const MAX_MACRO_DELAY = 10000;

const HarmonyTools = {
  isSafeObjectKey: function (key) {
    return typeof key === 'string' && key.length > 0 && !UNSAFE_OBJECT_KEYS.has(key);
  },

  isNil: function (value) {
    return value === undefined || value === null;
  },

  isNotNil: function (value) {
    return value !== undefined && value !== null;
  },

  safeFileNameSegment: function (value) {
    const segment = String(this.isNil(value) ? 'unknown' : value)
      .replace(/[\\/\0]/g, '_')
      .trim();
    return segment.length > 0 ? segment.slice(0, 128) : 'unknown';
  },

  parseJsonObject: function (value, fallback = {}) {
    try {
      const parsed = JSON.parse(String(value));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fallback;
      }

      return Object.entries(parsed).reduce((result, [key, entryValue]) => {
        if (this.isSafeObjectKey(key)) {
          result[key] = entryValue;
        }
        return result;
      }, Object.create(null));
    } catch (err) {
      return fallback;
    }
  },

  parseJsonArray: function (value, fallback = []) {
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
      return fallback;
    }
  },

  isPlatformWithSwitch(platform) {
    if (
      platform.showTurnOffActivity ||
      platform.publishGeneralVolumeSlider ||
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

  checkParameter: function (parameter, def) {
    if (this.isNil(parameter)) {
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

  transformActivityIdToActiveIdentifier: function (currentInputService, sources) {
    if (this.isNotNil(currentInputService) && currentInputService.activityId > 0) {
      for (let i = 0, len = sources.length; i < len; i++) {
        if (sources[i].activityId == currentInputService.activityId) return i + 1;
      }
    } else return 0;
  },

  transformActiveIdentifierToActivityId: function (activeIdentifier, sources) {
    if (sources.length >= activeIdentifier && activeIdentifier > 0) {
      return sources[activeIdentifier - 1].activityId;
    } else return -1;
  },

  checkTurnOffActivityOption: function (str) {
    if (this.isNil(str)) return false;

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

  isActivtyToBeSkipped: function (platform, activity) {
    return (
      platform.addAllActivitiesToSkippedIfSameStateActivitiesList ||
      (platform.skippedIfSameStateActivities &&
        platform.skippedIfSameStateActivities.includes(activity))
    );
  },

  withDeadline: async function (action, deadline = Infinity) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Harmony command timed out');
    let timer;
    try {
      const operation = Promise.resolve().then(action);
      if (!Number.isFinite(deadline)) return await operation;
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Harmony command timed out')), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  },

  processCommands: function (hb, platform, commands, deadline = Infinity) {
    const operation = (async () => {
      const safeCommands = Array.isArray(commands)
        ? commands
            .slice(0, MAX_MACRO_COMMANDS)
            .filter((command) => typeof command === 'string' && command.length > 0)
        : [];
      for (let n = 0; n < safeCommands.length; n++) {
        const [command, delay] = safeCommands[n].split('|');
        await hb.sendCommand(platform, command, deadline);
        // Delays separate commands; no artificial wait after the final acknowledgement.
        if (n + 1 < safeCommands.length) {
          let timeToWait = Number(delay === undefined ? NaN : delay);
          if (!Number.isFinite(timeToWait)) timeToWait = HarmonyConst.DELAY_FOR_MACRO;
          timeToWait = Math.max(0, Math.min(timeToWait, MAX_MACRO_DELAY));
          await HarmonyTools.withDeadline(
            () =>
              new Promise((resolve) =>
                setTimeout(resolve, Math.min(timeToWait, deadline - Date.now()))
              ),
            deadline
          );
        }
      }
    })();
    operation.catch((error) => {
      platform.log('(' + platform.name + ') ERROR - command macro: ' + error.message);
    });
    return operation;
  },

  disablePreviousActivity: function (platform, characteristic, service, commandToSend, on) {
    //we disable previous activities that were on
    if (service.activityId != -1 && service.activityId != commandToSend && on) {
      platform.log.debug('(' + platform.name + ')' + 'Switching off ' + service.displayName);
      characteristic.updateValue(false);
    }
  },

  handleOffActivity: function (platform, characteristic, service, commandToSend) {
    //we turn off Off Activity if another activity was launched
    if (service.activityId == -1 && commandToSend != -1) {
      platform.log.debug(
        '(' +
          platform.name +
          ')' +
          'New activity on , turning off off Activity ' +
          service.displayName
      );
      characteristic.updateValue(platform.showTurnOffActivity == 'inverted' ? true : false);
    }

    //we turn on Off Activity if we turned off an activity (or turn on the general switch)
    if (service.activityId == -1 && commandToSend == -1) {
      platform.log.debug(
        '(' + platform.name + ')' + 'Turning on off Activity ' + service.displayName
      );
      characteristic.updateValue(
        platform.showTurnOffActivity != 'inverted' && platform.showTurnOffActivity != 'stateless'
          ? true
          : false
      );
    }
  },

  isCommandOk: function (data) {
    return data && data.code && data.code == 200 && data.msg && data.msg == 'OK';
  },

  isCommandInProgress: function (data) {
    return data && (data.code == 202 || data.code == 100);
  },

  /**
   * Resets a characteristic of a service by using a getter callback with a
   * specific delay
   *
   * @param {Service} service The service
   * @param {Characteristic} characterisitc The characteristic of the service to reset
   * @param {number} delay The delay when the reset takes place
   */
  resetCharacteristic: function (service, characteristic, delay) {
    if (!delay) {
      delay = 1000;
    }

    setTimeout(function () {
      service.getCharacteristic(characteristic).emit('get', function (error, newValue) {
        service.getCharacteristic(characteristic).updateValue(newValue);
      });
    }, delay);
  },
};

export default HarmonyTools;
