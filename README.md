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

> ## Work In Progress For TV MODE
>
> - IOS 12.2 TV MODE is still beta. This mode will focus on harmony hub activities : each activity of the hub is mapped to an input. A main activity is linked to the on/off switch of the accessory. Buttons on the remote app and volume controls will be binded to the one defined in the activity (if so). VOLUME IS BIND TO PHYSICAL BUTTONS WHEN REMOTE FROM CONTROL CENTER IS SHOWN . There is an option to override default mappings.
> - This plugin is not a dynamic platform : hub configured MUST be available at homebridge startup, however it will crash homebridge start process. Work in Progress on this, but be warned and thus thnik of having a separate homebridge instance for it

## Installation

1. Install Homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-harmony`
3. Update your Homebridge `config.json` using the sample below.

## Configuration

For Switch Mode :

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX",
    "showTurnOffActivity" : true,
    "skippedIfSameStateActivities" : ["PowerOff","La musique"],
    "publishActivitiesAsIndividualAccessories" : false
  }
]
```

For TV platform mode with ios 12.2 and homebridge 0.0.46 :

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "HubName",
    "hubIP": "192.168.1.XX",
    "TVPlatformMode" : true,
    "mainActivity" : "LA TV"
  }
]
```

Fields:

- `platform` must be "HarmonyHubWebSocket" (required).
- `name` is the name of the published accessory (required).
  - Use a different name for each entry if you have multiple hubs.
- `hubIP` is the static IP address of the hub (required). A static IP address is required.
- `showTurnOffActivity` configures whether to publish a "switch" accessory to turn off every activity (defaults to false).
  - if you set to true, The "switch" will be "on" if and only if there is no current activity, and toggling it while "on" does nothing.
  - if you set to "inverted", The "switch" will be "off" if and only if there is no current activity, and toggling it while "off" does nothing.
  - if you set to "stateless", it will always be off, but can be triggered to switch off current activity.
- `skippedIfSameStateActivities` array of Activities name to trigger only if their state is different from the action sent. Can be usefull if your devices in the activity have the same on / off command and you want to automate them outside off the home app . For TV mode, and PowerOff feature, you can add "PowerOff" to this list if you want.
- `addAllActivitiesToSkippedIfSameStateActivitiesList` option to add all activities automatically to skippedIfSameStateActivities behavior. (defaults : false)
- `publishActivitiesAsIndividualAccessories` option to publish activities as individual accessories. Defaults to true.
- `devicesToPublishAsAccessoriesSwitch` array of Devices to exposes with on/off function or custom functions
- `publishDevicesAsIndividualAccessories` option to publish devices as individual accessories. Defaults to true.
- `sequencesToPublishAsAccessoriesSwitch` array of Sequences to exposes through a switch.
- `publishSequencesAsIndividualAccessories` option to publish sequences as individual accessories. Defaults to true.
- `TVPlatformMode` option to try TV mode . STILL WORK IN PROGRESS - NEEDS IOS 12.2 / HOMEBRIDGE 0.0.46
- `mainActivity` set the mainactivity of the TV mode
- `playPauseBehavior` play/pause behavior in TV mode : if set to true, will send pause if played was set and vice-verca. Be aware that both commands must be available, and that it might be out of sync in case of external events (defaults : false - always send play command)
- `remoteOverrideCommandsList` option to ovverride default commands mapping in TV Platform Mode. See below for format.

All devices / Activites names are the one configured in harmony configuration, even if you rename them in home app.

**Option** `devicesToPublishAsAccessoriesSwitch` is an array that behaves this way :

- You should put the name of the device as it is named in harmony app,
- You can add a specific command or multiple ones **JUST AFTER A ";" or a series of ";"** if you want a switch to be added for this specific command or serie of commands (a default delay of 350ms will be added between each command if no sepecif delay is specified),
- If you do not specify any specific command, the plugin will add either powerToggle if found in Power command group, or PowerOn and/or PowerOff if there is no powerToggle feature,

As a sample :

```json
  "devicesToPublishAsAccessoriesSwitch" : ["Apple TV Gen 4;Play","Apple TV Gen 4;DirectionDown","Caisson","Sony PS4","MyDevice;Up|Up|2500;Down"]
```

will add

- a switch for "Apple TV Gen 4" "Play" command,
- a switch for "Apple TV Gen 4" "DirectionDown" command,
- a powerToggle switch for the device named "Caisson",
- a powerOff switch only for PS4 (since there is no powerToggle nor powerOn command for it)
- a switch that will send Up , then Up, then wait 2.5S, then send Down to MyDevice

All commands available are displayed at startup

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
- A '|' between each override for an activity, a ';' for spliting info of ovverride sequence

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
- MENU

Commands of your device is shown in the log at startup in lines like : 'INFO - Command : **COMMAND_NAME** discovered for device : **DEVICENAME**'

## Changelog

See [CHANGELOG][].

[changelog]: CHANGELOG.md

## Inspiration

Thanks to

- [iandday] for the Harmoney WebSocket protocol implementation and understanding of it.
- [lopelex] for his clean plugin.
- every tester / contributor that test, and give feedback in any way !

[lopelex]: https://github.com/lopelex/harmony-websocket
[iandday]: https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py

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
