# homebridge-harmony

[Logitech Harmony](https://www.myharmony.com/en-us/) plugin for [HomeBridge](https://github.com/nfarina/homebridge) using WebSockets.

> ## Work In Progress
>
> List of known issues:
>
> - If you change activities too quickly, some unexpected behavior might occur
> - No dynamic discovery of the hub(s)

## Installation

1. Install Homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-harmony`
3. Update your Homebridge `config.json` using the sample below.

## Configuration

```json
"platforms": [
  {
    "platform": "HarmonyHubWebSocket",
    "name": "NicoHarmonyHub2",
    "hubIP": "192.168.1.42",
    "showTurnOffActivity" : true,
    "refreshTimer" : 10,
    "skipedIfSameStateActivities" : ["PowerOff","La musique"]
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
- `refreshTimer` enable refresh of activities state every X seconds, for automation purpose if you need to activate something else based on a state chnage of an activity. Be aware it might make you hub smoke since the plugin will ask its status very often :) (defaults : disable, accepted range : 5-600s).
- `skipedIfSameStateActivities` array of Activities name to trigger only if their state is different from the action sent. Can be usefull if your devices in the activity have the same on / off command and you want to automate them outside off the home app
- `addAllActivitiesToSkipedIfSameStateActivitiesList` option to add all activities automatically to skipedIfSameStateActivities behavior. (defaults : false)

## Changelog

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
