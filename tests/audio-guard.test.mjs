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
