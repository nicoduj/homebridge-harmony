import HarmonyAsTVKeysTools from './harmonyAsTVKeysTools.js';

// Harmony supplies relative commands, not a measured or settable volume level.
export class HarmonyRelativeVolume {
  constructor(platform) {
    this.platform = platform;
    this.tail = Promise.resolve();
    this.pending = 0;
    this.generation = 0;
    this.sliders = new Map();
    this.disposed = false;
  }

  cancel() {
    this.generation++;
    for (const state of this.sliders.values()) clearTimeout(state.timer);
    this.sliders.clear();
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }

  error(status) {
    return new this.platform.api.hap.HapStatusError(status);
  }

  commands(direction, service) {
    const p = this.platform;
    if (this.disposed || !(Number(p._currentActivity) > 0) || !p.harmonyBase.harmony.isOpened()) {
      throw this.error(-70402);
    }
    const key = direction > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN';
    const input = p._currentInputService;
    const configuredOverride =
      input &&
      p.remoteOverrideCommandsList &&
      p.remoteOverrideCommandsList[input.activityName] &&
      p.remoteOverrideCommandsList[input.activityName][key];
    const override = input ? HarmonyAsTVKeysTools.getOverrideCommand(p, key) : undefined;
    // An explicit but unresolved override must not control a different device instead.
    if (configuredOverride && !override) throw this.error(-70412);
    if (override) {
      if (!override.length || override.some((command) => typeof command !== 'string' || !command)) {
        throw this.error(-70412);
      }
      return override;
    }
    const command = service
      ? (direction > 0 ? service.volumeUpCommands : service.volumeDownCommands)[p._currentActivity]
      : p._currentInputService &&
        (direction > 0
          ? p._currentInputService.VolumeUpCommand
          : p._currentInputService.VolumeDownCommand);
    if (!command || command === 'undefined') throw this.error(-70412);
    return [command];
  }

  available(service) {
    try {
      this.commands(1, service);
      this.commands(-1, service);
      return true;
    } catch {
      return false;
    }
  }

  async step(steps, service) {
    if (!Number.isInteger(steps) || Math.abs(steps) > 20) throw this.error(-70410);
    if (steps === 0) return;
    const p = this.platform;
    const activity = p._currentActivity;
    const generation = this.generation;
    // Includes time waiting behind earlier writes; finish before HAP's write timeout.
    const deadline = Date.now() + 6000;
    const commands = this.commands(steps, service);
    const repeat = Math.max(
      1,
      Math.min(5, Math.round(Number(p.numberOfCommandsSentForVolumeControl) || 1))
    );
    const count = Math.abs(steps) * repeat;
    // Bound queued work; a held button must not leave a long volume burst behind.
    if (commands.length > 10 || this.pending + count * commands.length > 20) {
      throw this.error(-70403);
    }
    this.pending += count * commands.length;
    const operation = this.tail
      .then(async () => {
        for (let n = 0; n < count; n++) {
          for (const entry of commands) {
            if (
              generation !== this.generation ||
              this.disposed ||
              p._currentActivity !== activity ||
              !p.harmonyBase.harmony.isOpened() ||
              Date.now() >= deadline
            ) {
              throw this.error(-70402);
            }
            const [command, delay] = entry.split('|');
            if (!command || command === 'undefined') throw this.error(-70412);
            const response = await this.send(command, Math.min(4000, deadline - Date.now()));
            if (generation !== this.generation || !response || Number(response.code) !== 200) {
              throw this.error(-70402);
            }
            if (delay !== undefined) {
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  Math.max(0, Math.min(1000, Number(delay) || 0, deadline - Date.now()))
                )
              );
            }
            if (Date.now() >= deadline) throw this.error(-70402);
          }
        }
      })
      .catch((error) => {
        // A failed or ambiguous command cancels the older queued burst; never retry it.
        if (this.generation === generation) this.generation++;
        throw error;
      });
    this.tail = operation.catch(() => {});
    try {
      await operation;
    } catch (error) {
      throw error instanceof p.api.hap.HapStatusError ? error : this.error(-70402);
    } finally {
      this.pending -= count * commands.length;
    }
  }

  async send(command, timeout) {
    let timer;
    try {
      return await Promise.race([
        this.platform.harmonyBase.harmony.sendCommand(command),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(this.error(-70402)), timeout);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  sliderValue(service) {
    if (!this.available(service)) return 0;
    const state = this.sliders.get(service);
    return state && state.activity === this.platform._currentActivity ? state.value : 50;
  }

  resetSlider(service) {
    const state = this.sliders.get(service);
    if (state) clearTimeout(state.timer);
    this.sliders.delete(service);
    const {Characteristic} = this.platform.api.hap;
    const available = this.available(service);
    service.updateCharacteristic(Characteristic.Brightness, available ? 50 : 0);
    service.updateCharacteristic(Characteristic.On, available);
  }

  refreshSlider(service) {
    const state = this.sliders.get(service);
    if (state && state.activity !== this.platform._currentActivity) {
      this.resetSlider(service);
      return;
    }
    const {Characteristic} = this.platform.api.hap;
    service.updateCharacteristic(Characteristic.Brightness, this.sliderValue(service));
    service.updateCharacteristic(Characteristic.On, this.available(service));
  }

  async setSlider(service, value) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw this.error(-70410);
    if (!this.available(service)) {
      this.resetSlider(service);
      throw this.error(-70402);
    }
    const activity = this.platform._currentActivity;
    let state = this.sliders.get(service);
    if (!state || state.activity !== activity) {
      if (state) clearTimeout(state.timer);
      state = {activity, position: 0, value: 50, pending: 0};
      this.sliders.set(service, state);
    }
    clearTimeout(state.timer);
    const position = Math.sign(value - 50) * Math.round(Math.abs(value - 50) / 5);
    const difference = position - state.position;
    state.position = position;
    state.value = value;
    state.pending++;
    // Consecutive writes in one drag send only the extra movement, including reversal.
    try {
      // Queue an entire movement together so a reversal cannot interleave with newer writes.
      await this.step(difference, service);
    } catch (error) {
      if (this.sliders.get(service) === state) this.resetSlider(service);
      throw error;
    } finally {
      state.pending--;
      if (this.sliders.get(service) === state && state.pending === 0) {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => this.resetSlider(service), 500);
        state.timer.unref();
      }
    }
  }
}
