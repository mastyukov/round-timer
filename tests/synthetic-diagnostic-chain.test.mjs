import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticSender} from '../site/diagnostics/sender.mjs';
import receiver from '../receiver/cloudflare-worker/src/index.mjs';

// Fully synthetic end-to-end transport. No Cloudflare APIs or public endpoints.
test('synthetic browser error -> mock Worker -> one aggregate, lost ACK -> retry without duplicate', async()=>{
  let clock=1700000000000;
  const storage=new Map(),backend=[],dedup=new Map();
  let transportCalls=0;
  const eventId='11111111-1111-4111-8111-111111111111';
  const env={
    ERROR_EVENTS:{writeDataPoint:entry=>backend.push(entry)},
    ERROR_RATE_LIMIT:{limit:async()=>({success:true})},
    ERROR_DEDUP_KV:{
      get:async key=>dedup.get(key)||null,
      put:async (key,value)=>{dedup.set(key,value);}
    }
  };
  const mockTransport=async(_url,options)=>{
    transportCalls++;
    const request=new Request('https://worker.invalid/v1/error',{
      method:'POST',
      headers:{Origin:'https://mastyukov.github.io','Content-Type':'text/plain;charset=UTF-8'},
      body:options.body
    });
    const response=await receiver.fetch(request,env);
    // Simulate successful receiver commit with lost or opaque client receipt.
    if(transportCalls===1)return {status:0,type:'opaque'};
    return {status:response.status,type:'cors'};
  };
  const sender=createDiagnosticSender({
    endpoint:'https://mock.invalid/v1/error',
    transport:mockTransport,
    storage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>storage.set(key,value)
    },
    now:()=>clock,
    idFactory:()=>eventId,
    timeout:()=>({unref(){}}),
    onlineTarget:{addEventListener(){},removeEventListener(){}}
  });
  try{
    assert.equal(await sender.report({
      event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',
      version:'0.8.6',
      username:'synthetic-private-name',workout:{rounds:12}
    }),true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sender.pending,1,'lost receipt must keep a pending event');
    assert.equal(backend.length,1,'receiver wrote one aggregate');
    assert.deepEqual(backend[0].blobs,
      ['audio_failure','AUDIO_PLAY_REJECTED','audio','0.8.6']);
    assert.equal(JSON.stringify(backend).includes(eventId),false);
    assert.equal(JSON.stringify(backend).includes('synthetic-private-name'),false);
    assert.equal(JSON.stringify(backend).includes('rounds'),false);
    clock+=30001;
    assert.equal(await sender.flush(),true,'second 204 acknowledges the retry');
    assert.equal(sender.pending,0);
    assert.equal(backend.length,1,'KV dedup suppressed sequential retry');
    assert.equal(dedup.size,1);
    assert.equal(transportCalls,2);
  } finally {sender.dispose();}
});
