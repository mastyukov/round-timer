import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crossedCountdown} from '../site/engine.mjs';
import {createHtmlAudioController} from '../site/html-audio.mjs';
const source=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');
const p=(ms,type='work',durationMs=120000)=>({key:type+'-1',type,durationMs,remainingMs:ms});
test('RC12 requests work cues 700ms earlier, production stays unchanged',()=>{
 for(const sec of [60,30,10,5,4,3,2,1]){
   assert.deepEqual(crossedCountdown(p(sec*1000+750),p(sec*1000+650),700),[sec]);
   assert.deepEqual(crossedCountdown(p(sec*1000+750),p(sec*1000+650)),[]);
 }
});
test('RC12 no cue at 30s phase start, after background skips or mismatched phases',()=>{
 assert.deepEqual(crossedCountdown(p(30000,'work',30000),p(29900,'work',30000),700),[]);
 assert.deepEqual(crossedCountdown(p(35000),p(4000),700).length>1,true);
 assert.deepEqual(crossedCountdown(p(31500,'work'),p(30000,'rest'),700),[]);
});
test('RC12 HTML avoids seeking six inactive media resources on each short clack',()=>{
 const elements=[];
 const ctrl=createHtmlAudioController({
   makeAudio:src=>{
     const el={src,paused:true,currentTime:0,muted:false,stops:0,
       addEventListener(){},pause(){this.stops++;this.paused=true;},
       play(){this.paused=false;return Promise.resolve();}};
     elements.push(el);return el;
   },
   paths:{start:'start',end:'end',clack:'clack',double:'double',button:'button'},
   isActive:()=>true
 });
 ctrl.play('single');
 assert.equal(elements[0].stops,0);
 assert.equal(elements[1].stops,0);
 ctrl.play('single');
 assert.equal(elements[0].stops,0);
 assert.equal(elements[2].stops,1);
 ctrl.stopAll();
 assert.equal(elements[1].stops,0);
});
test('RC12 START avoids combining button knock with a training cue',()=>{
 const app=source('app.mjs');
 assert(app.includes('startupCuePlayed=config.prepare<=5'));
 assert(app.includes('return startupCuePlayed;'));
 assert(app.includes('if(!startPause())buttonSound()'));
 assert(app.includes('HTML_WORK_CUE_LEAD_MS=700'));
});
test('RC12 preserves studio assets, brighter work/rest and responsive scales',()=>{
 const app=source('app.mjs'),css=source('styles.css'),sw=source('sw.js');
 assert(app.includes("isPreview?1.26:1.2"));
 assert(app.includes("isPreview?4.10:4.3164"));
 assert(app.includes("isPreview?1.62:1.587"));
 assert(css.includes('transform:scale(1.26,4.10)'));
 assert(css.includes('transform:scale(1.62,1.62)'));
 assert(sw.includes('round-timer-shell-v0.8.8-audio-rc12'));
 for(const n of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button']){
   assert(sw.includes("'./sounds/"+n+".mp3'"));
 }
});
