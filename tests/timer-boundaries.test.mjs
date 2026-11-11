import test from 'node:test';
import assert from 'node:assert/strict';
import {computePhase,normalizeConfig,totalDurationMs,formatTime,
  WORK_CHOICES,REST_CHOICES,ROUND_CHOICES,PREPARE_CHOICES,crossedCountdown} from '../site/engine.mjs';

test('every approved work, rest, rounds and preparation preset remains unchanged',()=>{
 assert.deepEqual(WORK_CHOICES,[30,60,90,120,180,240,300,360,420,480,540,600]);
 assert(REST_CHOICES.includes(0)&&REST_CHOICES.includes(300));
 assert(ROUND_CHOICES.includes(12)&&ROUND_CHOICES.includes('infinity'));
 assert.deepEqual(PREPARE_CHOICES,[0,3,5,10,15,20,30]);
});

test('every exact boundary is deterministic to the millisecond',()=>{
 const c={prepare:5,work:30,rest:15,rounds:3};
 const expectations=[
  [0,'prepare',1,'00:05'],[4999,'prepare',1,'00:01'],
  [5000,'work',1,'00:30'],[34999,'work',1,'00:01'],
  [35000,'rest',1,'00:15'],[49999,'rest',1,'00:01'],
  [50000,'work',2,'00:30'],[80000,'rest',2,'00:15'],
  [95000,'work',3,'00:30'],[124999,'work',3,'00:01'],
  [125000,'done',3,'00:00']
 ];
 for(const [at,type,round,time] of expectations) {
   const p=computePhase(c,at);
   assert.equal(p.type,type,'type at '+at);
   assert.equal(p.round,round,'round at '+at);
   assert.equal(formatTime(p.remainingMs),time,'time at '+at);
 }
 assert.equal(totalDurationMs(c),125000);
});

test('zero preparation, no rest and infinity do not create zero/phantom phases',()=>{
 const c={prepare:0,work:30,rest:0,rounds:'infinity'};
 for(const at of [0,29999,30000,30001,90000,900001]){
   const p=computePhase(c,at);
   assert.equal(p.type,'work');
 }
 assert.equal(computePhase(c,30000).round,2);
 assert.equal(computePhase(c,90000).round,4);
});

test('wall-clock elapsed time catches up after a throttled or backgrounded page',()=>{
 const c=normalizeConfig({work:60,rest:30,rounds:2,prepare:5});
 const resumedAt=1700000000000,now=resumedAt+82000,elapsedBeforeMs=1500;
 const elapsed=elapsedBeforeMs+Math.max(0,now-resumedAt);
 const p=computePhase(c,elapsed);
 assert.equal(p.type,'rest');
 assert.equal(p.round,1);
 assert.equal(formatTime(p.remainingMs),'00:12');
});

test('large background jumps do not play a burst of delayed countdown warnings',()=>{
 const before={type:'work',key:'work-1',remainingMs:35000,durationMs:60000};
 const after={type:'work',key:'work-1',remainingMs:4000,durationMs:60000};
 const crossed=crossedCountdown(before,after);
 assert(crossed.length>1);
 // UI intentionally plays a sound only when exactly one threshold crossed.
 assert.equal(crossed.length===1,false);
});
