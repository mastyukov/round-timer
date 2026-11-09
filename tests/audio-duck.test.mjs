import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioDucking} from '../site/audio-duck.mjs';

function harness({session={type:'ambient'},enabled=true}={}) {
  let next=0;
  const tasks=new Map();
  const duck=createAudioDucking({
    session,enabled:()=>enabled,
    schedule:(fn,ms)=>{const id=++next;tasks.set(id,{fn,ms});return id;},
    unschedule:id=>tasks.delete(id)
  });
  return {duck,session,tasks,setEnabled:v=>{enabled=v;},finish(){
    for(const [id,t] of [...tasks]){tasks.delete(id);t.fn();}
  }};
}
test('requests transient for short cue then restores background music session',()=>{
  const h=harness();
  assert.equal(h.duck.supported,true);
  assert.equal(h.duck.cue(2100),true);
  assert.equal(h.session.type,'transient');
  assert.equal([...h.tasks.values()][0].ms,2100);
  h.finish();
  assert.equal(h.session.type,'ambient');
});
test('pause or Home restores session immediately even with pending timer',()=>{
  const h=harness({session:{type:'auto'}});
  h.duck.cue(2400);
  h.duck.stop();h.duck.stop();
  assert.equal(h.session.type,'auto');
  assert.equal(h.tasks.size,0);
});
test('overlapping cues extend ducking window without restoring too early',()=>{
 const h=harness();h.duck.cue(2000);h.duck.cue(500);
 assert.equal(h.tasks.size,1);
 h.finish();assert.equal(h.session.type,'ambient');
});
test('never changes audio of other apps if disabled or API unavailable',()=>{
  const missing=harness({session:null});
  assert.equal(missing.duck.supported,false);
  assert.equal(missing.duck.cue(),false);
  const h=harness({enabled:false});
  assert.equal(h.duck.cue(),false);assert.equal(h.session.type,'ambient');
});
test('unsupported setter safely fails, never throws or pauses music',()=>{
  const session={get type(){return 'ambient';},set type(value){throw Error('readonly');}};
  const h=harness({session});
  assert.equal(h.duck.cue(),false);
  h.duck.stop();
  assert.equal(h.session.type,'ambient');
});
test('ducking window is bounded to at most 3 seconds',()=>{
  const h=harness();h.duck.cue(900000);
  assert.equal([...h.tasks.values()][0].ms,3000);
});
