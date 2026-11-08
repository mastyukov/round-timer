import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticSender,attachBrowserErrorCapture} from '../diagnostics/sender.mjs';

test('no endpoint means no tracking or network access', async () => {
  let called = 0;
  const s = createDiagnosticSender({transport: async () => { called++; }});
  assert.equal(s.enabled,false);
  assert.equal(await s.report({event:'app_error'}),false);
  assert.equal(called,0);
});

test('HTTP endpoints are rejected for HTTPS-only PWA', async () => {
  const s = createDiagnosticSender({endpoint:'http://example.test/log',transport:async()=>{}});
  assert.equal(s.enabled,false);
  assert.equal(await s.report({event:'app_error'}),false);
});

test('only code-based technical errors go out; no PII or workout analytics', async () => {
  const calls=[];
  const s=createDiagnosticSender({endpoint:'https://log.example.test/receiver',transport:async (...args)=>{calls.push(args);}});
  assert.equal(await s.report({event:'workout_start',duration:120,personalName:'x'}),false);
  assert.equal(await s.report({event:'offline_fallback',status:'ok'}),false);
  assert.equal(await s.report({
    event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',
    version:'0.8.3',url:'https://secret.test/?token=123',
    email:'user@private.test',ip:'192.0.2.7',deviceId:'abc123',message:'raw personal info',
    time:Date.now(),stack:'private stack'
  }),true);
  assert.equal(calls.length,1);
  const [url,options]=calls[0];
  assert.equal(url,'https://log.example.test/receiver');
  assert.equal(options.credentials,'omit');
  assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{
    event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.3'
  });
  assert(!options.body.includes('private'));
  assert(!options.body.includes('192.0.2'));
  assert(!options.body.includes('workout'));
});

test('limited to five error submissions per active app session', async () => {
  let count=0;
  const s=createDiagnosticSender({endpoint:'https://test.example/',transport:async()=>{count++;}});
  for(let i=0;i<12;i++) await s.report({event:'app_error',code:'UNHANDLED_ERROR',component:'ui',version:'0.8.3'});
  assert.equal(count,5);
});

test('network errors do not throw or block the timer', async () => {
  const s=createDiagnosticSender({endpoint:'https://test.example/',transport:async()=>{throw Error('offline');}});
  assert.equal(await s.report({event:'app_error'}),false);
});

test('browser errors are captured without reading original messages or stack', async () => {
  const handlers=new Map(), events=[];
  const target={
    addEventListener(name,fn){handlers.set(name,fn);},
    removeEventListener(name){handlers.delete(name);}
  };
  const unsubscribe=attachBrowserErrorCapture({target,sender:{report(e){events.push(e);return Promise.resolve(true);}},version:'0.8.3'});
  handlers.get('error')({message:'secret',filename:'https://private/',error:{stack:'secret'}});
  handlers.get('unhandledrejection')({reason:{password:'secret'}});
  assert.equal(events.length,2);
  assert.deepEqual(Object.keys(events[0]),['event','code','component','version']);
  unsubscribe();
  assert.equal(handlers.size,0);
});
