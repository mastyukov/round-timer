import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebAudioRetirement} from '../site/web-audio-retire.mjs';

test('retiring a Web Audio context closes it once and discards old buffers',async()=>{
 let closeCount=0,old={close(){closeCount++;return Promise.resolve();}};
 let context=old,buffers={start:1,end:2,clack:3},pending=Promise.resolve('old');
 const guard=createWebAudioRetirement({
   getContext:()=>context,
   reset:()=>{context=null;buffers={};pending=null;}
 });
 const generation=guard.generation;
 assert(guard.isCurrent(old,generation));
 assert.equal(guard.retire(),true);
 assert.equal(closeCount,1);
 assert.equal(context,null);
 assert.deepEqual(buffers,{});
 assert.equal(pending,null);
 assert.equal(guard.isCurrent(old,generation),false);
 assert.equal(guard.retire(),false);
 assert.equal(closeCount,1);
});

test('Web Audio context close errors and rejection cannot break timer',async()=>{
 let old={close(){return Promise.reject(new Error('iOS ignored close'));}};
 let context=old;
 const guard=createWebAudioRetirement({getContext:()=>context,reset:()=>{context=null;}});
 assert.equal(guard.retire(),true);
 await new Promise(resolve=>setImmediate(resolve));
 context={close(){throw Error('iOS throws');}};
 assert.equal(guard.retire(),true);
 assert.equal(context,null);
});

test('late decoded cue can never belong to retired audio context',()=>{
 let context={};
 const guard=createWebAudioRetirement({getContext:()=>context,reset:()=>{context=null;}});
 const old=context,oldGeneration=guard.generation;
 guard.retire();
 context={};
 assert.equal(guard.isCurrent(old,oldGeneration),false);
 assert.equal(guard.isCurrent(context,guard.generation),true);
});

test('RC10 background handler destroys old WebAudio and forbids audio catchup',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../site/app.mjs',import.meta.url),'utf8');
 assert(app.includes("const retire=isPreview&&audioMode==='web'"));
 assert(app.includes("stopActiveAudio({fadeMs:retire?0"));
 assert(app.includes('webRetirement.retire()'));
 assert(app.includes('function endWebBackgroundReturn()'));
 assert(app.includes('window.addEventListener(\'focus\',endWebBackgroundReturn)'));
 assert(app.includes('draw({notify:false}); // Never replay any skipped background gong/clacks.'));
 assert(app.includes("if(audioMode==='html' && htmlSounds)"));
});

test('RC10 caches new lifecycle controller offline and does not modify cue assets',async()=>{
 const {readFileSync}=await import('node:fs');
 const sw=readFileSync(new URL('../site/sw.js',import.meta.url),'utf8');
 assert(sw.includes("round-timer-shell-v0.8.10-mix-rc14"));
 assert(sw.includes("'./web-audio-retire.mjs'"));
 for(const p of ['sounds/gong-start.mp3','sounds/gong-end.mp3','sounds/woodclack.mp3'])assert(sw.includes("'./"+p+"'"));
});
