const HarmonyPlatform = require('./harmonyPlatform').HarmonyPlatform;

module.exports = function (homebridge) {
  homebridge.registerPlatform('homebridge-harmony', 'HarmonyHubWebSocket', HarmonyPlatform, true);
};
