import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createHtmlAudioController} from '../site/html-audio.mjs';
import {productionDiagnosticEndpoint} from '../site/diagnostics/sender.mjs';
import {normalizeConfig,formatTime} from '../site/engine.mjs';
const bytes=p=>readFileSync(new URL('../site/'+p,import.meta.url));
const source=p=>bytes(p).toString('utf8');
const digest=p=>createHash('sha256').update(bytes(p)).digest('hex');
const release=JSON.parse(readFileSync(new URL('../project/releases/v0.8.15-studio-audio-manifest.json',import.meta.url),'utf8'));
test('Original five user-approved studio MP3 files are byte-identical',()=>{
 assert.equal(release.status,'VERIFIED_SHA256');
 assert.equal(release.files.length,5);
 for(const f of release.files){
  assert.equal(bytes('sounds/'+f.name).length,f.bytes,f.name+' size');
  assert.equal(digest('sounds/'+f.name),f.sha256,f.name+' sha256');
 }
});
test('Three legacy audio tracks and installed iPhone icons are preserved',()=>{
 const immutable={
  'sounds/gong-start.mp3':'b440d5440f2d104d15ac3e0553366e7bf0db13014599d14e5e8b94b3744a4333',
  'sounds/gong-end.mp3':'13c66a498dfae6921fe77343550f29b06c4470e04e5c7373629f0639096e43d7',
  'sounds/woodclack.mp3':'7bbc5e40111dbb7d61d50a7984cccc25bdc55c37ab1c056d5b18c6ae7147aa71',
  'icons/apple-touch-icon.png':'f1d99987b223a62ed42925b34b4789d9901a6f358195bc7abf71c11efd81cc96',
  'icons/icon-192.png':'2b457b5b9d577dc69ed3564c740877259945618f3a287273dabda84b808ede00',
  'icons/icon-512.png':'b1ace2364d256b74d01113dfdf1b5fc9bcf69e7f5dab7c2ea8633a5686b994f3'
 };
 for(const [f,hash] of Object.entries(immutable))assert.equal(digest(f),hash,f);
});
test('Approved production visual and WebAudio behavior remains intact in v0.8.16',()=>{
 const app=source('app.mjs'),css=source('styles.css'),html=source('index.html');
 assert(app.includes('const isPreview=true;'),'release must enable accepted RC19 on production origin');
 assert(app.includes('const AUDIO_QA_CONTROLS=false;'),'audio debugging controls remain disabled');
 assert(app.includes("let audioMode='web';"));
 assert(app.includes("type==='ten-double'?[0,.142]"));
 assert(app.includes("volume:kind==='button'?.648:kind==='clack'?.96:.9"));
 assert(app.includes('isPreview?1.51:1.2'));
 assert(app.includes('isPreview?2.23:1.587'));
 assert(app.includes('isPreview?.965:.98'));
 assert(css.includes('transform:scale(1.51,4.05)'));
 assert(css.includes('transform:scale(2.23,1.79)'));
 assert(css.includes('transform:translateY(-.44em)'));
 assert(html.includes('id="roundCurrent">1'));
 assert(html.includes('id="roundTotal">3'));
 assert(html.includes('class="round-slash"'));
});
test('Ten-second double-clack consists of two approved single hits separated by 142 ms',()=>{
 const played=[],tasks=[];
 const ctrl=createHtmlAudioController({
  makeAudio:name=>({paused:true,currentTime:0,load(){},pause(){this.paused=true;},play(){this.paused=false;played.push(name);return Promise.resolve();}}),
  paths:{start:'start',end:'end',clack:'single',double:'double',button:'button'},isActive:()=>true,
  schedule:(fn,ms)=>{tasks.push({fn,ms});return tasks[tasks.length-1];},unschedule:()=>{}
 });
 ctrl.play('ten-double');
 assert.equal(tasks.length,1);assert.equal(tasks[0].ms,142);assert.deepEqual(played,['single']);
 tasks[0].fn();assert.deepEqual(played,['single','single']);
});
test('One-minute default, Russian PWA title, and stable release version visible',()=>{
 const html=source('index.html'),manifest=JSON.parse(source('manifest.webmanifest')),app=source('app.mjs');
 assert(app.includes('let config=normalizeConfig({work:60})'));
 assert.equal(normalizeConfig({work:60}).prepare,0);
 assert.equal(normalizeConfig({work:60}).rest,30);
 assert.equal(formatTime(60000),'01:00');
 assert(html.includes('aria-live="off">01:00'));
 assert(html.includes('name="round-timer-version" content="v0.8.16"'));
 assert(html.includes('ВЕРСИЯ · v0.8.16'));
 assert(!html.includes('ТЕСТОВАЯ ВЕРСИЯ'));
 assert.equal(manifest.name,'Раунд таймер');
 assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
});
test('PWA service worker precaches every required approved production asset',()=>{
 const sw=source('sw.js');
 assert(sw.includes("round-timer-shell-v0.8.16"));
 for(const p of ['index.html','styles.css','app.mjs','engine.mjs','audio-guard.mjs','audio-duck.mjs',
   'html-audio.mjs','web-audio-retire.mjs','diagnostics/sender.mjs','diagnostics/schema.mjs',
   'privacy.html','sounds/studio-gong-start.mp3','sounds/studio-gong-end.mp3',
   'sounds/woodclack-single.mp3','sounds/woodclack-double.mp3','sounds/button.mp3']){
  assert(sw.includes("'./"+p+"'"),'missing offline '+p);
 }
 assert(!sw.includes('v0.8.16-rc20'));
});
test('Production-only error endpoint cannot be called from preview origins',()=>{
 const endpoint='https://round-timer-error-receiver.mastyukov.workers.dev/v1/error';
 assert.equal(productionDiagnosticEndpoint({origin:'https://mastyukov.github.io',pathname:'/round-timer/'},endpoint),endpoint);
 assert.equal(productionDiagnosticEndpoint({origin:'https://mastyukov-cyber.github.io',pathname:'/round-timer-pages-test/'},endpoint),'');
 assert.equal(productionDiagnosticEndpoint({origin:'https://untrusted.example',pathname:'/round-timer/'},endpoint),'');
 assert(!source('app.mjs').includes('diag_test'));
 assert(!source('app.mjs').includes('session_start'));
 assert(!source('app.mjs').includes('workout_start'));
 assert(source('privacy.html').includes('24 часов'));
});
test('Settings backdrop prevents accidental timer button actions while settings are open',()=>{
 const app=source('app.mjs'),css=source('styles.css'),html=source('index.html');
 assert(html.includes('id="settingsBackdrop"'));
 assert(app.includes('el.start.disabled=!!el.settings.open'));
 assert(app.includes('el.reset.disabled=!!el.settings.open'));
 assert(css.includes('body.settings-visible .settings-backdrop'));
});

test('Cold-start gong, background restoration and optional recovery UI are shipped',()=>{
 const app=source('app.mjs'),html=source('index.html'),css=source('styles.css');
 assert(app.includes('delayedStartGong.schedule(ready,'));
 assert(app.includes('elapsedNow()<=3000'));
 assert(app.includes('if(web)webWasInterrupted=true;'));
 assert(app.includes('const resume=context.state==='));
 assert(app.includes("window.addEventListener('focus',endWebBackgroundReturn)"));
 assert(app.includes("el.audioRecover?.addEventListener('click'"));
 assert(html.includes('id="audioRecoveryButton"'));
 assert(css.includes('.audio-recovery[hidden]'));
});
