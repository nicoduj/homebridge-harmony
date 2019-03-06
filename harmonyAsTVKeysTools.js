const HarmonyConst = require('./harmonyConst');
module.exports = {
  mapKeys: function(platform, controlGroup, inputName, inputSourceService) {
    //keys
    for (let j = 0, len = controlGroup.length; j < len; j++) {
      let functions = controlGroup[j].function;
      if (controlGroup[j].name == 'Volume') {
        mapVolumeKeys(platform, functions, inputName, inputSourceService);
      } else if (controlGroup[j].name == 'NavigationBasic') {
        mapNavigationBasicKeys(
          platform,
          functions,
          inputName,
          inputSourceService
        );
      } else if (controlGroup[j].name == 'TransportBasic') {
        mapTransportBasicKeys(
          platform,
          functions,
          inputName,
          inputSourceService
        );
      } else if (controlGroup[j].name == 'NavigationDVD') {
        mapNavigationDVDKeys(
          platform,
          functions,
          inputName,
          inputSourceService
        );
      } else if (controlGroup[j].name == 'TransportExtended') {
        mapTransportExtendedKeys(
          platform,
          functions,
          inputName,
          inputSourceService
        );
      } else if (controlGroup[j].name == 'GameType3') {
        mapGameType3Keys(platform, functions, inputName, inputSourceService);
      }
    }
  },

  mapKeysForActivity: function(platform) {
    var keysMap = new Object();
    platform.log('CurrentInputService is : ' + platform._currentActivity);

    Characteristic = platform.api.hap.Characteristic;

    if (
      platform._currentActivity > HarmonyConst.CURRENT_ACTIVITY_NOT_SET_VALUE
    ) {
      keysMap[Characteristic.RemoteKey.ARROW_UP] =
        platform._currentInputService.DirectionUpCommand;
      keysMap[Characteristic.RemoteKey.ARROW_DOWN] =
        platform._currentInputService.DirectionDownCommand;
      keysMap[Characteristic.RemoteKey.ARROW_LEFT] =
        platform._currentInputService.DirectionLeftCommand;
      keysMap[Characteristic.RemoteKey.ARROW_RIGHT] =
        platform._currentInputService.DirectionRightCommand;
      keysMap[Characteristic.RemoteKey.SELECT] =
        platform._currentInputService.SelectCommand;
      keysMap[Characteristic.RemoteKey.PLAY_PAUSE] =
        platform._currentInputService.PlayCommand;
      keysMap[Characteristic.RemoteKey.INFORMATION] =
        platform._currentInputService.MenuCommand;
      keysMap[Characteristic.RemoteKey.BACK] =
        platform._currentInputService.ReturnCommand;
      keysMap[Characteristic.RemoteKey.EXIT] =
        platform._currentInputService.HomeCommand;
      keysMap[Characteristic.RemoteKey.REWIND] =
        platform._currentInputService.RewindCommand;
      keysMap[Characteristic.RemoteKey.FAST_FORWARD] =
        platform._currentInputService.FastForwardCommand;
      keysMap[Characteristic.RemoteKey.NEXT_TRACK] =
        platform._currentInputService.SkipForwardCommand;
      keysMap[Characteristic.RemoteKey.PREVIOUS_TRACK] =
        platform._currentInputService.SkipBackwardCommand;
    }
    platform.log('keysMap is :' + JSON.stringify(keysMap));
    return keysMap;
  },
};

function mapVolumeKeys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Mute') {
      platform.log('INFO - Mapping Mute for ' + inputName);
      inputSourceService.MuteCommand = functions[k].action;
    } else if (functions[k].name == 'VolumeDown') {
      platform.log('INFO - Mapping VolumeDown for ' + inputName);
      inputSourceService.VolumeDownCommand = functions[k].action;
    } else if (functions[k].name == 'VolumeUp') {
      platform.log('INFO - Mapping VolumeUp for ' + inputName);
      inputSourceService.VolumeUpCommand = functions[k].action;
    }
  }
}

function mapNavigationBasicKeys(
  platform,
  functions,
  inputName,
  inputSourceService
) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'DirectionDown') {
      platform.log('INFO - Mapping DirectionDown for ' + inputName);
      inputSourceService.DirectionDownCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionLeft') {
      platform.log('INFO - Mapping DirectionLeft for ' + inputName);
      inputSourceService.DirectionLeftCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionRight') {
      platform.log('INFO - Mapping DirectionRight for ' + inputName);
      inputSourceService.DirectionRightCommand = functions[k].action;
    } else if (functions[k].name == 'DirectionUp') {
      platform.log('INFO - Mapping DirectionUp for ' + inputName);
      inputSourceService.DirectionUpCommand = functions[k].action;
    } else if (functions[k].name == 'Select') {
      platform.log('INFO - Mapping Select for ' + inputName);
      inputSourceService.SelectCommand = functions[k].action;
    }
  }
}

function mapTransportBasicKeys(
  platform,
  functions,
  inputName,
  inputSourceService
) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Stop') {
      platform.log('INFO - Mapping Stop for ' + inputName);
      inputSourceService.StopCommand = functions[k].action;
    } else if (functions[k].name == 'Play') {
      platform.log('INFO - Mapping Play for ' + inputName);
      inputSourceService.PlayCommand = functions[k].action;
    } else if (functions[k].name == 'Rewind') {
      platform.log('INFO - Mapping Rewind for ' + inputName);
      inputSourceService.RewindCommand = functions[k].action;
    } else if (functions[k].name == 'Pause') {
      platform.log('INFO - Mapping Pause for ' + inputName);
      inputSourceService.PauseCommand = functions[k].action;
    } else if (functions[k].name == 'FastForward') {
      platform.log('INFO - Mapping FastForward for ' + inputName);
      inputSourceService.FastForwardCommand = functions[k].action;
    }
  }
}

function mapNavigationDVDKeys(
  platform,
  functions,
  inputName,
  inputSourceService
) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Return' || functions[k].name == 'Back') {
      platform.log('INFO - Mapping Return for ' + inputName);
      inputSourceService.ReturnCommand = functions[k].action;
    } else if (functions[k].name == 'Menu') {
      platform.log('INFO - Mapping Menu for ' + inputName);
      inputSourceService.MenuCommand = functions[k].action;
    }
  }
}

function mapTransportExtendedKeys(
  platform,
  functions,
  inputName,
  inputSourceService
) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'SkipBackward') {
      platform.log('INFO - Mapping SkipBackward for ' + inputName);
      inputSourceService.SkipBackwardCommand = functions[k].action;
    } else if (functions[k].name == 'SkipForward') {
      platform.log('INFO - Mapping SkipForward for ' + inputName);
      inputSourceService.SkipForwardCommand = functions[k].action;
    }
  }
}

function mapGameType3Keys(platform, functions, inputName, inputSourceService) {
  for (let k = 0, len = functions.length; k < len; k++) {
    if (functions[k].name == 'Home') {
      platform.log('INFO - Mapping Home for ' + inputName);
      inputSourceService.HomeCommand = functions[k].action;
    }
  }
}
