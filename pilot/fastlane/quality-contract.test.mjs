import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=path=>new URL('../../'+path,import.meta.url);
const source=path=>readFileSync(f(path),'utf8');
test('offline cache includes local PWA sources and icons',()=>{
 const worker=source('site/sw.js');
 assert(worker.includes('round-timer-shell-v0.8.17'));
 const entries=['index.html','styles.css','app.mjs','engine.mjs','audio-guard.mjs',
  'html-audio.mjs','web-audio-retire.mjs','audio-duck.mjs','icons/icon-192.png',
  'icons/icon-512.png','sounds/studio-gong-start.mp3','sounds/studio-gong-end.mp3',
  'sounds/woodclack-single.mp3','sounds/woodclack-double.mp3','sounds/button.mp3'];
 for(const x of entries){
  assert(worker.includes("'./"+x+"'"),'missing cache entry '+x);
  assert(existsSync(f('site/'+x)),'missing local asset '+x);
 }
});
test('five studio MP3 originals are byte- and SHA256-identical',()=>{
 const m=JSON.parse(source('project/releases/v0.8.15-studio-audio-manifest.json'));
 assert.equal(m.files.length,5);
 for(const x of m.files){
  const data=readFileSync(f('site/sounds/'+x.name));
  assert.equal(data.byteLength,x.bytes,x.name+' size');
  assert.equal(createHash('sha256').update(data).digest('hex'),x.sha256,x.name+' hash');
 }
});
test('portrait and landscape clock and round label unchanged',()=>{
 const css=source('site/styles.css');
 assert(css.includes('transform:scale(1.51,4.05)'));
 assert(css.includes('transform:scale(2.23,1.79)'));
 assert(css.includes('transform:translateY(-.44em)'));
});
test('142ms clacks, approved button gain, cold gong and foreground recovery unchanged',()=>{
 const app=source('site/app.mjs'),html=source('site/index.html');
 assert(app.includes("type==='ten-double'?[0,.142]"));
 assert(app.includes("volume:kind==='button'?.5832:kind==='clack'?.96:.9"));
 assert(app.includes('delayedStartGong.schedule(ready,'));
 assert(app.includes('endWebBackgroundReturn()'));
 assert(app.includes('isCueFresh(ticks[0]*1000-cuePhase.remainingMs)'));
 assert(html.includes('ВЕРСИЯ · v0.8.17'));
});
