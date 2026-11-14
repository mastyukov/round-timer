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
  function play({context, buffer, offset = 0, volume = 1, category = 'cue'}) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const at = context.currentTime + 0.008 + offset;
    source.buffer = buffer;
    // RC16: only the button sample gets a softer attack/release to reduce
    // harsh mixing with music from other iPhone apps. Gongs and clacks
    // retain their exact timing, volume and envelope.
    if (category === 'button') {
      gain.gain.setValueAtTime(0.015, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.004);
      if (Number.isFinite(buffer?.duration) && buffer.duration > 0.025) {
        const end = at + buffer.duration;
        gain.gain.setValueAtTime(volume, end - 0.012);
        gain.gain.linearRampToValueAtTime(0.015, end);
      }
    } else {
      gain.gain.value = volume;
    }
    source.connect(gain);
    gain.connect(context.destination);
    const entry = {source, gain, context, category, stopping: false};
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
  function stopAll({fadeMs = 16, includeButton = true} = {}) {
    for (const entry of active) {
      if(!includeButton && entry.category==='button')continue;
      // Keep fading nodes until onended. If pagehide follows blur/pause,
      // an immediate stop must still be able to preempt a pending fade.
      if (entry.stopping && fadeMs > 0) continue;
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
        entry.stopping = true;
      } catch (_) {
        try { gain.gain.value = 0; } catch (_) {}
        try { source.stop(0); } catch (_) {}
      }
    }
  }
  return Object.freeze({play, stopAll});
}

/**
 * End foreground Web Audio on the earliest observable window-loss signal.
 * On iOS, visibilitychange can arrive after audio output is interrupted;
 * blur is an earlier opportunity, not a guarantee against WebKit glitches.
 * This does not pause/alter the monotonic timer clock or request background audio.
 */
export function createAudioInterruptionGuard({windowTarget, documentTarget, stop}) {
  if (!windowTarget?.addEventListener || !documentTarget?.addEventListener || typeof stop !== 'function') {
    throw new TypeError('Audio interruption guard requires event targets and stop');
  }
  let interrupted = !!documentTarget.hidden;
  const interrupt = reason => {
    if (interrupted) {
      // Even if already fading, pagehide should force an immediate hard stop.
      if (reason === 'pagehide') stop(reason);
      return;
    }
    interrupted = true;
    stop(reason);
  };
  const restore = () => {
    if (!documentTarget.hidden) interrupted = false;
  };
  const onBlur = () => interrupt('blur');
  const onPageHide = () => interrupt('pagehide');
  const onFocus = () => restore();
  const onPageShow = () => restore();
  const onVisibility = () => documentTarget.hidden ? interrupt('hidden') : restore();
  windowTarget.addEventListener('blur', onBlur);
  windowTarget.addEventListener('pagehide', onPageHide);
  windowTarget.addEventListener('focus', onFocus);
  windowTarget.addEventListener('pageshow', onPageShow);
  documentTarget.addEventListener('visibilitychange', onVisibility);
  return Object.freeze({
    get interrupted() {return interrupted;},
    dispose() {
      windowTarget.removeEventListener('blur', onBlur);
      windowTarget.removeEventListener('pagehide', onPageHide);
      windowTarget.removeEventListener('focus', onFocus);
      windowTarget.removeEventListener('pageshow', onPageShow);
      documentTarget.removeEventListener('visibilitychange', onVisibility);
    }
  });
}

/**
 * Rejects stale timing callbacks after iOS app switching. 280ms tolerates
 * normal 100ms foreground timer ticks but drops sounds 2 seconds late.
 * No background playback, replay, or timer-speed adjustment.
 */
export function isCueFresh(lateByMs,{maxLateMs=280}={}) {
  return Number.isFinite(lateByMs) && lateByMs>=0 && lateByMs<=maxLateMs;
}
