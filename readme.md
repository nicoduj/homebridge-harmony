
# Homebridge-harmony

First try to a homebridge plugin for harmony using websockets.

!!!!!!!
Work In Progress

Known issues :  
    - If you change activities too quickly, some unexpected behavior might occur (not checking the progress of activity launching currently) 
    - support Only one hub. If you have multiple one, try deifning multiple platforms in your config (not tested since I have only one hub)
    - still verbose on logs , for debugging purpose
    - no dynamic discovery of the hub
!!!!!!

`npm install -g homebridge-harmony`

## Homebridge configuration

    "platforms": [
        {
            "platform": "HarmonyHub",
            "name": "NicoHarmonyHub2",
            "hubIP": "192.168.1.42",
            "showTurnOffActivity" : true,
            "TurnOffActivityName" : "HC Off"
        }
    ]



### Notes  

Need a static IP for your hub

Use showTurnOffActivity property if you want a switch for turning off eveything (might be usefull for automations)
You can specify its name with TurnOffActivityName property.


### Inspiration 

Thanks to : https://github.com/iandday/pyharmony/blob/126e4d5042883f5f718e97d30de67083deedcea0/pyharmony/client.py
Fro WebSocket protocol on harmony !


