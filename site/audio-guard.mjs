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
