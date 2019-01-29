var HarmonyPlatformAsSwitches = require('./harmonyAsSwitches')
  .HarmonyPlatformAsSwitches;
var HarmonyPlatformAsTVPlatform = require('./harmonyAsTVPlatform')
  .HarmonyPlatformAsTVPlatform;

module.exports = function(homebridge) {
  homebridge.registerPlatform(
    'homebridge-harmonyHub',
    'HarmonyHubWebSocket',
    HarmonyPlatform
  );
};

function HarmonyPlatform(log, config, api) {
  this.log = log;
  this.TVPlatformMode = config['TVPlatformMode'];

  if (this.TVPlatformMode == undefined) this.TVPlatformMode = false;

  this.log('PlatformMode : ' + this.TVPlatformMode);

  if (this.TVPlatformMode) {
    return new HarmonyPlatformAsTVPlatform(log, config, api);
  } else {
    return new HarmonyPlatformAsSwitches(log, config, api);
  }
}
