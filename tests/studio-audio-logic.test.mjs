import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig,crossedCountdown,computePhase} from '../site/engine.mjs';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
const state=(remaining,duration=120000,type='work')=>({
 type,key:type+'-1',durationMs:duration,remainingMs:remaining
});
test('RC11 defaults to zero seconds rest but respects explicit values',()=>{
 assert.equal(normalizeConfig({work:60}).rest,0);
 assert.equal(normalizeConfig({work:120,rest:30}).rest,30);
 assert.equal(computePhase({work:60,rounds:3,rest:0,prepare:0},60000).key,'work-2');
});
test('RC11 minute warning only in work rounds longer than one minute',()=>{
 assert.deepEqual(crossedCountdown(state(60100),state(60000)),[60]);
 assert.deepEqual(crossedCountdown(state(60000,60000),state(59900,60000)),[]);
 assert.deepEqual(crossedCountdown(state(60100,120000,'rest'),state(60000,120000,'rest')),[]);
});
test('RC11 30 and 5 to 1 thresholds remain one event each; ten is separate',()=>{
 for(const sec of [30,10,5,4,3,2,1]){
   assert.deepEqual(crossedCountdown(state(sec*1000+100),state(sec*1000)),[sec]);
 }
});
test('RC11 sound routing: 10 double, 30/60/5 to 1 single; legacy production unchanged',()=>{
 const app=file('app.mjs');
 assert(app.includes("ticks[0]===10?'ten-double':'single'"));
 assert(app.includes("(ticks[0]===30||ticks[0]===10)?'slow-double':'single'"));
 assert(app.includes("double:'./sounds/woodclack-double.mp3'"));
 assert(app.includes("clack:'./sounds/woodclack-single.mp3'"));
 assert(app.includes("button:'./sounds/button.mp3'"));
 assert(app.includes("const SOUND_PATHS=isPreview?"));
});
test('RC11 button clicks are separated from bells and use a dedicated player',()=>{
 const app=file('app.mjs'),html=file('html-audio.mjs');
 assert(app.includes('function buttonSound()'));
 assert(app.includes('startPause();buttonSound();'));
 assert(app.includes('reset();buttonSound();'));
 assert(app.includes("querySelector?.('summary')?.addEventListener('click',buttonSound)"));
 assert(html.includes('function playButton()'));
 assert(html.includes('stopAll({includeButton:false})'));
 assert(html.includes("type==='ten-double'&&elements.double"));
});
test('RC11 work and rest colors use the approved bright palette',()=>{
 const css=file('styles.css');
 assert(css.includes("--accent:#a7ff55; --background:#11220c"));
 assert(css.includes("--accent:#ff4255; --background:#2b0a10"));
});
test('RC11 offline service worker names all five original studio recordings',()=>{
 const sw=file('sw.js');
 assert(sw.includes('round-timer-shell-v0.8.7-studio-rc11'));
 for(const name of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button']){
   assert(sw.includes("'./sounds/"+name+".mp3'"),name);
 }
});
