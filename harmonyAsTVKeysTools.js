const HarmonyConst = require('./harmonyConst');

module.exports = {
  mapKeys: function (platform, controlGroup, inputName, inputSourceService) {
    //keys
    for (let j = 0, len = controlGroup.length; j < len; j++) {
      let functions = controlGroup[j].function;
      if (controlGroup[j].name == 'Volume') {
        mapVolumeKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'NavigationBasic') {
        mapNavigationBasicKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'NavigationExtended') {
        mapNavigationExtendedKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'NavigationDVD') {
        mapNavigationDVDKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'TransportBasic') {
        mapTransportBasicKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'TransportExtended') {
        mapTransportExtendedKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'GameType3') {
        mapGameType3Keys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'Setup') {
        mapSetupKeys(platform, functions, inputName, inputSourceService);
      }
    }
  },

  mapKeysForActivity: function (platform) {
    var keysMap = new Object();

    const Characteristic = platform.api.hap.Characteristic;
    if (
      platform._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE &&
      platform._currentInputService !== undefined
    ) {
      let overrideARROWUP = this.getOverrideCommand(platform, 'ARROW_UP');
      keysMap[Characteristic.RemoteKey.ARROW_UP] = overrideARROWUP
        ? overrideARROWUP
        : platform._currentInputService.DirectionUpCommand;

      let overrideARROWDOWN = this.getOverrideCommand(platform, 'ARROW_DOWN');
      keysMap[Characteristic.RemoteKey.ARROW_DOWN] = overrideARROWDOWN
        ? overrideARROWDOWN
        : platform._currentInputService.DirectionDownCommand;

      let overrideARROWLEFT = this.getOverrideCommand(platform, 'ARROW_LEFT');
      keysMap[Characteristic.RemoteKey.ARROW_LEFT] = overrideARROWLEFT
        ? overrideARROWLEFT
        : platform._currentInputService.DirectionLeftCommand;

      let overrideARROWRIGHT = this.getOverrideCommand(platform, 'ARROW_RIGHT');
      keysMap[Characteristic.RemoteKey.ARROW_RIGHT] = overrideARROWRIGHT
        ? overrideARROWRIGHT
        : platform._currentInputService.DirectionRightCommand;

      let overrideSELECT = this.getOverrideCommand(platform, 'SELECT');
      keysMap[Characteristic.RemoteKey.SELECT] = overrideSELECT
        ? overrideSELECT
        : getSelectKey(platform._currentInputService);

      let overridePLAY = this.getOverrideCommand(platform, 'PLAY');
      keysMap[Characteristic.RemoteKey.PLAY_PAUSE] = overridePLAY
        ? overridePLAY
        : platform._currentInputService.PlayCommand;

      let overrideINFORMATION = this.getOverrideCommand(platform, 'INFORMATION');
      keysMap[Characteristic.RemoteKey.INFORMATION] = overrideINFORMATION
        ? overrideINFORMATION
        : getInfoKey(platform._currentInputService);

      let overrideBACK = this.getOverrideCommand(platform, 'BACK');
      keysMap[Characteristic.RemoteKey.BACK] = overrideBACK
        ? overrideBACK
        : getBackKey(platform._currentInputService);

      let overrideEXIT = this.getOverrideCommand(platform, 'EXIT');
      keysMap[Characteristic.RemoteKey.EXIT] = overrideEXIT
        ? overrideEXIT
        : getExitKey(platform._currentInputService);

      let overrideREWIND = this.getOverrideCommand(platform, 'REWIND');
      keysMap[Characteristic.RemoteKey.REWIND] = overrideREWIND
        ? overrideREWIND
        : platform._currentInputService.RewindCommand;

      let overrideFASTFORWARD = this.getOverrideCommand(platform, 'FAST_FORWARD');
      keysMap[Characteristic.RemoteKey.FAST_FORWARD] = overrideFASTFORWARD
        ? overrideFASTFORWARD
        : platform._currentInputService.FastForwardCommand;

      let overrideNEXTTRACK = this.getOverrideCommand(platform, 'NEXT_TRACK');
      keysMap[Characteristic.RemoteKey.NEXT_TRACK] = overrideNEXTTRACK
        ? overrideNEXTTRACK
        : platform._currentInputService.SkipForwardCommand;

      let overridePREVIOUSTRACK = this.getOverrideCommand(platform, 'PREVIOUS_TRACK');
      keysMap[Characteristic.RemoteKey.PREVIOUS_TRACK] = overridePREVIOUSTRACK
        ? overridePREVIOUSTRACK
        : platform._currentInputService.SkipBackwardCommand;
    }
    platform.log.debug('(' + platform.name + ')' + 'keysMap is :' + JSON.stringify(keysMap));
    return keysMap;
  },

  getOverrideCommand: function (platform, command) {
    if (
      platform.remoteOverrideCommandsList &&
      platform.remoteOverrideCommandsList[platform._currentInputService.activityName] &&
      platform.remoteOverrideCommandsList[platform._currentInputService.activityName][command]
    ) {
      let override =
        platform.remoteOverrideCommandsList[platform._currentInputService.activityName][command];

      let functionsForCommand = [];
      let commands = override.split(';');
      let device = commands[0];

      for (let l = 1, len = commands.length; l < len; l++) {
        let commandTosend = commands[l].split('|');
        let cmd = platform.harmonyBase.deviceCommands[[device, commandTosend[0]]];
        if (cmd) {
          if (commandTosend.length === 2) {
            let fctWithDelay = cmd + '|' + commandTosend[1];
            functionsForCommand.push(fctWithDelay);
          } else {
            functionsForCommand.push(cmd);
          }
          platform.log.debug(
            '(' +
              platform.name +
              ')' +
              'INFO - commands found for ovverride : ' +
              platform._currentInputService.activityName +
              '-' +
              command +
              ':' +
              functionsForCommand
          );
        } else {
          platform.log(
            '(' +
              platform.name +
              ')' +
              'WARNING - Command not found for ovverride : ' +
              platform._currentInputService.activityName +
              '-' +
              device +
              '-' +
              commandTosend[0]
          );
        }
      }

      if (functionsForCommand.length > 0) {
        return functionsForCommand;
      } else {
        platform.log(
          '(' +
            platform.name +
            ')' +
            'ERROR - No commands found for ovverride : ' +
            platform._currentInputService.activityName +
            '-' +
            command
        );
      }
    }
  },
};

function mapVolumeKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Mute') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Mute for ' + inputName);
      inputSourceService.MuteCommand = functions[k].action;
    } else if (functions[k].name == 'VolumeDown') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping VolumeDown for ' + inputName);
      inputSourceService.VolumeDownCommand = functions[k].action;
    } else if (functions[k].name == 'VolumeUp') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping VolumeUp for ' + inputName);
      inputSourceService.VolumeUpCommand = functions[k].action;
    }
  }
}

function mapNavigationBasicKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'DirectionDown') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping DirectionDown for ' + inputName);
      inputSourceService.DirectionDownCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionLeft') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping DirectionLeft for ' + inputName);
      inputSourceService.DirectionLeftCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionRight') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping DirectionRight for ' + inputName);
      inputSourceService.DirectionRightCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionUp') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping DirectionUp for ' + inputName);
      inputSourceService.DirectionUpCommand = functions[k].action;
    } else if (functions[k].name == 'Select') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Select for ' + inputName);
      inputSourceService.SelectCommand = functions[k].action;
    }
  }
}

function mapNavigationExtendedKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Exit') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Exit for ' + inputName);
      inputSourceService.ExitCommand = functions[k].action;
    } else if (functions[k].name == 'Info') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Info for ' + inputName);
      inputSourceService.InfoCommand = functions[k].action;
    }
  }
}

function mapTransportBasicKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Stop') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Stop for ' + inputName);
      inputSourceService.StopCommand = functions[k].action;
    } else if (functions[k].name == 'Play') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Play for ' + inputName);
      inputSourceService.PlayCommand = functions[k].action;
    } else if (functions[k].name == 'Rewind') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Rewind for ' + inputName);
      inputSourceService.RewindCommand = functions[k].action;
    } else if (functions[k].name == 'Pause') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Pause for ' + inputName);
      inputSourceService.PauseCommand = functions[k].action;
    } else if (functions[k].name == 'FastForward') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping FastForward for ' + inputName);
      inputSourceService.FastForwardCommand = functions[k].action;
    }
  }
}

function mapNavigationDVDKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Return' || functions[k].name == 'Back') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Return for ' + inputName);
      inputSourceService.ReturnCommand = functions[k].action;
    } else if (functions[k].name == 'Menu') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Menu for ' + inputName);
      inputSourceService.MenuCommand = functions[k].action;
    } else if (functions[k].name == 'Back') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Back for ' + inputName);
      inputSourceService.BackCommand = functions[k].action;
    } else if (functions[k].name == 'TopMenu') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping TopMenu for ' + inputName);
      inputSourceService.TopMenuCommand = functions[k].action;
    }
  }
}

function mapTransportExtendedKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'SkipBackward') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping SkipBackward for ' + inputName);
      inputSourceService.SkipBackwardCommand = functions[k].action;
    } else if (functions[k].name == 'SkipForward') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping SkipForward for ' + inputName);
      inputSourceService.SkipForwardCommand = functions[k].action;
    }
  }
}

function mapGameType3Keys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Home') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Home for ' + inputName);
      inputSourceService.HomeCommand = functions[k].action;
    }
  }
}

function mapSetupKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Setup') {
      if (platform.showCommandsAtStartup)
        platform.log('(' + platform.name + ')' + 'INFO - Mapping Setup for ' + inputName);
      inputSourceService.SetupCommand = functions[k].action;
    }
  }
}

function getExitKey(inputService) {
  if (inputService.ExitCommand) return inputService.ExitCommand;
  else if (inputService.HomeCommand) return inputService.HomeCommand;
  else if (inputService.ReturnCommand) return inputService.ReturnCommand;
  else if (inputService.BackCommand) return inputService.BackCommand;
  else return undefined;
}

function getBackKey(inputService) {
  if (inputService.BackCommand) return inputService.BackCommand;
  if (inputService.ReturnCommand) return inputService.ReturnCommand;
  else if (inputService.ExitCommand) return inputService.ExitCommand;
  else return undefined;
}

function getInfoKey(inputService) {
  if (inputService.InfoCommand) return inputService.InfoCommand;
  else if (inputService.TopMenuCommand) return inputService.TopMenuCommand;
  else if (inputService.MenuCommand) return inputService.MenuCommand;
  else return undefined;
}

function getSelectKey(inputService) {
  if (inputService.SelectCommand) {
    return inputService.SelectCommand;
  } else return undefined;
}
