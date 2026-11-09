import test from 'node:test';
import assert from 'node:assert/strict';
import {createHtmlAudioController} from '../site/html-audio.mjs';

function harness(){
 const audio=[],tasks=new Map();
 let nextId=0,active=true;
 function makeAudio(src){
   const element={src,muted:false,paused:true,currentTime:0,playCount:0,pauseCount:0,
     preload:null,autoplay:true,
     play(){this.paused=false;this.playCount++;return Promise.resolve();},
     pause(){this.paused=true;this.pauseCount++;}
   };
   audio.push(element);return element;
 }
 const output=createHtmlAudioController({
   makeAudio,paths:{start:'start.mp3',end:'end.mp3',clack:'clack.mp3'},
   isActive:()=>active,
   schedule:(callback,delay)=>{const id=++nextId;tasks.set(id,{callback,delay});return id;},
   unschedule:id=>tasks.delete(id)
 });
 return {audio,output,tasks,setActive:v=>{active=v;},runDelayed(){
   for(const [id,task] of [...tasks]){tasks.delete(id);task.callback();}
 }};
}

test('HTML engine starts gong on direct user START and stops before Home',async()=>{
 const h=harness();h.output.play('start');
 assert.equal(h.audio[0].playCount,1);
 h.setActive(false);h.output.stopAll();
 assert.equal(h.audio[0].paused,true);
 assert.equal(h.audio[0].muted,true);
 assert.equal(h.audio[0].currentTime,0);
 await Promise.resolve();
 assert.equal(h.audio[0].paused,true);
});

test('WebKit delayed play settlement cannot restart already stopped gong',async()=>{
 let resolvePlay,stopped=false;
 const makeAudio=()=>({
   preload:null,autoplay:false,muted:true,currentTime:0,
   play(){return new Promise(resolve=>{resolvePlay=resolve;});},
   pause(){stopped=true;}
 });
 let foreground=true;
 const c=createHtmlAudioController({
   makeAudio,paths:{start:'x',end:'y',clack:'z'},isActive:()=>foreground
 });
 c.play('start');
 foreground=false;c.stopAll();resolvePlay();await Promise.resolve();await Promise.resolve();
 assert.equal(stopped,true);
});

test('background cancels double clack and never replays trailing hit',()=>{
 const h=harness();h.output.play('slow-double');
 assert.equal(h.audio[2].playCount,1);
 assert.equal(h.tasks.size,1);
 h.setActive(false);h.output.stopAll();
 h.runDelayed();
 assert.equal(h.audio[3].playCount,0);
 assert.equal(h.tasks.size,0);
});

test('HTML transport can restart cleanly after returning without stale gong',async()=>{
 const h=harness();
 h.output.play('start');
 h.setActive(false);h.output.stopAll();
 h.setActive(true);h.output.play('start');
 assert.equal(h.audio[0].playCount,2);
 assert.equal(h.audio[0].muted,false);
 assert.equal(h.audio[0].currentTime,0);
});

test('HTML transport handles unsupported autoplay without breaking timer',async()=>{
 let fails=0;
 const c=createHtmlAudioController({
  makeAudio:()=>({muted:false,currentTime:0,pause(){},play(){return Promise.reject(Error('NotAllowedError'));}}),
  paths:{start:'a',end:'b',clack:'c'},
  isActive:()=>true,onError:()=>fails++
 });
 assert.equal(c.play('start'),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fails,1);
});

test('HTML source requests preload without playback or audio-session change',()=>{
 const loaded=[],elements=[];
 const output=createHtmlAudioController({
   makeAudio:src=>{const a={preload:null,autoplay:true,load(){loaded.push(src);},
     pause(){},play(){return Promise.resolve();},muted:false,currentTime:0};elements.push(a);return a;},
   paths:{start:'gongA',end:'gongB',clack:'clack'},
   isActive:()=>false
 });
 assert.equal(output.play('single'),false);
 assert.deepEqual(loaded,['gongA','gongB','clack','clack']);
 assert(elements.every(el=>el.autoplay===false&&el.preload==='auto'));
});
test('test-only startup timing reports resolved play() delay once and cue kind',async()=>{
 const events=[],started=[];
 let t=1000;
 const ctrl=createHtmlAudioController({
   makeAudio:src=>({src,preload:null,muted:true,currentTime:0,pause(){},
     play(){started.push(src);return Promise.resolve();}}),
   paths:{start:'a',end:'b',clack:'c'},isActive:()=>true,
   now:()=>{t+=125;return t;},
   onTiming:e=>events.push(e)
 });
 ctrl.play('single');await Promise.resolve();await Promise.resolve();
 assert.equal(started.length,1);
 assert.deepEqual(events,[{kind:'clack1',delayMs:125}]);
});
test('after pause a stale pending play cannot produce misleading audio timing',async()=>{
 let resolvePlay, events=[];
 const ctrl=createHtmlAudioController({
   makeAudio:src=>({src,preload:null,muted:true,currentTime:0,pause(){},
     play(){return new Promise(resolve=>{resolvePlay=resolve;});}}),
   paths:{start:'a',end:'b',clack:'c'},isActive:()=>true,
   onTiming:e=>events.push(e)
 });
 ctrl.play('single');ctrl.stopAll();resolvePlay();
 await Promise.resolve();await Promise.resolve();
 assert.equal(events.length,0);
});
