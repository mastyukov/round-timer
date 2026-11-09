import test from 'node:test';
import assert from 'node:assert/strict';
import {createDelayedStartGuard} from '../site/audio-guard.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('start gong only plays when the sound load finishes during the same running phase',async()=>{
  const ready=deferred();let playing=true,count=0;
  const guard=createDelayedStartGuard({canPlay:()=>playing,play:()=>count++});
  guard.schedule(ready.promise,{phase:'work-1'});ready.resolve();await settle();
  assert.equal(count,1);
});

test('delayed start gong is cancelled by immediate PAUSE before loading finishes',async()=>{
  const ready=deferred();let playing=true,count=0;
  const guard=createDelayedStartGuard({canPlay:()=>playing,play:()=>count++});
  guard.schedule(ready.promise);playing=false;guard.invalidate();ready.resolve();await settle();
  assert.equal(count,0);
});

test('reset and quick new start cannot replay a prior session gong',async()=>{
  const old=deferred();const next=deferred();let count=0;
  const guard=createDelayedStartGuard({canPlay:()=>true,play:()=>count++});
  guard.schedule(old.promise);guard.invalidate();
  guard.schedule(next.promise);old.resolve();await settle();
  assert.equal(count,0);next.resolve();await settle();assert.equal(count,1);
});

test('hidden page or changed phase suppresses stale delayed audio',async()=>{
  for(const reason of ['hidden','rest']){
    const ready=deferred();let current='work',hidden=false,n=0;
    const guard=createDelayedStartGuard({canPlay:c=>!hidden&&current===c.phase,play:()=>n++});
    guard.schedule(ready.promise,{phase:'work'});
    if(reason==='hidden')hidden=true;else current='rest';
    ready.resolve();await settle();assert.equal(n,0,reason);
  }
});

test('rejected audio loading causes no playback or unhandled errors',async()=>{
  const ready=deferred();let n=0;
  createDelayedStartGuard({canPlay:()=>true,play:()=>n++}).schedule(ready.promise);
  ready.reject(Error('offline'));await settle();assert.equal(n,0);
});

function fakeAudioContext() {
  const sources = [];
  const gainNodes = [];
  const context = {
    currentTime: 12,
    destination: {},
    createBufferSource() {
      const source = {
        startAt:null, stopAt:null, onended:null, buffer:null,
        connect() {}, disconnect() {},
        start(at) {this.startAt=at;},
        stop(at) {this.stopAt=at;(this.stops||=[]).push(at);}
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const changes=[];
      const gain={
        value:1,
        cancelScheduledValues(at){changes.push(['cancel',at]);},
        setValueAtTime(value,at){this.value=value;changes.push(['set',at]);},
        linearRampToValueAtTime(value,at){this.value=value;changes.push(['ramp',at]);}
      };
      const node={gain,changes,connect(){},disconnect(){}};
      gainNodes.push(node);
      return node;
    }
  };
  return {context,sources,gainNodes};
}

test('PAUSE stops a gong already playing and fades it out without double-stop',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources,gainNodes}=fakeAudioContext();
  const active=createActiveSoundController();
  active.play({context,buffer:{},volume:.9});
  assert.equal(sources.length,1);
  assert.equal(sources[0].stopAt,null);
  active.stopAll();
  assert.ok(sources[0].stopAt>=context.currentTime);
  assert.ok(sources[0].stopAt<=context.currentTime+.05);
  assert.ok(gainNodes[0].changes.some(([type])=>type==='ramp'));
  active.stopAll();
  assert.equal(sources.length,1);
});

test('background stops all overlapping sounds, including scheduled clacks',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources,gainNodes}=fakeAudioContext();
  const active=createActiveSoundController();
  active.play({context,buffer:{},offset:0});
  active.play({context,buffer:{},offset:.25});
  active.stopAll({fadeMs:8});
  assert.equal(sources.length,2);
  assert.ok(sources.every(source=>source.stopAt!==null));
  assert.ok(sources.every(source=>source.stopAt<=context.currentTime+.01));
  assert.ok(gainNodes.every(node=>node.changes.some(([type])=>type==='ramp')));
});

test('pagehide immediately silences sounds and subsequent start can play normally',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources,gainNodes}=fakeAudioContext();
  const active=createActiveSoundController();
  active.play({context,buffer:{}});
  active.stopAll({fadeMs:0});
  assert.equal(sources[0].stopAt,context.currentTime);
  assert.ok(gainNodes[0].changes.some(([type])=>type==='set'));
  active.play({context,buffer:{}});
  assert.equal(sources.length,2);
  assert.equal(sources[1].stopAt,null);
  sources[1].onended();
  active.stopAll();
  assert.equal(sources[1].stopAt,null);
});

test('quick PAUSE cancels both an already playing gong and a pending sound decode',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources}=fakeAudioContext();
  const audio=createActiveSoundController();
  const loading=deferred();
  let running=true,late=0;
  const guard=createDelayedStartGuard({canPlay:()=>running,play:()=>late++});
  audio.play({context,buffer:{}});
  guard.schedule(loading.promise,{phase:'work'});
  running=false;
  guard.invalidate();
  audio.stopAll();
  loading.resolve();
  await settle();
  assert.equal(late,0);
  assert.notEqual(sources[0].stopAt,null);
});

test('audio controller tolerates an already-ended source during background shutdown',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources}=fakeAudioContext();
  const audio=createActiveSoundController();
  audio.play({context,buffer:{}});
  sources[0].onended();
  audio.stopAll({fadeMs:0});
  assert.equal(sources[0].stopAt,null);
});

function fakeEventTarget() {
  const handlers=new Map();
  return {
    hidden:false,
    addEventListener(name,callback){const s=handlers.get(name)||new Set();s.add(callback);handlers.set(name,s);},
    removeEventListener(name,callback){handlers.get(name)?.delete(callback);},
    dispatch(name){for(const callback of handlers.get(name)||[])callback();}
  };
}

test('window blur preempts audio before visibilitychange; clock remains independent',async()=>{
  const {createAudioInterruptionGuard,createActiveSoundController}=await import('../site/audio-guard.mjs');
  const windowTarget=fakeEventTarget(),documentTarget=fakeEventTarget();
  const {context,sources}=fakeAudioContext();
  const active=createActiveSoundController();
  const stops=[];
  const clock={elapsedBeforeMs:0,resumedAt:1000,status:'running'};
  active.play({context,buffer:{}});
  const guard=createAudioInterruptionGuard({
    windowTarget,documentTarget,
    stop:reason=>{stops.push(reason);active.stopAll({fadeMs:reason==='blur'?12:0});}
  });
  windowTarget.dispatch('blur');
  assert.equal(guard.interrupted,true);
  assert.deepEqual(stops,['blur']);
  assert.ok(sources[0].stopAt>context.currentTime);
  assert.deepEqual(clock,{elapsedBeforeMs:0,resumedAt:1000,status:'running'});
  documentTarget.hidden=true;
  documentTarget.dispatch('visibilitychange');
  assert.deepEqual(stops,['blur'],'hidden must not restart or duplicate stop');
  windowTarget.dispatch('pagehide');
  assert.deepEqual(stops,['blur','pagehide'],'pagehide must hard-stop a fading source');
  assert.equal(sources[0].stopAt,context.currentTime);
  documentTarget.hidden=false;
  documentTarget.dispatch('visibilitychange');
  assert.equal(guard.interrupted,false);
  guard.dispose();
});

test('hidden before blur and focus while still hidden never unlock sound',async()=>{
  const {createAudioInterruptionGuard}=await import('../site/audio-guard.mjs');
  const windowTarget=fakeEventTarget(),documentTarget=fakeEventTarget(),calls=[];
  const guard=createAudioInterruptionGuard({windowTarget,documentTarget,stop:reason=>calls.push(reason)});
  documentTarget.hidden=true;
  documentTarget.dispatch('visibilitychange');
  windowTarget.dispatch('blur');
  windowTarget.dispatch('focus');
  assert.equal(guard.interrupted,true);
  assert.deepEqual(calls,['hidden']);
  documentTarget.hidden=false;windowTarget.dispatch('pageshow');
  assert.equal(guard.interrupted,false);
  windowTarget.dispatch('blur');
  assert.deepEqual(calls,['hidden','blur']);
  guard.dispose();windowTarget.dispatch('blur');
  assert.deepEqual(calls,['hidden','blur']);
});

test('a hard stop can replace a pending fade without extending the sound',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources,gainNodes}=fakeAudioContext();
  const active=createActiveSoundController();
  active.play({context,buffer:{}});
  active.stopAll({fadeMs:16});
  assert.equal(sources[0].stopAt,context.currentTime+.016);
  active.stopAll({fadeMs:0});
  assert.equal(sources[0].stopAt,context.currentTime);
  assert.equal(gainNodes[0].gain.value,0);
  sources[0].onended();
  active.stopAll({fadeMs:0});
  assert.equal(sources[0].stops.length,2);
});

test('a repeated fade never reschedules the same sound',async()=>{
  const {createActiveSoundController}=await import('../site/audio-guard.mjs');
  const {context,sources}=fakeAudioContext();
  const active=createActiveSoundController();
  active.play({context,buffer:{}});
  active.stopAll({fadeMs:12});
  active.stopAll({fadeMs:12});
  assert.equal(sources[0].stops.length,1);
});
