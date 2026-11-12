import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crossedCountdown} from '../site/engine.mjs';
import {createHtmlAudioController} from '../site/html-audio.mjs';
const source=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');
const p=(ms,type='work',durationMs=120000)=>({key:type+'-1',type,durationMs,remainingMs:ms});
test('RC13 disables failed RC12 advance; work thresholds are exactly 60/30/10/5..1',()=>{
 for(const sec of [60,30,10,5,4,3,2,1]){
  assert.deepEqual(crossedCountdown(p(sec*1000+100),p(sec*1000)),[sec]);
  assert.deepEqual(crossedCountdown(p(sec*1000+750),p(sec*1000+650)),[]);
 }
});
test('RC13 does not replay missed warnings or play an initial 30s clack',()=>{
 assert.deepEqual(crossedCountdown(p(30000,'work',30000),p(29900,'work',30000)),[]);
 assert(crossedCountdown(p(35000),p(4000)).length>1);
 assert.deepEqual(crossedCountdown(p(31500,'work'),p(30000,'rest')),[]);
});
test('RC13 restores RC11 HTML element reset before repeated automatic cues',()=>{
 const items=[];
 const output=createHtmlAudioController({
  makeAudio:name=>{const el={name,paused:true,muted:false,currentTime:0,pauses:0,plays:0,
   pause(){this.pauses++;this.paused=true;},
   play(){this.plays++;this.paused=false;return Promise.resolve();}};
   items.push(el);return el;},
  paths:{start:'start',end:'end',clack:'clack',double:'double',button:'button'},
  isActive:()=>true
 });
 output.play('start');output.play('single');output.play('ten-double');output.play('single');
 assert.equal(items[0].plays,1);assert(items[0].pauses>=3);
 assert.equal(items[2].plays,2);assert.equal(items[4].plays,1);
});
test('RC13 START keeps training cue priority and pointerdown first for button click',()=>{
 const app=source('app.mjs');
 assert(app.includes('startupCuePlayed=config.prepare<=5'));
 assert(app.includes("bindFastPress(el.start,()=>startPause()"));
 assert(app.includes('suppress:willStartCue'));
 assert(app.includes("target?.addEventListener('pointerdown'"));
 assert(!app.includes('HTML_WORK_CUE_LEAD_MS=700'));
});
test('RC13 layout retains approved RC12 orientation and original five studio recordings',()=>{
 const app=source('app.mjs'),css=source('styles.css'),sw=source('sw.js');
 assert(app.includes('isPreview?1.30:1.2'));
 assert(app.includes('isPreview?4.17:4.3164'));
 assert(app.includes('isPreview?1.67:1.587'));
 assert(css.includes('transform:scale(1.30,4.17)'));
 assert(css.includes('transform:scale(1.67,1.67)'));
 assert(sw.includes('round-timer-shell-v0.8.10-mix-rc14'));
 for(const n of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button'])
  assert(sw.includes("'./sounds/"+n+".mp3'"));
});
