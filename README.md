# homebridge-harmony

[![npm](https://img.shields.io/npm/v/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)
[![npm](https://img.shields.io/npm/dw/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)
[![npm](https://img.shields.io/npm/dt/homebridge-harmony.svg)](https://www.npmjs.com/package/homebridge-harmony)

[![Build Status](https://travis-ci.com/nicoduj/homebridge-harmony.svg?branch=master)](https://travis-ci.com/nicoduj/homebridge-harmony)
[![Known Vulnerabilities](https://snyk.io/test/github/nicoduj/homebridge-harmony/badge.svg?targetFile=package.json)](https://snyk.io/test/github/nicoduj/homebridge-harmony?targetFile=package.json)
[![Greenkeeper badge](https://badges.greenkeeper.io/nicoduj/homebridge-harmony.svg)](https://greenkeeper.io/)

[Logitech Harmony](https://www.myharmony.com/en-us/) plugin for [HomeBridge](https://github.com/nfarina/homebridge) using WebSockets.

> ## Work In Progress
>
> List of known issues:
>
> - No dynamic discovery of the hub(s)
> - IOS 12.2 TV MODE is still beta. This mode will focus on harmony hub activities : each activity of the hub is mapped to an input. A main activity is linked to the on/off switch of the accessory. Buttons on the remote app and volume controls will be binded to the one defined in the activity (if so). VOLUME IS BIND TO PHYSICAL BUTTONS WHEN REMOTE FROM CONTROL CENTER IS SHOWN

In order to activate TV Platform Mode,you need to :

- set `TVPlatformMode` option to `true`,
- set `mainActivity` with the name of one of your activity that you want to be bind as the "main" switch.

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
    "skipedIfSameStateActivities" : ["PowerOff","La musique"],
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
  - The "switch" will be "on" if and only if there is no current activity, and toggling it while "on" does nothing.
- `skipedIfSameStateActivities` array of Activities name to trigger only if their state is different from the action sent. Can be usefull if your devices in the activity have the same on / off command and you want to automate them outside off the home app
- `addAllActivitiesToSkipedIfSameStateActivitiesList` option to add all activities automatically to skipedIfSameStateActivities behavior. (defaults : false)
- `publishActivitiesAsIndividualAccessories` option to publish activities as individual accessories. Defaults to true.
- `devicesToPublishAsAccessoriesSwitch` array of Devices to exposes with on/off function or custom functions
- `publishDevicesAsIndividualAccessories` option to publish devices as individual accessories. Defaults to true.
- `sequencesToPublishAsAccessoriesSwitch` array of Sequences to exposes through a switch.
- `publishSequencesAsIndividualAccessories` option to publish sequences as individual accessories. Defaults to true.
- `TVPlatformMode` option to try TV mode . STILL WORK IN PROGRESS - NEEDS IOS 12.2 / HOMEBRIDGE 0.0.46
- `mainActivity` set the mainactivity of the TV mode
- `playPauseBehavior` play/pause behavior in TV mode : if set to true, will send pause if played was set and vice-verca. Be aware that both commands must be available, and that it might be out of sync in case of external events (defaults : false - always send play command)

Option `devicesToPublishAsAccessoriesSwitch` is an array that behaves this way :

- You should put the name of the device as it is named in harmony app,
- You can add a specific command or multiple ones **JUST AFTER A ";" or a series of ";"** if you want a switch to be added for this specific command or serie of commands (a default delay of 350ms will be added between each command if no sepecif delay is specified),
- If you do not specify any specific command, the plugin will add either powerToggle if found in Power command group, or PowerOn and/or PowerOff if there is no powerToggle feature,
- As a sample :
  - "devicesToPublishAsAccessoriesSwitch" : ["Apple TV Gen 4;Play","Apple TV Gen 4;DirectionDown","Caisson","Sony PS4","MyDevice;Up|Up|2500;Down"] will add
    - a switch for "Apple TV Gen 4" "Play" command,
    - a switch for "Apple TV Gen 4" "DirectionDown" command,
    - a powerToggle switch for the device named "Caisson",
    - a powerOff switch only for PS4 (since there is no powerToggle nor powerOn command for it)
    - a switch that will send Up , then Up, then wait 2.5S, then send Down to MyDevice

All commands available are displayed at startup

Option `sequencesToPublishAsAccessoriesSwitch` is an array that behaves this way :

- You should put the name of the sequence as it is named in harmony app,
- As a sample :
  - "sequencesToPublishAsAccessoriesSwitch" : ["Test"] will expose the sequence Test as a button.

See [Logitech Harmony Sequence Configuration](https://support.myharmony.com/en-us/creating-button-sequences) for sequences configuration.

**Please note that the sequence can only be triggered if its activity is in use. (Sequences are linked to an activity by design in harmony app).**

## Changelog

- 0.4.7
  - [NEW] supports new option playPauseBehavior
- 0.4.6
  - [NEW] Supports Sequences. #69
- 0.4.5
  - [FIX] TVPlatform mode : name of device/inputs lost if modified at homebridge restart #68 (in docker env - using persist folder now)
  - [NEW] node.js minimum requirement updated to 7.6.0 (use of async / await)
- 0.4.4
  - [NEW] macro mode : you can specify the delay to wait after each command by adding a "|250" string for exemple : "MyDevice;Up|250;Down|500"
  - [FIX] TVPlatform mode : name of device/inputs lost if modified at homebridge restart #68
- 0.4.3
  - [FIX] TV Mode borken #66
  - [FIX] move timer for activity macro to 350ms
- 0.4.2
  - [FIX] move to latest version of @lopelex lib for compatibility with latest hub firmware 4.15.250 #64
  - [NEW] handle macro for devices switch . Use multiple commands separate by a ";" #63
  - [NEW] printing commands of your devices at startup in log (no debug needed)
- 0.4.1
  - [NEW] you can specify custom command for devices switches
  - [FIX] error if you set both options publishDevicesAsIndividualAccessories and publishActivitiesAsIndividualAccessories to false
- 0.4.0
  - [NEW] devicesToPublishAsAccessoriesSwitch option (#15)
- 0.3.9
  - [FIX] connection lost after a while : #56 and possible problem on different networks (still need confirmation #57)
- 0.3.8
  - [FIX] Moving back to official harmony-websocket plugin from @lopelex since pull request was mergerd and published
- 0.3.7
  - [FIX] TV-Mode : switching to pressrelease command for commands.
- 0.3.6
  - [FIX] TV-Mode : fixing Error: WebSocket closed with reason: Connection dropped by remote peer. (1006).
- 0.3.5
  - [FIX] TV-Mode : commands are not sent anymore
- 0.3.4
  - [FIX] TV-Mode : commands might be sent multiple times : switching to a forked version of harmony-websocket
- 0.3.3
  - [FIX] TV-Mode : commands might be sent multiple times
- 0.3.2
  - [FIX] disconnect issues #55
- 0.3.1
  - [FIX] tiny fixes / refactoring
- 0.3.0
  - [NEW] moving to @lopelex harmony-websocket lib
  - [NEW] no more timer for refresh (using statedigest only)
- 0.2.7
  - [FIX] bugs due to refresh through stateDigest - #50
- 0.2.6
  - [FIX] background refresh was stopping after 1 minute
- 0.2.5
  - [FIX] bugs and refactoring
- 0.2.4
  - [FIX] TV MODE - crash on button /volume action #50
  - [NEW] some code refactoring between two modes (I hope nothing is broken :)
- 0.2.3
  - [NEW] TV MODE - restoring SkipedIfSameStateActivities options #46
- 0.2.2
  - [FIX] TV MODE - potential issue with sound control
  - [FIX] TV MODE - potential issue with inputs lost (to be confirmed)
  - [NEW] refreshMode through stateDigest - option refreshByHub - defaults true #48
- 0.2.1
  - [FIX] TV MODE - remote controls are sent multiple times #43
  - [FIX] TV MODE - using the remote switch back to main activity #42
  - [FIX] TV MODE - goes to main input when run through automation #45
  - [FIX] TV MODE - cannot pick inputs at first launch #44 (not reproduced sinces other changes)
- 0.2.0
  - [FIX] crash when using off switch in accessory #36
  - [NEW] beta mode for TV - IOS 12.2
- 0.1.7
  - [FIX] Homebridge Crash when turning off activity #36 (publishActivitiesAsIndividualAccessories mode)
- 0.1.6
  - [FIX] Better default naming #33 . You might loose your renaming / room / inclusion in automation :(
- 0.1.5
  - [FIX] default value for publishActivitiesAsIndividualAccessories (true)
- 0.1.4
  - [NEW] option for using old way with one accessory for all activities #29
  - [FIX] add some delay before launching background refresh after successfull activity command since if refreshTimer is low the current activity get back to the wrong one
- 0.1.3
  - [FIX] fixing error in case of operation in progress (callback undefined in on_Timeout) #32
  - [FIX] fixing error in case of multiple hubs #28
- 0.1.2
  - [FIX] power off activity was able to be switched off when on.
- 0.1.1
  - [FIX] crash after launching an activity
  - [FIX] other activities not updated when activating one
- 0.1.0
  - [NEW] each activity is published as an accessory - You might need to empty your cache folder .
- 0.0.9
  - [NEW] option to add automatically all activities to skipedIfSameStateActivities
  - [FIX] skipedIfSameStateActivities propery no more mandatory
  - [FIX] potential conflict with other plugins
- 0.0.8
  - [NEW] add skipedIfSameStateActivities config list (see fields descrption).
  - [UPDATE] less Hub calls for currentActivity (refreshed only if it is not older than 2 secondes)
  - [UPDATE] some code refactoring
  - [UPDATE] turnOffActivityName option removed (switch can be renamed in homekit directly)
- 0.0.7
  - [NEW] refreshTimer option (for automation purpose)
  - [NEW] ip of hub is used as serial number of the device.
  - [UPDATE] logs are now less verbose, ACTIVATE -D switch on homebridge if you have any trouble in order to get full logs
- 0.0.6
  - [BREAKING] `platform` was renamed to `HarmonyHubWebSocket` to avoid conflicts with previous plugins commonly used.
  - [NEW] introduces retry mechanism if error codes 202 / 100 returns by hub while starting an activity
  - [UPDATE] updates node dependency to 6.0.0 and homebridge to 0.4.21
- 0.0.3
  - [BREAKING] `TurnOffActivityName` was renamed to `turnOffActivityName`.

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
