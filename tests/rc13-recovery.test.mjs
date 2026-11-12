import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crossedCountdown,computePhase,normalizeConfig} from '../site/engine.mjs';
import {createHtmlAudioController} from '../site/html-audio.mjs';
const text=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');
const state=(ms,type='work',durationMs=120000)=>({key:type+'-1',type,durationMs,remainingMs:ms});
test('RC13 countdown 60,30,10,5,4,3,2,1 is requested at exact thresholds, no 700ms early drift',()=>{
 const numbers=[60,30,10,5,4,3,2,1];
 for(const sec of numbers){
  assert.deepEqual(crossedCountdown(state(sec*1000+100),state(sec*1000)),[sec]);
  assert.deepEqual(crossedCountdown(state(sec*1000+750),state(sec*1000+650)),[]);
 }
 assert.deepEqual(crossedCountdown(state(60000, 'work',60000),state(59900,'work',60000)),[]);
 assert.equal(normalizeConfig({work:60}).rest,0);
 assert.equal(computePhase({work:60,rest:0,rounds:3,prepare:0},60000).key,'work-2');
});
test('RC13 restores original HTML cue playback sequence, even after a gong',()=>{
 const elements=[];
 const ctrl=createHtmlAudioController({
   makeAudio:src=>{
     const el={src,currentTime:0,muted:false,paused:true,playCount:0,pauseCount:0,
       load(){},play(){this.paused=false;this.playCount++;return Promise.resolve();},
       pause(){this.paused=true;this.pauseCount++;}};
     elements.push(el);return el;
   },
   paths:{start:'start',end:'end',clack:'single',double:'double',button:'button'},
   isActive:()=>true,
 });
 for(const cue of ['start','single','ten-double','single','single','single','single','single','end'])ctrl.play(cue);
 assert.equal(elements[0].playCount,1);
 assert.equal(elements[2].playCount,6);
 assert.equal(elements[4].playCount,1);
 assert.equal(elements[1].playCount,1);
 assert(elements[0].pauseCount>0,'RC11 stop/reset used before each cue');
 ctrl.stopAll();
 assert(elements.every(e=>e.muted));
});
test('RC13 pause preserves pointerdown button click but Home silences every player',()=>{
 const elements=[];
 const ctrl=createHtmlAudioController({
   makeAudio:src=>{const e={src,muted:false,paused:true,currentTime:0,
     play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
     elements.push(e);return e;},
   paths:{start:'start',end:'end',clack:'single',double:'double',button:'button'},
   isActive:()=>true
 });
 assert.equal(ctrl.playButton(),true);
 ctrl.stopAll({includeButton:false});
 assert.equal(elements[5].paused,false,'PAUSE must not cut off the button click');
 ctrl.stopAll();
 assert.equal(elements[5].paused,true,'Home/background always stops the click');
});
test('RC13 open settings uses a real full-screen hit-test barrier and disables underlying controls',()=>{
 const html=text('index.html'),css=text('styles.css'),app=text('app.mjs');
 assert(html.includes('id="settingsBackdrop"'));
 assert(css.includes('.settings-backdrop {display:none;position:fixed;inset:0;z-index:90;'));
 assert(css.includes('pointer-events:auto'));
 assert(css.includes('body.settings-visible .settings-backdrop {display:block;}'));
 assert(css.includes('.settings[open] {position:fixed;z-index:100'));
 assert(app.includes("el.settings.open?' settings-visible':''"));
 assert(app.includes('el.start.disabled=!!el.settings.open'));
 assert(app.includes('el.reset.disabled=!!el.settings.open'));
 assert(app.includes('if(el.settings.open)return false'));
 assert(app.includes('if(el.settings.open)return;'));
});
test('RC13 button playback uses pointerdown with click-only keyboard fallback and no startup double sound',()=>{
 const app=text('app.mjs');
 assert(app.includes("target?.addEventListener('pointerdown'"));
 assert(app.includes("target?.addEventListener('click'"));
 assert(app.includes('const played=pressed;pressed=false;'));
 assert(app.includes('if(!skip&&!played)buttonSound()'));
 assert(app.includes('suppress:willStartCue'));
 assert(app.includes('stopActiveAudio({preserveButton:isPreview,preserveMix:keepForegroundMix()})'));
 assert(!app.includes('HTML_WORK_CUE_LEAD_MS=700'));
});
test('RC13 resets old test audio transport to HTML; music preference and user sound files unchanged',()=>{
 const app=text('app.mjs'),sw=text('sw.js');
 assert(app.includes("PREVIEW_AUDIO_KEY='round-timer-preview-transport-rc13-v1'"));
 assert(app.includes("PREVIEW_MUSIC_KEY='round-timer-preview-music-mix-v1'"));
 assert(app.includes("audioMode=localStorage.getItem(PREVIEW_AUDIO_KEY)==='web'?'web':'html'"));
 assert(sw.includes('round-timer-shell-v0.8.10-mix-rc14'));
 for(const name of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button']){
  assert(sw.includes("'./sounds/"+name+".mp3'"));
 }
});
