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
      keysMap[Characteristic.RemoteKey.ARROW_UP] = this.getOverrideCommand(
        platform,
        'ARROW_UP',
        platform._currentInputService.DirectionUpCommand
      );

      keysMap[Characteristic.RemoteKey.ARROW_DOWN] = this.getOverrideCommand(
        platform,
        'ARROW_DOWN',
        platform._currentInputService.DirectionDownCommand
      );

      keysMap[Characteristic.RemoteKey.ARROW_LEFT] = this.getOverrideCommand(
        platform,
        'ARROW_LEFT',
        platform._currentInputService.DirectionLeftCommand
      );

      keysMap[Characteristic.RemoteKey.ARROW_RIGHT] = this.getOverrideCommand(
        platform,
        'ARROW_RIGHT',
        platform._currentInputService.DirectionRightCommand
      );

      keysMap[Characteristic.RemoteKey.SELECT] = this.getOverrideCommand(
        platform,
        'SELECT',
        getSelectKey(platform._currentInputService)
      );

      keysMap[Characteristic.RemoteKey.PLAY_PAUSE] = this.getOverrideCommand(
        platform,
        'PLAY',
        platform._currentInputService.PlayCommand
      );

      keysMap[Characteristic.RemoteKey.INFORMATION] = this.getOverrideCommand(
        platform,
        'INFORMATION',
        getInfoKey(platform._currentInputService)
      );

      keysMap[Characteristic.RemoteKey.BACK] = this.getOverrideCommand(
        platform,
        'BACK',
        getBackKey(platform._currentInputService)
      );

      keysMap[Characteristic.RemoteKey.EXIT] = this.getOverrideCommand(
        platform,
        'EXIT',
        getExitKey(platform._currentInputService)
      );

      keysMap[Characteristic.RemoteKey.REWIND] = this.getOverrideCommand(
        platform,
        'REWIND',
        platform._currentInputService.RewindCommand
      );

      keysMap[Characteristic.RemoteKey.FAST_FORWARD] = this.getOverrideCommand(
        platform,
        'FAST_FORWARD',
        platform._currentInputService.FastForwardCommand
      );

      keysMap[Characteristic.RemoteKey.NEXT_TRACK] = this.getOverrideCommand(
        platform,
        'NEXT_TRACK',
        platform._currentInputService.SkipForwardCommand
      );

      keysMap[Characteristic.RemoteKey.PREVIOUS_TRACK] = this.getOverrideCommand(
        platform,
        'PREVIOUS_TRACK',
        platform._currentInputService.SkipBackwardCommand
      );
    }
    platform.log.debug('(' + platform.name + ')' + 'keysMap is :' + JSON.stringify(keysMap));
    return keysMap;
  },

  getOverrideCommand: function (platform, command, defaultCommand, defaultNumberToSend = 1) {
    if (
      platform.remoteOverrideCommandsList &&
      platform.remoteOverrideCommandsList[platform._currentInputService.activityName] &&
      platform.remoteOverrideCommandsList[platform._currentInputService.activityName][command]
    ) {
      let override =
        platform.remoteOverrideCommandsList[platform._currentInputService.activityName][command];

      let overrideArray = override.split(';');
      let device = overrideArray[0];
      let cmd = overrideArray[1];
      var numberOfCommands = defaultNumberToSend;
      if (overrideArray.length > 2) numberOfCommands = overrideArray[2];

      let commandToSend = platform.harmonyBase.deviceCommands[[device, cmd]];

      platform.log(
        '(' + platform.name + ')' + 'INFO - TEST - ' + commandToSend + '-' + numberOfCommands
      );
      if (commandToSend) {
        commandToSend = commandToSend + '|' + numberOfCommands;

        platform.log.debug(
          '(' +
            platform.name +
            ')' +
            'INFO - Found Override Command for ' +
            command +
            ' : ' +
            device +
            '/' +
            cmd +
            ' - ' +
            commandToSend
        );
        return commandToSend;
      } else {
        platform.log.debug(
          '(' +
            platform.name +
            ')' +
            'WARNING - Did not found Override Command for ' +
            command +
            ' : ' +
            device +
            '/' +
            cmd
        );
      }
    }

    return defaultCommand;
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
