const HarmonyPlatform = require('./harmonyPlatform').HarmonyPlatform;

module.exports = function(homebridge) {
  homebridge.registerPlatform(
    'homebridge-harmonyHub',
    'HarmonyHubWebSocket',
    HarmonyPlatform,
    true
  );
};
