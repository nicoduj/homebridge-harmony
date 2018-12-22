
# Homebridge-harmony

First try to a homebridge plugin for harmony using websockets.

!!!!!!!
Work In Progress

Known issues :  
*If you change activities too quickly, some unexpected behavior might occur (not checking the progress of activity launching currently) 
*Support Only one hub. If you have multiple one, try deifning multiple platforms in your config (not tested since I have only one hub)
*Still verbose on logs , for debugging purpose
*No dynamic discovery of the hub

!!!!!!!


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



### Notes  

Need a static IP for your hub

Use showTurnOffActivity property if you want a switch for turning off eveything (might be usefull for automations)
You can specify its name with TurnOffActivityName property.


!!!!!!WARNING!!!!!!!
Option TurnOffActivityName was renamed to turnOffActivityName in 0.0.3 (sorry for that)

### Inspiration 

Thanks to : https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py
for WebSocket protocol on harmony !


