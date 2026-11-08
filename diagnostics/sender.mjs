import {sanitizeDiagnosticEvent} from './schema.mjs';

// This module does not send anything unless an HTTPS receiver is configured.
// Only fixed-code technical failures; no names, IDs, URLs, messages, stacks or usage.
const FAILURES = new Set(['app_error', 'asset_error', 'audio_failure']);
const MAX_REPORTS = 5;

export function createDiagnosticSender({
  endpoint = '',
  transport = globalThis.fetch,
  maxReports = MAX_REPORTS,
} = {}) {
  let valid = false;
  try {
    const url = new URL(endpoint);
    valid = url.protocol === 'https:' && !!url.hostname;
  } catch {
    valid = false;
  }
  const enabled = valid && typeof transport === 'function';
  let sentThisSession = 0;
  return {
    get enabled() { return enabled; },
    async report(raw) {
      if (!enabled || !raw || !FAILURES.has(raw.event)) return false;
      if (sentThisSession >= Math.min(5, Math.max(0, Math.floor(maxReports)))) return false;
      const safe = sanitizeDiagnosticEvent(raw);
      // Strict output projection: excludes original event and any free-form content.
      const body = JSON.stringify({
        event: safe.event,
        code: safe.code,
        component: safe.component,
        version: safe.version,
      });
      sentThisSession += 1;
      try {
        // no-cors supports simple POST to a verified HTTPS receiver such as
        // Apps Script; an opaque response means delivery is NOT confirmed.
        await transport(endpoint, {
          method: 'POST',
          mode: 'no-cors',
          credentials: 'omit',
          cache: 'no-store',
          keepalive: true,
          headers: {'Content-Type': 'text/plain;charset=UTF-8'},
          body,
        });
        return true; // request submitted, NOT proof the receiver stored it
      } catch {
        return false; // never interfere with the timer
      }
    },
  };
}

export function attachBrowserErrorCapture({target, sender, version = 'unknown'}) {
  if (!target || !sender || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  const report = () => {
    // Never include raw JS messages, stack traces or file URLs.
    void sender.report({
      event: 'app_error',
      code: 'UNHANDLED_ERROR',
      component: 'ui',
      version,
    });
  };
  target.addEventListener('error', report);
  target.addEventListener('unhandledrejection', report);
  return () => {
    target.removeEventListener('error', report);
    target.removeEventListener('unhandledrejection', report);
  };
}
