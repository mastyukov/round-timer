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
        stop(at) {if(this.stopAt!==null)throw Error('double stop');this.stopAt=at;}
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
