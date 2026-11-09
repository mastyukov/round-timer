import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');
test('RC8 measures browser-side cue timing in the Settings test UI only',()=>{
 const app=src('app.mjs'),audio=src('html-audio.mjs');
 assert(app.includes('Первый щелчок:'));
 assert(app.includes("kind!=='clack1'"));
 assert(app.includes('cueLatencyLabel.hidden=audioMode'));
 assert(audio.includes('onTiming=()=>{}'));
 assert(audio.includes('element.load?.()'));
});
test('RC8 preserves working HTML mixing, pause and original clack asset',()=>{
 const app=src('app.mjs'),sw=src('sw.js');
 assert(app.includes('sessionMix.begin()'));
 assert(app.includes('sessionMix.stop()'));
 assert(sw.includes('./sounds/woodclack.mp3'));
 assert(sw.includes('round-timer-shell-v0.8.6-switch-rc9'));
});
