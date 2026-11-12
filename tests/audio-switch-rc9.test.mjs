import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');

test('RC9 audio engine select is enabled while running or paused, unlike workout presets',()=>{
 const app=src('app.mjs');
 assert(app.includes('if(audioModeSelect)audioModeSelect.disabled=false'));
 assert(app.includes("if(musicMixSelect)musicMixSelect.disabled=audioMode!=='html'||!sessionMix.supported"));
 assert(app.includes('if(locked&&el.settings.open&&!isPreview)'));
 assert(app.includes('Смена звука автоматически ставит таймер на паузу'));
});
test('RC9 selection pauses safely, saves time and updates the visible mode',()=>{
 const app=src('app.mjs');
 assert(app.includes('function pausePreviewForAudioChange()'));
 assert(app.includes("session.elapsedBeforeMs=elapsedNow()"));
 assert(app.includes("session.status='paused'"));
 assert(app.includes("releaseScreenOn()"));
 assert(app.includes('audioMode=select.value==='));
 assert(app.includes('draw({notify:false})'));
 assert(!app.includes("select.value=audioMode;return;"));
});
test('RC9 retains countdown, offline and privacy protections',()=>{
 const app=src('app.mjs'),sw=src('sw.js');
 assert(sw.includes('round-timer-shell-v0.8.10-mix-rc14'));
 assert(app.includes("sessionMix.begin()"));
 assert(app.includes("sessionMix.stop()"));
 assert(app.includes("cueLatencyLabel"));
 assert(app.includes("productionDiagnosticEndpoint("));
});
