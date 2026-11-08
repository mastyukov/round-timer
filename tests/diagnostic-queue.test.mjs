import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticSender} from '../site/diagnostics/sender.mjs';

const uuid=i=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111';
const event={event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.6'};
function memoryStorage(){
 const m=new Map();
 return {
  getItem:k=>m.get(k)||null,
  setItem:(k,v)=>{m.set(k,v);},
  get all(){return [...m.values()]}
 };
}
function factory(o={}){
 let time=1000000,seq=1;
 const target={listeners:new Map(),addEventListener(n,f){this.listeners.set(n,f);},
   removeEventListener(n){this.listeners.delete(n);}};
 const options={
   endpoint:'https://receiver.test/v1/error',
   now:()=>time,idFactory:()=>uuid(seq++),storage:memoryStorage(),
   onlineTarget:target,timeout:()=>({unref(){}}),
   transport:async()=>({status:204,type:'cors'}),...o
 };
 return {sender:createDiagnosticSender(options),options,target,
   tick:ms=>{time+=ms;},get time(){return time;}};
}
const micro=()=>new Promise(resolve=>setImmediate(resolve));

test('one-off ID and only four technical dimensions transmitted',async()=>{
 const calls=[];const x=factory({transport:async(_u,p)=>{calls.push(p);return {status:204,type:'cors'};}});
 assert.equal(await x.sender.report({...event,name:'Private',ip:'192.0.2.7',workout:{rounds:12},message:'secret'}),true);
 await micro();
 assert.equal(x.sender.pending,0);
 assert.equal(calls.length,1);
 assert.equal(calls[0].mode,'cors');assert.equal(calls[0].credentials,'omit');
 assert.deepEqual(JSON.parse(calls[0].body),{...event,eventId:uuid(1)});
 assert(!calls[0].body.includes('Private'));
 assert(!calls[0].body.includes('rounds'));
 x.sender.dispose();
});

test('opaque no-cors response is NOT acknowledged',async()=>{
 const x=factory({transport:async()=>({type:'opaque',status:0})});
 await x.sender.report(event);await micro();
 assert.equal(x.sender.pending,1);
 assert.equal(JSON.parse(x.options.storage.all[0]).length,1);
 x.sender.dispose();
});

test('offline events retry with SAME ID and backoff after network recovers',async()=>{
 let ok=false;const sent=[];
 const x=factory({transport:async(_u,p)=>{sent.push(JSON.parse(p.body));if(!ok)throw Error('offline');return {status:204,type:'cors'};}});
 await x.sender.report(event);await micro();
 assert.equal(x.sender.pending,1);assert.equal(sent.length,1);
 await x.sender.flush();assert.equal(sent.length,1);
 ok=true;x.tick(30001);
 await x.sender.flush();assert.equal(x.sender.pending,0);
 assert.equal(sent.length,2);assert.equal(sent[0].eventId,sent[1].eventId);
 x.sender.dispose();
});

test('network hangs never block report() or timer',async()=>{
 const x=factory({transport:async()=>new Promise(()=>{})});
 const outcome=await Promise.race([
   x.sender.report(event),new Promise(resolve=>setImmediate(()=>resolve('blocked')))
 ]);
 assert.equal(outcome,true);x.sender.dispose();
});

test('maximum five pending errors, no workout/usage analytics',async()=>{
 const x=factory({transport:async()=>{throw Error('offline');}});
 assert.equal(await x.sender.report({...event,event:'workout_start'}),false);
 for(let i=0;i<12;i++)await x.sender.report(event);
 await micro();assert.equal(x.sender.pending,5);
 assert(JSON.stringify(x.options.storage.all).length<2048);
 x.sender.dispose();
});

test('storage failures fall back to bounded memory without UI error',async()=>{
 let attempts=0;
 const storage={getItem(){throw Error('denied');},setItem(){attempts++;throw Error('quota');}};
 const x=factory({storage,transport:async()=>{throw Error('offline');}});
 assert.equal(await x.sender.report(event),true);
 await micro();assert.equal(x.sender.pending,1);assert(attempts>=1);
 x.sender.dispose();
});

test('pending errors expire after 24 hours',async()=>{
 const x=factory({transport:async()=>{throw Error('offline');}});
 await x.sender.report(event);await micro();
 assert.equal(x.sender.pending,1);x.tick(86400001);
 assert.equal(x.sender.pending,0);x.sender.dispose();
});

test('four failed attempts maximum, then drop',async()=>{
 let count=0;
 const x=factory({transport:async()=>{count++;throw Error('offline');}});
 await x.sender.report(event);await micro();
 for(const delay of [30001,120001,600001]){
   x.tick(delay);await x.sender.flush();
 }
 assert.equal(count,4);assert.equal(x.sender.pending,0);x.sender.dispose();
});

test('online event honours backoff rather than flooding receiver',async()=>{
 let n=0;const x=factory({transport:async()=>{n++;throw Error('offline');}});
 await x.sender.report(event);await micro();
 x.target.listeners.get('online')();await micro();assert.equal(n,1);
 x.tick(30001);x.target.listeners.get('online')();await micro();
 assert.equal(n,2);x.sender.dispose();
});

test('invalid event IDs cannot become stable user/device IDs',async()=>{
 const x=factory({idFactory:()=> 'device-123'});
 assert.equal(await x.sender.report(event),false);
 assert.equal(x.sender.pending,0);x.sender.dispose();
});
