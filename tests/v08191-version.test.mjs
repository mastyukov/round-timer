import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
test('visible build identity is unique and never confused with previous 0.8.19',()=>{
 const html=get('index.html');
 assert(html.includes('미하일 0.8.19.2</small>'));
 assert(!html.includes('미하일 0.8.19.1</small>'));
 assert(html.includes('name="round-timer-preview-build" content="v0.8.19.2"'));
});
test('offline worker increments cache identity while preserving offline strategy and app shell',()=>{
 const sw=get('sw.js');
 assert(sw.includes("round-timer-shell-v0.8.19.2"));
 assert(!sw.includes("const CACHE_NAME = 'round-timer-shell-v0.8.19-test-r478'"));
 assert(sw.includes("const local = await cache.match(event.request)"));
 assert(sw.includes("const offlinePage = await cache.match('./')"));
 assert(sw.includes("'./audio-clock-watchdog.mjs'"));
});
test('audio stays 478ms; first tap preparation and correct release metadata',()=>{
 const app=get('app.mjs'),htmlAudio=get('html-audio.mjs');
 assert(app.includes("type==='ten-double'?[0,.478]"));
 assert(htmlAudio.includes("playElement(elements.clack2,token,'clack2');},478);"));
 assert(app.includes("volume:kind==='button'?.1944:kind==='clack'?.96:.9"));
 assert(app.includes("DIAGNOSTICS_VERSION='0.8.19.2'"));
});
