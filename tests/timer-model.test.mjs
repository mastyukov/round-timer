import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,totalDurationMs,computePhase,formatTime,crossedCountdown} from '../site/engine.mjs';

test('sane defaults and duration', () => {
  const c=normalizeConfig();
  assert.deepEqual(c,{work:120,rest:0,rounds:3,prepare:5});
  assert.equal(totalDurationMs(c),365000);
});
test('prepare, work, rest, finish boundaries', () => {
  const c={work:120,rest:30,rounds:3,prepare:5};
  assert.deepEqual([computePhase(c,0).type,computePhase(c,5000).type,computePhase(c,125000).type,computePhase(c,155000).type,computePhase(c,425000).type],['prepare','work','rest','work','done']);
});
test('zero rest means immediate next work round', () => {
  const c={work:30,rest:0,rounds:2,prepare:0};
  assert.equal(computePhase(c,30000).type,'work');
  assert.equal(computePhase(c,30000).round,2);
  assert.equal(computePhase(c,60000).type,'done');
});
test('infinite rounds avoid finite completion', () => {
  const c={work:30,rest:15,rounds:'infinity',prepare:5};
  assert.equal(totalDurationMs(c),Infinity);
  assert.equal(computePhase(c,50000).round,2);
  assert.equal(computePhase(c,50000).type,'work');
});
test('double and single sound threshold crossings but not 15s', () => {
  const before=(ms)=>({type:'work',key:'work-1',remainingMs:ms,durationMs:120000});
  assert.deepEqual(crossedCountdown(before(32000),before(30000)),[30]);
  assert.deepEqual(crossedCountdown(before(16000),before(14000)),[]);
  assert.deepEqual(crossedCountdown(before(10500),before(9950)),[10]);
  assert.deepEqual(crossedCountdown(before(5200),before(4900)),[5]);
});
test('time displays rounded-up remaining seconds', () => {
  assert.equal(formatTime(60001),'01:01');
  assert.equal(formatTime(0),'00:00');
});
