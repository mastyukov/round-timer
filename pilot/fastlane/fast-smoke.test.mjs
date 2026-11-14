import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,totalDurationMs,computePhase,formatTime,crossedCountdown} from '../../site/engine.mjs';
import {isCueFresh} from '../../site/audio-guard.mjs';

test('default rounds and zero preparation stay unchanged',()=>{
 const c=normalizeConfig();
 assert.deepEqual(c,{work:120,rest:30,rounds:3,prepare:0});
 assert.equal(totalDurationMs(c),420000);
});
test('exact one-minute work/rest boundaries',()=>{
 const c={work:60,rest:30,rounds:3,prepare:0};
 assert.equal(computePhase(c,0).key,'work-1');
 assert.equal(computePhase(c,60000).key,'rest-1');
 assert.equal(computePhase(c,90000).key,'work-2');
 assert.equal(computePhase(c,240000).type,'done');
});
test('optional preparation and zero rest',()=>{
 assert.equal(computePhase({work:60,rest:30,rounds:2,prepare:5},4999).type,'prepare');
 assert.equal(computePhase({work:30,rest:0,rounds:2,prepare:0},30000).round,2);
});
test('infinite session stays continuous',()=>{
 const c={work:30,rest:15,rounds:'infinity',prepare:0};
 assert.equal(totalDurationMs(c),Infinity);
 assert.equal(computePhase(c,45000).round,2);
});
test('clock rounding stays correct',()=>{
 assert.equal(formatTime(60001),'01:01');
 assert.equal(formatTime(60000),'01:00');
 assert.equal(formatTime(0),'00:00');
});
test('30, 10, 5 second crossing thresholds stay stable',()=>{
 const s=ms=>({type:'work',key:'work-1',durationMs:60000,remainingMs:ms});
 assert.deepEqual(crossedCountdown(s(31000),s(29950)),[30]);
 assert.deepEqual(crossedCountdown(s(11000),s(9950)),[10]);
 assert.deepEqual(crossedCountdown(s(5200),s(4900)),[5]);
 assert.deepEqual(crossedCountdown(s(15000),s(14000)),[]);
});
test('fresh sound callback allowed, late 2sec callback suppressed',()=>{
 assert.equal(isCueFresh(90),true);
 assert.equal(isCueFresh(280),true);
 assert.equal(isCueFresh(2000),false);
});
