import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHtmlAudioController} from '../site/html-audio.mjs';
const read=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
test('ten-second rhythm is exactly 478ms in Web Audio and HTML fallback',()=>{
 const app=read('app.mjs');
 assert(app.includes("type==='ten-double'?[0,.478]"));
 assert(app.includes("type==='slow-double'?[0,.25]"));
 assert(app.includes("type==='double'?[0,.155]"));
 const schedule=[];
 const play=[];
 const makeAudio=name=>({paused:true,currentTime:0,load(){},pause(){this.paused=true;},play(){this.paused=false;play.push(name);return Promise.resolve();}});
 const controller=createHtmlAudioController({
  makeAudio,
  paths:{start:'start',end:'end',clack:'clack',double:'double',button:'button'},
  isActive:()=>true,
  schedule:(fn,ms)=>{schedule.push({fn,ms});return schedule.at(-1);},
  unschedule:()=>{}
 });
 controller.play('ten-double');
 assert.deepEqual(play,['clack']);
 assert.equal(schedule.length,1);
 assert.equal(schedule[0].ms,478);
 schedule[0].fn();
 assert.deepEqual(play,['clack','clack']);
});
test('other sounds, user-visible version and approved WebAudio button volume unchanged',()=>{
 const app=read('app.mjs'),fallback=read('html-audio.mjs'),index=read('index.html'),sw=read('sw.js');
 assert(app.includes("volume:kind==='button'?.1944:kind==='clack'?.96:.9"));
 assert(fallback.includes("type==='slow-double'?250:145"));
 assert(index.includes('미하일 0.8.19.2'));
 assert(sw.includes("round-timer-shell-v0.8.19.2"));
 assert(sw.includes("'./sounds/woodclack-single.mp3'"));
 assert(sw.includes("'./audio-clock-watchdog.mjs'"));
});
test('reference-based update leaves frozen-clock recovery and delayed initial gong intact',()=>{
 const app=read('app.mjs');
 assert(app.includes('audioClockWatchdog.sample()'));
 assert(app.includes('pulseStalledContext(ctx,'));
 assert(app.includes('delayedStartGong.schedule(ready,'));
});
