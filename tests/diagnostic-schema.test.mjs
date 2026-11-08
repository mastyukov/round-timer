import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDiagnosticEvent, aggregateDiagnostics, EVENT_TYPES
} from '../diagnostics/schema.mjs';

test('event contract allows only bounded fields, no free text', () => {
  const event = sanitizeDiagnosticEvent({
    event: 'audio_failure', code: 'AUDIO_PLAY_REJECTED',
    component: 'audio', version: '0.8.3',
    time: Date.parse('2026-11-08T15:32:03Z'),
    email: 'private@example.com', phone: '+79998887766',
    ip: '1.2.3.4', url: 'https://private/?token=secret',
    stack: 'private stack', userId: 'secret-device-id',
  });
  assert.deepEqual(Object.keys(event), ['event', 'code', 'component', 'version', 'hourUtc']);
  assert.equal(event.hourUtc, Date.parse('2026-11-08T15:00:00Z'));
  assert(!JSON.stringify(event).includes('private'));
  assert(!JSON.stringify(event).includes('secret'));
  assert(!JSON.stringify(event).includes('1.2.3.4'));
});
test('untrusted strings are discarded instead of logged', () => {
  const output = sanitizeDiagnosticEvent({
    event: 'track-secret', code: 'my password',
    component: 'token', version: 'https://unsafe.example',
    time: -2, sessionId: 'should-not-pass'
  });
  assert.deepEqual(output, {
    event: 'app_error', code: 'UNKNOWN', component: 'other',
    version: 'unknown', hourUtc: 0
  });
});
test('aggregate returns counters rather than per-user histories', () => {
  const d={event:'asset_error',code:'ASSET_LOAD_FAILED',component:'assets',version:'0.8.3',time:Date.parse('2026-11-08T11:12:00Z')};
  const result=aggregateDiagnostics([d,d,{...d,ip:'10.0.0.1'}]);
  assert.equal(result.length,1);
  assert.equal(result[0].count,3);
  assert.equal(Object.keys(result[0]).length,6);
});
test('only diagnostic event types are accepted (usage analytics excluded)', () => {
  assert(!EVENT_TYPES.includes('workout_start'));
  assert(!EVENT_TYPES.includes('session_start'));
});
