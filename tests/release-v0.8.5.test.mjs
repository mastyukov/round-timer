import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDiagnosticSender} from '../site/diagnostics/sender.mjs';

const bytes=p=>readFileSync(new URL('../site/'+p, import.meta.url));
const txt=p=>bytes(p).toString('utf8');
const sha=p=>createHash('sha256').update(bytes(p)).digest('hex');

test('Approved timer engine, CSS, icons and sounds are byte-identical',()=>{
  const unchanged={
    'engine.mjs':'1f99d689ad8894bc89ab591b4447e1336dc2b5faf97781ad4e40abd0058416c8',
    'styles.css':'5ac2df0416beab144424a91d638266acf800b2ea5808076b91374799f3009a0a',
    'sounds/gong-start.mp3':'b440d5440f2d104d15ac3e0553366e7bf0db13014599d14e5e8b94b3744a4333',
    'sounds/gong-end.mp3':'13c66a498dfae6921fe77343550f29b06c4470e04e5c7373629f0639096e43d7',
    'sounds/woodclack.mp3':'7bbc5e40111dbb7d61d50a7984cccc25bdc55c37ab1c056d5b18c6ae7147aa71',
    'icons/apple-touch-icon.png':'f1d99987b223a62ed42925b34b4789d9901a6f358195bc7abf71c11efd81cc96',
    'icons/icon-192.png':'2b457b5b9d577dc69ed3564c740877259945618f3a287273dabda84b808ede00',
    'icons/icon-512.png':'b1ace2364d256b74d01113dfdf1b5fc9bcf69e7f5dab7c2ea8633a5686b994f3'
  };
  for (const [name,hash] of Object.entries(unchanged)) assert.equal(sha(name),hash,name);
});
test('Release shows one-minute default and correct iOS home title',()=>{
  assert.match(txt('app.mjs'),/let config=normalizeConfig\(\{work:60\}\)/);
  const html=txt('index.html'),manifest=JSON.parse(txt('manifest.webmanifest'));
  assert(html.includes('content="Раунд таймер"'));
  assert(html.includes('aria-live="off">01:00'));
  assert.equal(manifest.name,'Раунд таймер');
  assert.equal(manifest.short_name,'Раунд таймер');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
});
test('Release contains no synthetic diagnostic test entrypoint or tracking',()=>{
  const app=txt('app.mjs');
  assert(!app.includes('diag_test'));
  assert(!app.includes('session_start'));
  assert(!app.includes('workout_start'));
  assert(!app.includes('workout_complete'));
  assert(app.includes("attachBrowserErrorCapture"));
  assert(app.includes('audio_failure'));
  const html=txt('index.html');
  assert(!html.includes('id="diagnostic'));
  assert(!html.includes('type="checkbox"'));
});
test('Service worker caches all app, diagnostic and privacy assets offline',()=>{
  const sw=txt('sw.js');
  assert(sw.includes('round-timer-shell-v0.8.6-retire-rc10'));
  assert(!sw.includes('0.8.5-test'));
  for(const path of ['audio-guard.mjs','diagnostics/sender.mjs','diagnostics/schema.mjs','privacy.html','sounds/gong-start.mp3','sounds/gong-end.mp3']){
    assert(sw.includes('./'+path),path);
  }
  assert(txt('index.html').includes('href="./privacy.html"'));
});
test('Error reports cannot transmit private or workout fields',async()=>{
  let args;
  const send=createDiagnosticSender({
    endpoint:'https://round-timer-error-receiver.mastyukov.workers.dev/v1/error',
    transport:async(...items)=>{args=items;return {status:204,type:'cors'};},
    idFactory:()=> '11111111-1111-4111-8111-111111111111'
  });
  assert.equal(await send.report({event:'workout_start',rounds:20,version:'0.8.5'}),false);
  assert.equal(await send.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.5',name:'Secret',ip:'192.0.2.3',stack:'secret text'}),true);
  assert.deepEqual(JSON.parse(args[1].body),{event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:'0.8.5',eventId:'11111111-1111-4111-8111-111111111111'});
  assert.equal(args[1].credentials,'omit');
  assert(!args[1].body.includes('Secret'));
});
test('No server/network does not block or throw in timer',async()=>{
  const sender=createDiagnosticSender({endpoint:'https://invalid.example.test/err',transport:async()=>{throw Error('offline')},idFactory:()=> '22222222-2222-4222-8222-222222222222'});
  assert.equal(await sender.report({event:'app_error',code:'UNKNOWN',component:'ui',version:'0.8.5'}),true); // queued, not acknowledged
  assert.equal(sender.pending,1);
});
