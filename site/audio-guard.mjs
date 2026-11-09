/**
 * Ignore stale initial gong requests after pause, reset, tab hiding or a
 * different round/session.  Does not own audio buffers, timers or sound rules.
 */
export function createDelayedStartGuard({canPlay, play}) {
  if (typeof canPlay !== 'function' || typeof play !== 'function') {
    throw new TypeError('Audio guard requires canPlay and play callbacks');
  }
  let generation = 0;
  return Object.freeze({
    invalidate() { generation++; },
    schedule(loading, context) {
      const scheduledGeneration = generation;
      // A rejected audio load must never interrupt timer controls.
      void Promise.resolve(loading).then(() => {
        if (generation === scheduledGeneration && canPlay(context)) play();
      }).catch(() => {});
    }
  });
}

/**
 * Owns every currently audible Web Audio source so PAUSE/RESET/background
 * can stop sounds that already started (not only delayed, unloaded sounds).
 * No background playback is requested. The timer clock is not affected.
 */
export function createActiveSoundController() {
  const active = new Set();
  function play({context, buffer, offset = 0, volume = 1}) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const at = context.currentTime + 0.008 + offset;
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    const entry = {source, gain, context};
    const cleanup = () => {
      active.delete(entry);
      try { source.disconnect(); } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    };
    source.onended = cleanup;
    active.add(entry);
    try { source.start(at); }
    catch (error) { cleanup(); throw error; }
  }
  function stopAll({fadeMs = 16} = {}) {
    for (const entry of active) {
      // Retire immediately: repeated pause/pagehide events must be harmless.
      active.delete(entry);
      const {source, gain, context} = entry;
      const now = context.currentTime;
      const fadeSeconds = Math.max(0, Math.min(0.05, fadeMs / 1000));
      try {
        gain.gain.cancelScheduledValues(now);
        if (fadeSeconds > 0) {
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        } else {
          gain.gain.setValueAtTime(0, now);
        }
        source.stop(now + fadeSeconds);
      } catch (_) {
        try { gain.gain.value = 0; } catch (_) {}
        try { source.stop(0); } catch (_) {}
      }
    }
  }
  return Object.freeze({play, stopAll});
}
