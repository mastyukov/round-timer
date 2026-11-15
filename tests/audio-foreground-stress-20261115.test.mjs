import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioInterruptionGuard,createActiveSoundController,createDelayedStartGuard,isCueFresh} from '../site/audio-guard.mjs';

function target(){
 const events=new Map();
 return {
  addEventListener(name,fn){events.set(name,[...(events.get(name)||[]),fn]);},
  removeEventListener(name,fn){events.set(name,(events.get(name)||[]).filter(x=>x!==fn));},
  emit(name){for(const fn of events.get(name)||[])fn();}
 };
}
function harness(){
 const win=target(),doc=Object.assign(target(),{hidden:false}),stops=[];
 const guard=createAudioInterruptionGuard({windowTarget:win,documentTarget:doc,stop:reason=>stops.push(reason)});
 const dispatch=name=>{
  if(name==='hidden'){doc.hidden=true;doc.emit('visibilitychange');}
  else if(name==='visible'){doc.hidden=false;doc.emit('visibilitychange');}
  else win.emit(name);
 };
 return {win,doc,stops,guard,dispatch};
}

test('normal iOS app return sequences clear interruption and keep clock independent',()=>{
 const scenarios=[
  ['blur','hidden','visible','focus'],
  ['hidden','pageshow','visible'],
  ['blur','pagehide','visible','pageshow'],
  ['blur','focus'],
  ['hidden','focus','visible'],
  ['blur','hidden','visible','pageshow']
 ];
 for(const scenario of scenarios){
  const h=harness();
  for(const event of scenario)h.dispatch(event);
  assert.equal(h.guard.interrupted,false,scenario.join(' -> '));
  assert(h.stops.length>=1,scenario.join(' -> '));
  h.guard.dispose();
 }
});

test('intermittent blind spot: blur with no matching focus/visibility restoration stays interrupted',()=>{
 const h=harness();
 h.dispatch('blur');
 assert.equal(h.doc.hidden,false,'the page may remain visible during iOS interruptions');
 assert.equal(h.guard.interrupted,true,'without a returning event the guard still mutes all cues');
 console.log('DIAGNOSTIC GAP: blur without a later focus/pageshow/visible event leaves audioInterruption.interrupted=true');
 h.guard.dispose();
});

test('late pagehide hard stop occurs even if blur already interrupted audio',()=>{
 const h=harness();
 h.dispatch('blur');h.dispatch('pagehide');
 assert.deepEqual(h.stops,['blur','pagehide']);
 h.dispatch('visible');
 assert.equal(h.guard.interrupted,false);
 h.guard.dispose();
});

test('visible restoration events repair guard even when they arrive in different orders',()=>{
 const restorers=['focus','pageshow','visible'];
 for(const restore of restorers){
  const h=harness();h.dispatch('blur');h.dispatch(restore);
  assert.equal(h.guard.interrupted,false,restore);
  h.guard.dispose();
 }
});

test('audio context can report running and accept scheduled cues without proving audible output',()=>{
 const scheduled=[];
 const ctx={
  state:'running',currentTime:7,destination:{},
  createBufferSource(){return {buffer:null,connect(){return this;},start(at){scheduled.push(at);},stop(){},disconnect(){}};},
  createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},connect(){},disconnect(){}};}
 };
 const active=createActiveSoundController();
 active.play({context:ctx,buffer:{duration:0.2},volume:0.9});
 assert.equal(ctx.state,'running');
 assert.equal(ctx.currentTime,7,'WebKit can report a stalled context time');
 assert.equal(scheduled.length,1);
 assert(Math.abs(scheduled[0]-7.008)<1e-6);
 console.log('DIAGNOSTIC GAP: JS scheduling succeeds while physical iPhone audio may be silent; speaker output needs device inspection');
});

test('280ms freshness protection intentionally discards old browser callbacks',()=>{
 assert.equal(isCueFresh(100),true);
 assert.equal(isCueFresh(280),true);
 assert.equal(isCueFresh(281),false);
 assert.equal(isCueFresh(2000),false);
 console.log('DIAGNOSTIC: 2-second-late callback is deliberately dropped, not played 2 seconds late');
});

test('background invalidates stale startup gong promises',async()=>{
 let plays=0;
 const guard=createDelayedStartGuard({canPlay:()=>true,play:()=>{plays++;}});
 let resolve;
 const readiness=new Promise(r=>{resolve=r;});
 guard.schedule(readiness,{});
 guard.invalidate();
 resolve(true);
 await new Promise(done=>setImmediate(done));
 assert.equal(plays,0);
});

test('repeated synthetic switches do not accumulate active interrupted state after a real restore event',()=>{
 for(let i=0;i<120;i++){
  const h=harness();
  const mode=i%4;
  if(mode===0){h.dispatch('blur');h.dispatch('hidden');h.dispatch('visible');}
  if(mode===1){h.dispatch('hidden');h.dispatch('visible');h.dispatch('focus');}
  if(mode===2){h.dispatch('blur');h.dispatch('pagehide');h.dispatch('visible');h.dispatch('pageshow');}
  if(mode===3){h.dispatch('blur');h.dispatch('focus');}
  assert.equal(h.guard.interrupted,false,'scenario '+i);
  h.guard.dispose();
 }
});
