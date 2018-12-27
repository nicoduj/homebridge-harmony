# homebridge-harmony

[Logitech Harmony](https://www.myharmony.com/en-us/) plugin for [HomeBridge](https://github.com/nfarina/homebridge) using WebSockets.

> ## Work In Progress
>
> List of known issues:
> * If you change activities too quickly, some unexpected behavior might occur (not checking the progress of activity launching currently)
> * Still verbose on logs, for debugging purpose
> * No dynamic discovery of the hub(s)

## Installation

1. Install Homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-harmony`
3. Update your Homebridge `config.json` using the sample below.

## Configuration

```json
"platforms": [
  {
    "platform": "HarmonyHub",
    "name": "NicoHarmonyHub2",
    "hubIP": "192.168.1.42",
    "showTurnOffActivity" : true,
    "turnOffActivityName" : "HC Off"
  }
]
```

Fields:

* `platform` must be "HarmonyHub" (required).
* `name` is the name of the published accessory (required).
  * Use a different name for each entry if you have multiple hubs ([source](https://github.com/KraigM/homebridge-harmonyhub/issues/149)).
* `hubIP` is the static IP address of the hub (required). A static IP address is required.
* `showTurnOffActivity` configures whether to publish a "switch" accessory to turn off every activity (defaults to false).
  * The "switch" will be "on" if and only if there is no current activity, and toggling it while "on" does nothing.
* `turnOffActivityName` customizes the name of the "switch" enabled by `showTurnOffActivity` (defaults to "PowerOff").

## Changelog

- 0.0.3
  - [BREAKING] `TurnOffActivityName` was renamed to `turnOffActivityName`.

## Inspiration

Thanks to [iandday/pyharmony/pyharmony/client.py](https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py) for the Harmoney WebSocket protocol implementation.
