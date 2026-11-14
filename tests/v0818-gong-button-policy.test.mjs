import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {computePhase,cueForPhaseTransition} from '../site/engine.mjs';
import {createHtmlAudioController} from '../site/html-audio.mjs';
const src=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
test('intermediate 1/3 and 2/3 single gong, last 3/3 final triple sample',()=>{
 const c={work:60,rest:30,rounds:3,prepare:0};
 assert.equal(cueForPhaseTransition(computePhase(c,60001)),'start');
 assert.equal(cueForPhaseTransition(computePhase(c,150001)),'start');
 assert.equal(cueForPhaseTransition(computePhase(c,240001)),'end');
});
test('one-round, zero-rest, infinite and preparation phases',()=>{
 assert.equal(cueForPhaseTransition(computePhase({work:60,rest:30,rounds:1,prepare:0},60001)),'end');
 assert.equal(cueForPhaseTransition(computePhase({work:30,rest:0,rounds:2,prepare:0},30001)),'start');
 assert.equal(cueForPhaseTransition(computePhase({work:30,rest:0,rounds:2,prepare:0},60001)),'end');
 assert.equal(cueForPhaseTransition(computePhase({work:30,rest:15,rounds:'infinity',prepare:0},30001)),'start');
 assert.equal(cueForPhaseTransition({type:'prepare'}),null);
});
test('app routes rest to start sample and done to original end sample',()=>{
 const app=src('app.mjs');
 assert(app.includes("start:'./sounds/studio-gong-start.mp3'"));
 assert(app.includes("end:'./sounds/studio-gong-end.mp3'"));
 assert(app.includes('const cue=cueForPhaseTransition(phase);'));
 assert(app.includes('if(cue)sound(cue);'));
 assert(!app.includes("else if(phase.type==='rest')sound('end')"));
});
test('two single wooden clacks have 145ms spacing in both engines',()=>{
 const tasks=[],hits=[];
 const a=createHtmlAudioController({
  makeAudio:n=>({paused:true,currentTime:0,load(){},pause(){this.paused=true;},play(){this.paused=false;hits.push(n);return Promise.resolve();}}),
  paths:{start:'start',end:'end',clack:'single',double:'double',button:'button'},
  isActive:()=>true,schedule:(fn,ms)=>{tasks.push({fn,ms});return tasks.at(-1);},unschedule:()=>{}
 });
 a.play('ten-double');
 assert.deepEqual(hits,['single']);
 assert.equal(tasks[0].ms,145);
 tasks[0].fn();
 assert.deepEqual(hits,['single','single']);
 assert(src('app.mjs').includes("type==='ten-double'?[0,.145]"));
});
test('button gain equals 30% of original 0.72; other sample gains unchanged',()=>{
 const app=src('app.mjs'),gain=.216;
 assert(Math.abs(gain/.72-.30)<1e-12);
 assert(app.includes("volume:kind==='button'?.216:kind==='clack'?.96:.9"));
});
test('Korean text precedes version; offline shell and round layout retained',()=>{
 const html=src('index.html'),sw=src('sw.js');
 assert(html.includes('미하일 ВЕРСИЯ · v0.8.18'));
 assert(html.includes('name="round-timer-version" content="v0.8.18"'));
 assert(sw.includes('round-timer-shell-v0.8.18'));
 assert(html.includes('id="roundCurrent">1'));
});
test('intermittent iOS background sound issue remains protected but not claimed fixed',()=>{
 const app=src('app.mjs');
 assert(app.includes('function endWebBackgroundReturn()'));
 assert(app.includes('isCueFresh(ticks[0]*1000-cuePhase.remainingMs)'));
 assert(app.includes('delayedStartGong.schedule(ready,'));
});
test('original 5 studio MP3 byte lengths and SHA256 unchanged',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../project/releases/v0.8.15-studio-audio-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.files.length,5);
 for(const f of manifest.files){
  const bytes=readFileSync(new URL('../site/sounds/'+f.name,import.meta.url));
  assert.equal(bytes.length,f.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);
 }
});
