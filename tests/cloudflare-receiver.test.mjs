import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{extractError} from '../receiver/cloudflare-worker/src/index.mjs';

function probe({payload,origin='https://mastyukov.github.io',path='/v1/error',method='POST',rateAllowed=true}={}){
  const stored=[];
  const request=new Request('https://round-timer-error-receiver.test'+path,{
    method,headers:{Origin:origin,'Content-Type':'text/plain;charset=UTF-8'},
    ...(method==='POST'?{body:JSON.stringify(payload??{})}:{})
  });
  const env={
    ERROR_EVENTS:{writeDataPoint(p){stored.push(p);}},
    ERROR_RATE_LIMIT:{async limit({key}) {
      assert.equal(key,'round-timer-technical-errors');
      return {success:rateAllowed};
    }}
  };
  return worker.fetch(request,env).then(r=>({status:r.status,stored}));
}

test('worker stores only four fixed error dimensions',async()=>{
  const {status,stored}=await probe({payload:{
    event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.3',
    ip:'203.0.113.5',user:'private',message:'secret',url:'https://private/?id=abc',
    workout:{rounds:3}
  }});
  assert.equal(status,204);
  assert.deepEqual(stored,[{blobs:['audio_failure','AUDIO_PLAY_REJECTED','audio','0.8.3'],doubles:[1],indexes:['round-timer-errors']}]);
  assert(!JSON.stringify(stored).includes('private'));
});

test('worker refuses non-approved origins and wrong paths',async()=>{
  assert.equal((await probe({origin:'https://attacker.invalid'})).status,403);
  assert.equal((await probe({path:'/'})).status,404);
  assert.equal((await probe({method:'GET'})).status,405);
});

test('worker refuses usage statistics and arbitrary text errors',async()=>{
  const bad=[
    {event:'workout_start',code:'UNKNOWN',component:'other',version:'0.8.3'},
    {event:'app_error',code:'raw stack',component:'ui',version:'0.8.3'},
    {event:'app_error',code:'UNKNOWN',component:'ui',version:'browser id 17'},
  ];
  for(const payload of bad) {
    const {status,stored}=await probe({payload});
    assert.equal(status,400);
    assert.equal(stored.length,0);
  }
});

test('worker rejects oversized requests',async()=>{
  const {status,stored}=await probe({payload:{
    event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.3',
    padding:'not needed'.repeat(100)
  }});
  assert.equal(status,413);
  assert.equal(stored.length,0);
});

test('worker does not store anything when analytics binding is missing',async()=>{
  const request=new Request('https://test.invalid/v1/error',{method:'POST',headers:{Origin:'https://mastyukov.github.io'},body:JSON.stringify({event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.3'})});
  const r=await worker.fetch(request,{});
  assert.equal(r.status,503);
});

test('extractError never returns request headers or unknown fields',()=>{
  assert.equal(extractError({event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.3',name:'private'}).length,4);
  assert.equal(extractError({event:'session_start',code:'UNKNOWN',component:'ui',version:'0.8.3'}),null);
});

test('Global anti-abuse limit rejects excess traffic without storing a point', async()=>{
  const {status,stored}=await probe({payload:{event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.5'},rateAllowed:false});
  assert.equal(status,429);
  assert.equal(stored.length,0);
});
test('Fail closed when rate-limit binding is missing',async()=>{
  let stored=0;
  const r=await worker.fetch(new Request('https://test.invalid/v1/error',{
    method:'POST',headers:{Origin:'https://mastyuk.github.io'},body:JSON.stringify({event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.5'})
  }),{ERROR_EVENTS:{writeDataPoint(){stored++;}}});
  assert.equal(r.status,403);
  assert.equal(stored,0);
  const acceptedOrigin=await worker.fetch(new Request('https://test.invalid/v1/error',{
    method:'POST',headers:{Origin:'https://mastyukov.github.io'},body:JSON.stringify({event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.5'})
  }),{ERROR_EVENTS:{writeDataPoint(){stored++;}}});
  assert.equal(acceptedOrigin.status,503);
  assert.equal(stored,0);
});
