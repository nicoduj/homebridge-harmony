# homebridge-harmony

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

For Legacy Mode prior to ios 12.2 :

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "NicoHarmonyHub2",
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
    "name": "NicoHarmonyHub2",
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
- `TVPlatformMode` option to try TV mode . STILL WORK IN PROGRESS - NEEDS IOS 12.2 / HOMEBRIDGE 0.0.46
- `mainActivity` set the mainactivity of the TV mode

## Changelog

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

Thanks to [iandday/pyharmony/pyharmony/client.py](https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py) for the Harmoney WebSocket protocol implementation.
