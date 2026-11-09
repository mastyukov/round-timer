import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');

test('music setting truthfully describes real iPhone mixing behavior',()=>{
 const app=src('app.mjs');
 assert(app.includes('МУЗЫКА ПРИ СИГНАЛАХ · RC7'));
 assert(app.includes('ВКЛ · совместный режим на весь раунд'));
 assert(app.includes('ВЫКЛ · музыка может прерваться'));
 assert(!app.includes('цель ≈50%'));
 assert(!app.includes('ПРИГЛУШАТЬ МУЗЫКУ'));
});
test('RC6 preview defaults reset to HTML Audio and music coexistence ON',()=>{
 const app=src('app.mjs');
 assert(app.includes("PREVIEW_AUDIO_KEY='round-timer-preview-transport-v2'"));
 assert(app.includes("PREVIEW_MUSIC_KEY='round-timer-preview-music-mix-v1'"));
 assert(app.includes("let musicMixEnabled=isPreview"));
 assert(app.includes("audioMode=localStorage.getItem(PREVIEW_AUDIO_KEY)==='web'?'web':'html'"));
 assert(app.includes("musicMixEnabled=localStorage.getItem(PREVIEW_MUSIC_KEY)!=='off'"));
});
test('transient session requests isolated to test HTML Audio; Web Audio unaffected',()=>{
 const app=src('app.mjs');
 assert(app.includes("isPreview&&audioMode==='html'&&musicMixEnabled"));
 assert(app.includes("label.hidden=audioMode!=='html'"));
 const webBranch=app.slice(app.indexOf("const kind=type==="),app.indexOf("const offsets=type==="));
 assert(!webBranch.includes('sessionMix.cue'));
 assert(app.includes('sessionMix.stop()'));
});
test('offline cache includes both transports and all original audible cues',()=>{
 const sw=src('sw.js');
 assert(sw.includes('round-timer-shell-v0.8.6-retire-rc10'));
 for(const name of ['audio-duck.mjs','audio-guard.mjs','html-audio.mjs','app.mjs','sounds/gong-start.mp3','sounds/gong-end.mp3','sounds/woodclack.mp3']){
   assert(sw.includes("'./"+name+"'"),name);
 }
});

test('RC7 HTML Audio holds music session, avoids a per-cue reset',()=>{
 const app=src('app.mjs');
 const mode=src('audio-duck.mjs');
 assert(app.includes('sessionMix.begin(); // Hold until PAUSE/RESET/HOME'));
 assert(!app.includes('sessionMix.cue('));
 assert(app.includes('sessionMix.stop()'));
 assert(mode.includes('function begin()'));
 assert(mode.includes('return Object.freeze({supported,begin,cue,stop})'));
 assert(!app.includes('цель ≈50%'));
});
