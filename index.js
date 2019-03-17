const HarmonyPlatformAsSwitches = require('./harmonyAsSwitches')
  .HarmonyPlatformAsSwitches;
const HarmonyPlatformAsTVPlatform = require('./harmonyAsTVPlatform')
  .HarmonyPlatformAsTVPlatform;

module.exports = function(homebridge) {
  homebridge.registerPlatform(
    'homebridge-harmonyHub',
    'HarmonyHubWebSocket',
    HarmonyPlatform,
    true
  );
};

function HarmonyPlatform(log, config, api) {
  log('HarmonyPlatform Init');
  log(JSON.stringify(config));

  this.log = log;
  this.TVPlatformMode = config['TVPlatformMode'];

  if (this.TVPlatformMode == undefined) this.TVPlatformMode = false;

  this.log('INFO - TVPlatformMode : ' + this.TVPlatformMode);

  if (this.TVPlatformMode) {
    return new HarmonyPlatformAsTVPlatform(log, config, api);
  } else {
    return new HarmonyPlatformAsSwitches(log, config, api);
  }
}
