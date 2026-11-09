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

test('held mode does not restore after any cue timeout (the reported iPhone failure)',()=>{
 const h=harness({session:{type:'ambient'}});
 assert.equal(h.duck.begin(),true);
 assert.equal(h.session.type,'transient');
 assert.equal(h.tasks.size,0);
 h.finish();
 assert.equal(h.session.type,'transient','no return to ambient after gong ends');
 h.duck.stop();
 assert.equal(h.session.type,'ambient');
});
test('multiple gong/clack begins never toggle transient back to auto',()=>{
 const set=[];
 const session={value:'auto',get type(){return this.value;},set type(v){this.value=v;set.push(v);}};
 const h=harness({session});
 h.duck.begin();h.duck.begin();h.duck.begin();
 assert.deepEqual(set,['transient']);
 h.duck.stop();
 assert.deepEqual(set,['transient','auto']);
});
test('held audio session returns to prior category on Home or PAUSE',()=>{
 const h=harness({session:{type:'playback'}});
 h.duck.begin();
 assert.equal(h.session.type,'transient');
 h.duck.stop();
 assert.equal(h.session.type,'playback');
 assert.equal(h.tasks.size,0);
});
test('held mode refuses unsupported API without interrupting playback',()=>{
 const h=harness({session:null});
 assert.equal(h.duck.begin(),false);
 const rejected=harness({session:{get type(){return 'auto';},set type(){throw Error('blocked');}}});
 assert.equal(rejected.duck.begin(),false);
});
