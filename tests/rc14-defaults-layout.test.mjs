import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeConfig,totalDurationMs,computePhase} from '../site/engine.mjs';
const file=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
test('RC14 new defaults: work 120s, 3 rounds, rest 30s, preparation 0s',()=>{
 const c=normalizeConfig();
 assert.deepEqual(c,{work:120,rest:30,rounds:3,prepare:0});
 assert.equal(totalDurationMs(c),420000);
 assert.equal(computePhase(c,0).type,'work');
 assert.equal(computePhase(c,120000).type,'rest');
 assert.equal(computePhase(c,150000).round,2);
});
test('RC14 explicit zero rest and nonzero preparation remain selectable',()=>{
 const c=normalizeConfig({work:60,rest:0,prepare:5,rounds:3});
 assert.equal(c.rest,0);assert.equal(c.prepare,5);
 assert.equal(computePhase(c,0).type,'prepare');
 assert.equal(computePhase(c,65000).key,'work-2');
});
test('RC14 portrait and landscape digits grow slightly without removing responsive size limits',()=>{
 const app=file('app.mjs'),css=file('styles.css');
 assert(app.includes('isPreview?1.30:1.2'));
 assert(app.includes('isPreview?4.17:4.3164'));
 assert(app.includes('isPreview?1.67:1.587'));
 assert(app.includes('isPreview?1.015:.98'));
 assert(app.includes('isPreview?.985:.95'));
 assert(app.includes('Math.min(byWidth,byHeight,620)'));
 assert(css.includes('transform:scale(1.30,4.17)'));
 assert(css.includes('transform:scale(1.67,1.67)'));
 assert(css.includes('html,body { margin:0; height:100%; width:100%; overflow:hidden; }'));
});
test('RC14 round counter grows in both orientations and remains width-clamped',()=>{
 const app=file('app.mjs');
 assert(app.includes('isPreview?.101:.09'));
 assert(app.includes('isPreview?.082:.07'));
 assert(app.includes('if(w>max)size*=max/w;'));
 assert(app.includes('label.style.fontSize='));
});
test('RC14 preserves independently approved studio audio, work/rest colors and music fix',()=>{
 const app=file('app.mjs'),css=file('styles.css'),sw=file('sw.js');
 assert(app.includes('preserveMix:keepForegroundMix()'));
 assert(css.includes('body.phase-work { --accent:#a7ff55'));
 assert(css.includes('body.phase-rest { --accent:#ff4255'));
 assert(sw.includes('round-timer-shell-v0.8.10-mix-rc14'));
 for(const name of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button']){
   assert(sw.includes("'./sounds/"+name+".mp3'"));
 }
});
