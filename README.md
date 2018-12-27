
# Homebridge-harmony

An homebridge plugin for harmony hub using websockets.


## Work In Progress

Known issues :
* If you change activities too quickly, some unexpected behavior might occur (not checking the progress of activity launching currently)
* Still verbose on logs, for debugging purpose
* No dynamic discovery of the hub(s)


`npm install -g homebridge-harmony`

## Homebridge configuration

    "platforms": [
        {
            "platform": "HarmonyHub",
            "name": "NicoHarmonyHub2",
            "hubIP": "192.168.1.42",
            "showTurnOffActivity" : true,
            "turnOffActivityName" : "HC Off"
        }
    ]

| Option        | Values           | Mandatory / Default  |
| ------------- |-------------| -----|
| platform      | HarmonyHub | YES |
| name      | Name you want to give to your hub. Use different ones if you have multiple hubs     |   YES |
| hubIP | IP of your hub. You MUST set a static IP to it on your network      |    YES |
| showTurnOffActivity | show a switch for turning off every activity. The switch is On when the is no current Activity. Off otherwise. Triggering it while On will do nothing and it will come back to its on state     |    NO / False |
| turnOffActivityName | Name you want to give to that TurnOffActivity.      |    NO/ PowerOff |


If you have multiple hubs, try defining multiple platforms in your config **with different names** (seems to work accordingly to @perlbo : https://github.com/KraigM/homebridge-harmonyhub/issues/149 )

### Notes

As mentionned, you need a static IP for your hub

Use showTurnOffActivity property if you want a switch for turning off eveything (might be usefull for automations)
You can specify its name with turnOffActivityName property.


!!!!!!WARNING!!!!!!!
Option TurnOffActivityName was renamed to turnOffActivityName in 0.0.3 (sorry for that)

### Inspiration

Thanks to : https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py
for WebSocket protocol on harmony !


