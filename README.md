# homebridge-harmony

[![npm](https://img.shields.io/npm/v/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)
[![npm](https://img.shields.io/npm/dw/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)
[![npm](https://img.shields.io/npm/dt/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)

[![Build Status](https://travis-ci.com/nicoduj/homebridge-harmony.svg?branch=master)](https://travis-ci.com/nicoduj/homebridge-harmony)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![CodeFactor](https://www.codefactor.io/repository/github/nicoduj/homebridge-harmony/badge)](https://www.codefactor.io/repository/github/nicoduj/homebridge-harmony)
[![Known Vulnerabilities](https://snyk.io/test/github/nicoduj/homebridge-harmony/badge.svg?targetFile=package.json)](https://snyk.io/test/github/nicoduj/homebridge-harmony?targetFile=package.json)
[![Greenkeeper badge](https://badges.greenkeeper.io/nicoduj/homebridge-harmony.svg)](https://greenkeeper.io/)

[![Support via PayPal][paypal-button]][paypal-nicoduj]

[Logitech Harmony](https://www.myharmony.com/en-us/) plugin for [HomeBridge](https://github.com/nfarina/homebridge) using WebSockets.

You can discuss this plugin on [Slack](https://homebridge-slackin.glitch.me) in #homebridge-harmony channel

[![Slack Status](https://homebridge-slackin.glitch.me/badge.svg)](https://homebridge-slackin.glitch.me)

This plugin is publishing harmony hub activities and devices as switches, with some advanced option (see below) for custom needs like macros, seuqences, and much more. The TV mode is focused on harmony hub activities only at the moment : each activity of the hub is mapped to an input. A main activity is linked to the on/off switch of the accessory. Buttons on the remote app and volume controls will be binded to the one defined in the activity (if so). VOLUME IS BIND TO PHYSICAL BUTTONS WHEN REMOTE FROM CONTROL CENTER IS SHOWN . There is an option to override default mappings.

## Installation

1. Install Homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-harmony@beta`
3. Update your Homebridge `config.json` using the sample below.

## Migration from 0.X to 1.X

**You have to move your other platforms if you have more than one in a new key : "otherPlatforms": [{ }] , see sample below. The plugin MUST be adde donly One time in your config**

1. TV mode is now the default. If you want switches, use option `switchAccessories` (or `activitiesToPublishAsAccessoriesSwitch` )
2. You have to rename `skipedIfSameStateActivities` to `skippedIfSameStateActivities` (with 2 `p` ) or `addAllActivitiesToSkipedIfSameStateActivitiesList` to `addAllActivitiesToSkippedIfSameStateActivitiesList` (also with 2 `p` ) if you were using one of those options.
3. You have to rename `publishActivitiesAsIndividualAccessories` to `publishSwitchActivitiesAsIndividualAccessories`
4. You have to modify `devicesToPublishAsAccessoriesSwitch` option if you were using it, see details below
5. If you were overriding **MENU** through `remoteOverrideCommandsList` you have to use **SETUP** instead now (since it is in the settings of the remote).

In case of any trouble like accessories allready added (or missing), you can try to use the option `cleanCache` but please report in order for me to fix if possible (see Fields section).

To setup mutliple tv platorm, you will have to add others manually in homekit. Other ones (than the first one) won't be cached. See `publishAllTVAsExternalAccessory` for details.

## Configuration samples

**Simple Config (only TV Accessory)**

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX"
  }
]
```

**Simple Config (only TV Accessory, but with another plugin exposing a TV accessory)**

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX",
    "publishAllTVAsExternalAccessory" : true
  }
]
```

**Only switch mode**

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX",
    "TVAccessory" : false,
    "switchAccessories" : true
  }
]
```

**Mutliple hubs**

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX",
    "otherPlatforms": [{
      "name": "OtherHubName",
      "hubIP": "192.168.1.YY"
      }]
  }
]
```

Fields:

- `platform` **GLOBAL** must be "HarmonyHubWebSocket" (required).
- `publishAllTVAsExternalAccessory` **GLOBAL** publish all TV accessory as external Accessories. This way, if another plugin on the same homebridge instance as one, the one on harmony will also be visible, but you will have to add them manually after the hub itself. Defaults to false (in that case, only second tv accessory or following will be published by this plugin as external accessories, first one will be linked to the hub).
- `cleanCache` **GLOBAL** option to clean all cached Accessory. Please use with caution, might be needed if you change names / config of the hub and there is some ghost devices in Homekit. Be sure that all your icloud sync is done while launching Homebridge with this option set to true. Set it back to false after and launch again ! It does not affect external accessories.
- `name` is the name of the published Platform (required).
- `hubIP` is the static IP address of the hub (required). A static IP address is required.
- `TVAccessory` publish hub with its activities as a TV Accessory (defaults to true).
- `switchAccessories` publish all activities as a Switch Accessory (defaults to false).
- `activitiesToPublishAsAccessoriesSwitch` array of Activities you want to expose as switches (all by default if switchAccessories is set to true, otherwise specify the list you want)
- `showTurnOffActivity` configures whether to publish a "switch" accessory to turn off every activity (defaults to false).
  - if you set to true, The "switch" will be "on" if and only if there is no current activity, and toggling it while "on" does nothing.
  - if you set to "inverted", The "switch" will be "off" if and only if there is no current activity, and toggling it while "off" does nothing.
  - if you set to "stateless", it will always be off, but can be triggered to switch off current activity.
- `skippedIfSameStateActivities` array of Activities name to trigger only if their state is different from the action sent. Can be usefull if your devices in the activity have the same on / off command and you want to automate them outside off the home app. For TV mode, and PowerOff feature, "PowerOff" is added by default, but you have to add it manually to this list if this list is set.
- `addAllActivitiesToSkippedIfSameStateActivitiesList` option to add all activities automatically to skippedIfSameStateActivities behavior. (defaults : false)
- `publishSwitchActivitiesAsIndividualAccessories` option to publish activities as individual accessories. Defaults to true.
- `devicesToPublishAsAccessoriesSwitch` array of Devices to exposes with on/off function or custom functions
- `publishDevicesAsIndividualAccessories` option to publish devices as individual accessories. Defaults to true.
- `sequencesToPublishAsAccessoriesSwitch` array of Sequences to exposes through a switch.
- `publishSequencesAsIndividualAccessories` option to publish sequences as individual accessories. Defaults to true.
- `homeControlsToPublishAsAccessoriesSwitch` array of home controls you want to publish as switches
- `publishHomeControlsAsIndividualAccessories` option to publish home controls as individual accessories. Defaults to true.
- `mainActivity` set the mainactivity of the TV mode
- `playPauseBehavior` play/pause behavior in TV mode : if set to true, will send pause if played was set and vice-verca. Be aware that both commands must be available, and that it might be out of sync in case of external events (defaults : false - always send play command)
- `remoteOverrideCommandsList` option to ovverride default commands mapping in TV Platform Mode. See below for format.
- `activitiesToPublishAsInputForTVMode` array of Activities you want to expose as inputs (all by default)
- `numberOfCommandsSentForVolumeControl` option to set the nnumber of commands to send for each volum (up or down) press. Defaults to 1
- `showCommandsAtStartup` show commands and device losts at startup (defaults to false)
- `otherPlatforms` is an array of hubs platform . All option are available except **GLOBAL** ones

All devices / Activites names are the one configured in harmony configuration, even if you rename them in home app.

**Option** `devicesToPublishAsAccessoriesSwitch` is an array that behaves this way :

- You should put the name of the device as it is named in harmony app,
- You can add a specific command or multiple ones **JUST AFTER A ";" or a series of ";"** if you want a switch to be added for this specific command or serie of commands (a default delay of 350ms will be added between each command if no sepecif delay is specified),
- If you do not specify any specific command, the plugin will add either powerToggle if found in Power command group, or PowerOn and/or PowerOff if there is no powerToggle feature,

As a sample :

```json
  "devicesToPublishAsAccessoriesSwitch" : ["Apple TV Gen 4|Button1;Play","Apple TV Gen 4;DirectionDown","Caisson","Sony PS4","MyDevice;Up;Up|2500;Down"]
```

will add

- a switch for "Apple TV Gen 4" "Play" command, named Button1,
- a switch for "Apple TV Gen 4" "DirectionDown" command,
- a powerToggle switch for the device named "Caisson",
- a powerOff switch only for PS4 (since there is no powerToggle nor powerOn command for it)
- a switch that will send Up , then Up, then wait 2.5 seconds, then send Down to MyDevice

All commands available are displayed at startup. If no name is specified, it will be added with a generated name.

**Option** `sequencesToPublishAsAccessoriesSwitch` is an array that behaves this way :

- You should put the name of the sequence as it is named in harmony app,

As a sample :

```json
   "sequencesToPublishAsAccessoriesSwitch" : ["Test"]
```

will expose the sequence Test as a button.

See [Logitech Harmony Sequence Configuration](https://support.myharmony.com/en-us/creating-button-sequences) for sequences configuration.

**_Please note that the sequence can only be triggered if its activity is in use. (Sequences are linked to an activity by design in harmony app)._**

**Option** `remoteOverrideCommandsList` is an array that behaves this way :

- You should put the name of the activity as it is named in harmony app,
- Then you should put the name of the command you want to ovverride
- Then you should put the name of the targeted device
- And finnaly the name of the command

As a sample :

```json
    "remoteOverrideCommandsList": {
        "La TV": {
            "REWIND": "Ampli;Number0",
            "BACK": "TV;Back"
        },
        "Un Film": {
            "ARROW_LEFT": "TV;PreviousChannel"
        }
    }
```

will bahaves this way :

- for "La TV" activity :
  - override REWIND button in the remote with Number0 command for Ampli device
  - override BACK button in the remote with Back Command of TV device
- for "Un Film" activity :
  - override ARROW_LEFT in the remote with PreviousChannel of TV device

Button List is :

- REWIND
- FAST_FORWARD
- NEXT_TRACK
- PREVIOUS_TRACK
- ARROW_UP
- ARROW_DOWN
- ARROW_LEFT
- ARROW_RIGHT
- SELECT
- BACK
- EXIT
- INFORMATION
- PLAY
- PAUSE
- VOLUME_UP
- VOLUME_DOWN
- MUTE
- SETUP

Commands of your device is shown in the log at startup in lines like : 'INFO - Command : **COMMAND_NAME** discovered for device : **DEVICENAME**'

## Changelog

See [CHANGELOG][].

[changelog]: CHANGELOG.md

## Inspiration

Thanks to

- [iandday] for the Harmoney WebSocket protocol implementation and understanding of it.
- [lopelex] for his clean plugin.
- every tester / contributor that test, and give feedback in any way , and especially [gitgayhub] for Home controls in 0.6.0

[lopelex]: https://github.com/lopelex/harmony-websocket
[iandday]: https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py
[gitgayhub]: https://github.com/gitgayhub

## Donating

Support this project and [others by nicoduj][nicoduj-projects] via [PayPal][paypal-nicoduj].

[![Support via PayPal][paypal-button]][paypal-nicoduj]

[nicoduj-projects]: https://github.com/nicoduj/
[paypal-button]: https://img.shields.io/badge/Donate-PayPal-green.svg
[paypal-nicoduj]: https://www.paypal.me/nicoduj/2.50

## License

As of Dec 01 2018, Nicolas Dujardin has released this repository and its contents to the public domain.

It has been released under the [UNLICENSE][].

[unlicense]: LICENSE
