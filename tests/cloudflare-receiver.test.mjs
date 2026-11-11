import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{extractError} from '../receiver/cloudflare-worker/src/index.mjs';

const eventId='11111111-1111-4111-8111-111111111111';
const event={event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.6'};
function receiver({
  origin='https://mastyukov.github.io', rateAllowed=true, kv=true,
  method='POST',path='/v1/error',throwKv=false
}={}){
  const stored=[],memory=new Map(),written=[];
  const env={
    ERROR_EVENTS:{writeDataPoint(x){stored.push(x);}},
    ERROR_RATE_LIMIT:{async limit({key}){
      assert.equal(key,'round-timer-technical-errors');return {success:rateAllowed};
    }},
    ...(kv?{ERROR_DEDUP_KV:{
      async get(key){if(throwKv)throw Error('unavailable');return memory.get(key)??null;},
      async put(key,v,opts){if(throwKv)throw Error('unavailable');memory.set(key,v);written.push({key,opts});}
    }}:{})
  };
  async function send(payload=event,options={}){
    const request=new Request('https://receiver.test'+path,{
      method,headers:{Origin:origin,'Content-Type':'text/plain;charset=UTF-8'},
      ...(method==='POST'?{body:JSON.stringify(payload)}:{})
    });
    const result=await worker.fetch(request,options.env||env);
    return result;
  }
  return {send,stored,memory,written,env};
}

test('legacy four-field clients still work, writing exactly four code dimensions',async()=>{
 const x=receiver();
 const reply=await x.send({...event,ip:'203.0.113.1',message:'secret',workout:{rounds:4}});
 assert.equal(reply.status,204);
 assert.deepEqual(x.stored,[{
   blobs:['audio_failure','AUDIO_PLAY_REJECTED','audio','0.8.6'],doubles:[1],indexes:['round-timer-errors']
 }]);
 assert.equal(reply.headers.get('Access-Control-Allow-Origin'),'https://mastyukov.github.io');
});

test('CORS 204 allows browser to distinguish receipt from opaque submission',async()=>{
 const x=receiver();const r=await x.send({...event,eventId});
 assert.equal(r.status,204);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://mastyukov.github.io');
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(x.written[0].opts.expirationTtl,86400);
 assert(!JSON.stringify(x.stored).includes(eventId));
});

test('sequential retry with same ephemeral event ID never double counts',async()=>{
 const x=receiver();
 assert.equal((await x.send({...event,eventId})).status,204);
 assert.equal((await x.send({...event,eventId})).status,204);
 assert.equal(x.stored.length,1);
 assert.equal(x.written.length,1);
});

test('random per-error IDs do not identify users or persist in Analytics Engine',async()=>{
 const x=receiver();const second='22222222-2222-4222-8222-222222222222';
 await x.send({...event,eventId});await x.send({...event,eventId:second});
 assert.equal(x.stored.length,2);
 assert(!JSON.stringify(x.stored).includes(eventId));
 assert(!JSON.stringify(x.stored).includes(second));
 assert.equal(x.memory.size,2);
});

test('missing KV fails closed for new queued events, legacy clients still work',async()=>{
 const x=receiver({kv:false});
 assert.equal((await x.send({...event,eventId})).status,503);
 assert.equal(x.stored.length,0);
 assert.equal((await x.send(event)).status,204);
 assert.equal(x.stored.length,1);
});

test('KV read failure fails closed; server gives no successful acknowledgment',async()=>{
 const x=receiver({throwKv:true});
 assert.equal((await x.send({...event,eventId})).status,503);
 assert.equal(x.stored.length,0);
});

test('disallowed origins, paths and unsupported methods are rejected',async()=>{
 assert.equal((await receiver({origin:'https://attacker.test'}).send()).status,403);
 assert.equal((await receiver({path:'/'}).send()).status,404);
 assert.equal((await receiver({method:'GET'}).send()).status,405);
 const options=await receiver({method:'OPTIONS'}).send();
 assert.equal(options.status,204);
 assert.equal(options.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');
});

test('usage events, invalid ID, invalid versions and oversized payload are rejected',async()=>{
 const x=receiver();
 for(const e of [
   {...event,event:'workout_start'},
   {...event,code:'custom text'},
   {...event,version:'private-device'},
   {...event,eventId:'not-a-random-uuid'},
   {...event,padding:'x'.repeat(600)}
 ]){
   const r=await x.send(e);assert([400,413].includes(r.status));
 }
 assert.equal(x.stored.length,0);
});

test('missing Analytics Engine or rate limiter rejects without storing',async()=>{
 const x=receiver(),e={...event,eventId};
 assert.equal((await x.send(e,{env:{ERROR_RATE_LIMIT:x.env.ERROR_RATE_LIMIT}})).status,503);
 assert.equal((await x.send(e,{env:{ERROR_EVENTS:x.env.ERROR_EVENTS,ERROR_DEDUP_KV:x.env.ERROR_DEDUP_KV}})).status,503);
 assert.equal(x.stored.length,0);
});

test('global anti-abuse quota rejects new events without accepting them',async()=>{
 const x=receiver({rateAllowed:false});
 assert.equal((await x.send({...event,eventId})).status,429);
 assert.equal(x.stored.length,0);
});

test('extractError projects four dimensions, only ephemeral optional ID',()=>{
 const x=extractError({...event,eventId,password:'private'});
 assert.deepEqual(x.dimensions,['audio_failure','AUDIO_PLAY_REJECTED','audio','0.8.6']);
 assert.equal(x.eventId,eventId);
 assert.equal(extractError({...event,event:'session_start'}),null);
 assert.equal(extractError({...event,eventId:'abc'}),null);
});


test('failed Analytics Engine write must NOT create a dedup key or false acknowledgement',async()=>{
 const x=receiver();let fail=true;
 const original=x.env.ERROR_EVENTS.writeDataPoint;
 x.env.ERROR_EVENTS.writeDataPoint=(v)=>{
   if(fail)throw new Error('synthetic Analytics Engine failure');
   original(v);
 };
 const first=await x.send({...event,eventId});
 assert.equal(first.status,503);
 assert.equal(x.stored.length,0);
 assert.equal(x.memory.size,0,'no stored error means no suppression key');
 fail=false;
 const retry=await x.send({...event,eventId});
 assert.equal(retry.status,204);
 assert.equal(x.stored.length,1);
 assert.equal(x.memory.size,1);
 const again=await x.send({...event,eventId});
 assert.equal(again.status,204);
 assert.equal(x.stored.length,1,'no duplicate after an acknowledged write');
});

test('KV commit failure never returns server receipt, even if Analytics Engine was called',async()=>{
 const x=receiver();
 x.env.ERROR_DEDUP_KV.put=async()=>{throw new Error('synthetic KV outage');};
 const r=await x.send({...event,eventId});
 assert.equal(r.status,503);
 assert.equal(x.memory.size,0);
 // A retry may recount in this partition (KV is not atomic with Analytics).
 // Never claim exactly-once behaviour for this failure mode.
 assert.equal(x.stored.length,1);
});
