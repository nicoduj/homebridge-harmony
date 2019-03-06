module.exports = {
  mapVolumeKeys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'Mute') {
        this.log('INFO - Mapping Mute for ' + inputName);
        inputSourceService.MuteCommand = functions[k].action;
      } else if (functions[k].name == 'VolumeDown') {
        this.log('INFO - Mapping VolumeDown for ' + inputName);
        inputSourceService.VolumeDownCommand = functions[k].action;
      } else if (functions[k].name == 'VolumeUp') {
        this.log('INFO - Mapping VolumeUp for ' + inputName);
        inputSourceService.VolumeUpCommand = functions[k].action;
      }
    }
  },

  mapNavigationBasicKeys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'DirectionDown') {
        this.log('INFO - Mapping DirectionDown for ' + inputName);
        inputSourceService.DirectionDownCommand = functions[k].action;
      } else if (functions[k].name == 'DirectionLeft') {
        this.log('INFO - Mapping DirectionLeft for ' + inputName);
        inputSourceService.DirectionLeftCommand = functions[k].action;
      } else if (functions[k].name == 'DirectionRight') {
        this.log('INFO - Mapping DirectionRight for ' + inputName);
        inputSourceService.DirectionRightCommand = functions[k].action;
      } else if (functions[k].name == 'DirectionUp') {
        this.log('INFO - Mapping DirectionUp for ' + inputName);
        inputSourceService.DirectionUpCommand = functions[k].action;
      } else if (functions[k].name == 'Select') {
        this.log('INFO - Mapping Select for ' + inputName);
        inputSourceService.SelectCommand = functions[k].action;
      }
    }
  },

  mapTransportBasicKeys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'Stop') {
        this.log('INFO - Mapping Stop for ' + inputName);
        inputSourceService.StopCommand = functions[k].action;
      } else if (functions[k].name == 'Play') {
        this.log('INFO - Mapping Play for ' + inputName);
        inputSourceService.PlayCommand = functions[k].action;
      } else if (functions[k].name == 'Rewind') {
        this.log('INFO - Mapping Rewind for ' + inputName);
        inputSourceService.RewindCommand = functions[k].action;
      } else if (functions[k].name == 'Pause') {
        this.log('INFO - Mapping Pause for ' + inputName);
        inputSourceService.PauseCommand = functions[k].action;
      } else if (functions[k].name == 'FastForward') {
        this.log('INFO - Mapping FastForward for ' + inputName);
        inputSourceService.FastForwardCommand = functions[k].action;
      }
    }
  },

  mapNavigationDVDKeys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'Return' || functions[k].name == 'Back') {
        this.log('INFO - Mapping Return for ' + inputName);
        inputSourceService.ReturnCommand = functions[k].action;
      } else if (functions[k].name == 'Menu') {
        this.log('INFO - Mapping Menu for ' + inputName);
        inputSourceService.MenuCommand = functions[k].action;
      }
    }
  },

  mapTransportExtendedKeys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'SkipBackward') {
        this.log('INFO - Mapping SkipBackward for ' + inputName);
        inputSourceService.SkipBackwardCommand = functions[k].action;
      } else if (functions[k].name == 'SkipForward') {
        this.log('INFO - Mapping SkipForward for ' + inputName);
        inputSourceService.SkipForwardCommand = functions[k].action;
      }
    }
  },

  mapGameType3Keys: function(functions, inputName, inputSourceService) {
    for (let k = 0, len = functions.length; k < len; k++) {
      if (functions[k].name == 'Home') {
        this.log('INFO - Mapping Home for ' + inputName);
        inputSourceService.HomeCommand = functions[k].action;
      }
    }
  },

  mapKeys: function(controlGroup, inputName, inputSourceService) {
    //keys
    for (let j = 0, len = controlGroup.length; j < len; j++) {
      let functions = controlGroup[j].function;
      if (controlGroup[j].name == 'Volume') {
        mapVolumeKeys(functions, inputName, inputSourceService);
      } else if (activities[i].controlGroup[j].name == 'NavigationBasic') {
        mapNavigationBasicKeys(functions, inputName, inputSourceService);
      } else if (activities[i].controlGroup[j].name == 'TransportBasic') {
        mapTransportBasicKeys(functions, inputName, inputSourceService);
      } else if (activities[i].controlGroup[j].name == 'NavigationDVD') {
        mapNavigationDVDKeys(functions, inputName, inputSourceService);
      } else if (activities[i].controlGroup[j].name == 'TransportExtended') {
        mapTransportExtendedKeys(functions, inputName, inputSourceService);
      } else if (activities[i].controlGroup[j].name == 'GameType3') {
        mapGameType3Keys(functions, inputName, inputSourceService);
      }
    }
  },

  mapKeysForActivity: function() {
    KeysMap = new Object();
    if (this._currentInputService > 0) {
      this.KeysMap[
        Characteristic.RemoteKey.ARROW_UP
      ] = this._currentInputService.DirectionUpCommand;
      this.KeysMap[
        Characteristic.RemoteKey.ARROW_DOWN
      ] = this._currentInputService.DirectionDownCommand;
      this.KeysMap[
        Characteristic.RemoteKey.ARROW_LEFT
      ] = this._currentInputService.DirectionLeftCommand;
      this.KeysMap[
        Characteristic.RemoteKey.ARROW_RIGHT
      ] = this._currentInputService.DirectionRightCommand;
      this.KeysMap[
        Characteristic.RemoteKey.SELECT
      ] = this._currentInputService.SelectCommand;
      this.KeysMap[
        Characteristic.RemoteKey.PLAY_PAUSE
      ] = this._currentInputService.PlayCommand;
      this.KeysMap[
        Characteristic.RemoteKey.INFORMATION
      ] = this._currentInputService.MenuCommand;
      this.KeysMap[
        Characteristic.RemoteKey.BACK
      ] = this._currentInputService.ReturnCommand;
      this.KeysMap[
        Characteristic.RemoteKey.EXIT
      ] = this._currentInputService.HomeCommand;
      this.KeysMap[
        Characteristic.RemoteKey.REWIND
      ] = this._currentInputService.RewindCommand;
      this.KeysMap[
        Characteristic.RemoteKey.FAST_FORWARD
      ] = this._currentInputService.FastForwardCommand;
      this.KeysMap[
        Characteristic.RemoteKey.NEXT_TRACK
      ] = this._currentInputService.SkipForwardCommand;
      this.KeysMap[
        Characteristic.RemoteKey.PREVIOUS_TRACK
      ] = this._currentInputService.SkipBackwardCommand;
    }
    return KeysMap;
  },
};
