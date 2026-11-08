/**
 * Standalone, dependency-free diagnostic event sanitizer.
 * No network traffic, no storage and no device fingerprinting.
 * An integration may only use this with a visible privacy explanation.
 */
export const EVENT_TYPES = Object.freeze([
  'app_error', 'asset_error', 'offline_fallback', 'audio_failure'
]);
export const ERROR_CODES = Object.freeze([
  'UNHANDLED_ERROR', 'AUDIO_PLAY_REJECTED', 'CACHE_INSTALL_FAILED',
  'ASSET_LOAD_FAILED', 'OFFLINE_FALLBACK_MISS', 'UNKNOWN'
]);
export const COMPONENTS = Object.freeze(['ui', 'audio', 'cache', 'assets', 'other']);

export function sanitizeDiagnosticEvent(raw = {}) {
  const event = EVENT_TYPES.includes(raw.event) ? raw.event : 'app_error';
  const code = ERROR_CODES.includes(raw.code) ? raw.code : 'UNKNOWN';
  const component = COMPONENTS.includes(raw.component) ? raw.component : 'other';
  const version = typeof raw.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw.version)
    ? raw.version : 'unknown';
  const time = typeof raw.time === 'number' && Number.isFinite(raw.time)
    && raw.time >= 0 && raw.time < 4102444800000
    ? Math.floor(raw.time / 3600000) * 3600000 : 0;
  // Discard all free-form strings, URLs, IPs, user identifiers and stack traces.
  return Object.freeze({event, code, component, version, hourUtc: time});
}

export function aggregateDiagnostics(events = []) {
  const counts = new Map();
  for (const candidate of events) {
    const safe = sanitizeDiagnosticEvent(candidate);
    const key = JSON.stringify(safe);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([key, count]) => ({
    ...JSON.parse(key),
    count
  })).sort((a, b) => b.count - a.count);
}
