import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAudioClockWatchdog,pulseStalledContext} from '../site/audio-clock-watchdog.mjs';
const source=path=>readFileSync(new URL('../site/'+path,import.meta.url),'utf8');

test('clock normally advances: no false alarm across 30s, 10s, 5s, 1s',()=>{
 let wall=0,t=70,alarms=0,eligible=true,ctx={state:'running',get currentTime(){return t;}};
 const w=createAudioClockWatchdog({getContext:()=>ctx,isEligible:()=>eligible,onStall:()=>alarms++,now:()=>wall});
 assert.equal(w.sample(),'baseline');
 for(let i=1;i<=150;i++){wall=i*250;t+=.25;assert.equal(w.sample(),'advancing');}
 assert.equal(alarms,0);
});
test('running + frozen currentTime at 1600ms fires exactly once per foreground epoch',()=>{
 let wall=0,alarms=0,ctx={state:'running',currentTime:943.949};
 const w=createAudioClockWatchdog({getContext:()=>ctx,isEligible:()=>true,onStall:()=>alarms++,now:()=>wall});
 assert.equal(w.sample(),'baseline');
 for(let i=1;i<=40;i++){wall=i*100;w.sample();}
 assert.equal(alarms,1);
 assert.equal(w.attempted,true);
 w.resetEpoch();
 assert.equal(w.sample(),'baseline');
 wall+=1700;assert.equal(w.sample(),'stalled');
 assert.equal(alarms,2);
});
test('background/ineligible state never triggers recovery and no queued signal replay',()=>{
 let wall=0,eligible=false,alarms=0;const ctx={state:'running',currentTime:12.34};
 const w=createAudioClockWatchdog({getContext:()=>ctx,isEligible:()=>eligible,onStall:()=>alarms++,now:()=>wall});
 wall=15000;assert.equal(w.sample(),'hidden');
 assert.equal(alarms,0);
 eligible=true;assert.equal(w.sample(),'baseline');
 wall+=800;assert.equal(w.sample(),'waiting');
 assert.equal(alarms,0);
});
test('interrupted or suspended AudioContext does not cause false WebKit freeze signal',()=>{
 let wall=0,alarms=0;const ctx={state:'interrupted',currentTime:3};
 const w=createAudioClockWatchdog({getContext:()=>ctx,isEligible:()=>true,onStall:()=>alarms++,now:()=>wall});
 wall+=10000;assert.equal(w.sample(),'inactive');
 ctx.state='running';assert.equal(w.sample(),'baseline');
 wall+=200;ctx.state='suspended';assert.equal(w.sample(),'inactive');
 assert.equal(alarms,0);
});
test('a fresh AudioContext starts a new baseline instead of inheriting old time',()=>{
 let wall=0,alarms=0;let ctx={state:'running',currentTime:400};
 const w=createAudioClockWatchdog({getContext:()=>ctx,isEligible:()=>true,onStall:()=>alarms++,now:()=>wall});
 w.sample();wall=2000;w.sample();assert.equal(alarms,1);
 ctx={state:'running',currentTime:0};assert.equal(w.sample(),'baseline');
 wall=2050;ctx.currentTime=.05;assert.equal(w.sample(),'advancing');
 assert.equal(alarms,1);
});
test('suspend then resume restores a frozen clock only if currentTime really moves',async()=>{
 let calls=[],now=10;const ctx={state:'running',get currentTime(){return now;},
   suspend(){calls.push('suspend');this.state='suspended';return Promise.resolve();},
   resume(){calls.push('resume');this.state='running';return Promise.resolve();}
 };
 const ok=await pulseStalledContext(ctx,{wait:async()=>{now+=.45;}});
 assert.equal(ok,true);assert.deepEqual(calls,['suspend','resume']);
});
test('resolved resume with still-frozen clock is a failure, not a success',async()=>{
 const ctx={state:'running',currentTime:30,
  suspend(){this.state='suspended';return Promise.resolve();},
  resume(){this.state='running';return Promise.resolve();}
 };
 assert.equal(await pulseStalledContext(ctx,{wait:async()=>{}}),false);
});
test('a hung suspend is bounded and returns control (no endless recovery)',async()=>{
 const ctx={state:'running',currentTime:40,
  suspend(){return new Promise(()=>{});},
  resume(){throw new Error('must not resume while suspend hangs');}
 };
 assert.equal(await pulseStalledContext(ctx,{timeoutMs:5,wait:async()=>{}}),false);
});
test('visibility loss invalidates in-flight recovery without creating another context',async()=>{
 let current=true,resolveSuspend;
 const ctx={state:'running',currentTime:3,
  suspend(){return new Promise(resolve=>{resolveSuspend=resolve;});},
  resume(){throw new Error('should not resume after hidden');}
 };
 const promise=pulseStalledContext(ctx,{isCurrent:()=>current,timeoutMs:100,wait:async()=>{}});
 current=false;resolveSuspend();
 assert.equal(await promise,false);
});
test('source unchanged until TEST-only integration; no MP3 or user data required',()=>{
 const sw=source('sw.js'),app=source('app.mjs');
 assert(sw.includes('round-timer-shell-v0.8.19.2'));
 assert(app.includes('DIAGNOSTICS_VERSION='));
 assert(app.includes('audioClockWatchdog.sample()'));
 assert(app.includes('미하ил')===false);
});
test('v0.8.19 TEST r478 matches measured reference rhythm at 10 seconds and preserves button gain',()=>{
 const app=source('app.mjs'),html=source('index.html'),fallback=source('html-audio.mjs');
 assert(app.includes("type==='ten-double'?[0,.478]"));
 assert(app.includes("volume:kind==='button'?.1944:kind==='clack'?.96:.9"));
 assert(fallback.includes("},478);"));
 assert(html.includes('미하일 0.8.19.2'));
 assert(!html.includes('미하일 ВЕРСИЯ'));
 assert(html.includes('audioRecoveryButton'));
});
test('no playback in background and no catch-up bursts remain core invariants',()=>{
 const app=source('app.mjs');
 assert(app.includes('if(document.hidden||audioInterruption.interrupted)return'));
 assert(app.includes('isCueFresh(ticks[0]*1000-cuePhase.remainingMs)'));
 assert(app.includes('pulseStalledContext('));
 assert(app.includes('cueForPhaseTransition(phase)'));
});
