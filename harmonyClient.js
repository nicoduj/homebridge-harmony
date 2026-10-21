import Harmony from 'harmony-websocket';
import HarmonyConst from './harmonyConst.js';

export class HarmonyClient extends Harmony {
  _connect() {
    // harmony-websocket 1.5.5 stores sendTimeout in _sendTimeout but reads _timeout.
    // Supply the field its transport consumes so expired requests are also released.
    // This alias is harmless when the upstream implementation uses _sendTimeout.
    const timeout = Number(this._sendTimeout);
    this._timeout =
      Number.isFinite(timeout) && timeout > 0
        ? Math.min(timeout, 2147483647)
        : HarmonyConst.HUB_SEND_TIMEOUT;
    return super._connect();
  }
}
