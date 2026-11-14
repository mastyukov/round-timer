import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHtmlAudioController} from '../site/html-audio.mjs';

const appSource=()=>readFileSync(new URL('../site/app.mjs',import.meta.url),'utf8');
const source=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');

async function simulate(label,run,{delayInitialResume=false}={}){
 const keys=['window','document','navigator','location','localStorage','fetch','getComputedStyle','requestAnimationFrame','setInterval'];
 const descriptors=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const originalDateNow=Date.now;
 let now=500000, heartbeat=null;
 const windows=new Map(),documents=new Map(),instances=[],played=[],storage=new Map();
 const emit=(target,name)=>{for(const fn of target.get(name)||[])fn({isPrimary:true,preventDefault(){}});};
 const on=(map,name,fn)=>map.set(name,[...(map.get(name)||[]),fn]);
 class Element{
  constructor(name){this.name=name;this.value='';this.disabled=false;this.open=false;this.hidden=name==='audioRecoveryButton';
   this.children=[];this.style={};this.attrs={};this.textContent='';this.events=new Map();
   this.parentElement={clientWidth:390,clientHeight:300};this.clientWidth=390;this.clientHeight=300;
   this.classList={toggle(){}};}
  addEventListener(n,cb){on(this.events,n,cb);}
  fire(n){emit(this.events,n);}
  append(child){this.children.push(child);}
  insertBefore(child){this.children.push(child);}
  setAttribute(k,v){this.attrs[k]=v;}
  querySelector(){return new Element('summary');}
  getContext(){return {measureText:s=>({width:s.length*40}),font:''};}
 }
 const ids=['workInput','restInput','roundsInput','prepareInput','clock','roundLabel','roundCount',
  'roundCurrent','roundTotal','phaseLabel','progressBar','startPauseButton','resetButton',
  'settings','closeSettingsButton','audioRecoveryButton','settingsForm'];
 const el=Object.fromEntries(ids.map(n=>[n,new Element(n)]));
 class FakeAudio{
  constructor(path){this.src=path;this.paused=true;this.currentTime=0;}
  load(){}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}
 }
 class FakeContext{
  constructor(){
   this.state='suspended';this.currentTime=10;this.destination={};
   this.mode=delayInitialResume?'deferred':'auto';this.pending=[];this.closed=false;instances.push(this);
  }
  resume(){
   if(this.mode==='blocked')return Promise.resolve();
   if(this.mode==='deferred')return new Promise(resolve=>this.pending.push(resolve));
   this.state='running';return Promise.resolve();
  }
  release(){this.mode='auto';this.state='running';for(const fn of this.pending.splice(0))fn();}
  close(){this.state='closed';this.closed=true;return Promise.resolve();}
  decodeAudioData(bytes){return Promise.resolve({id:bytes,duration:.3});}
  createGain(){
   const g={value:1,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},
    cancelScheduledValues(){}};
   return {gain:g,connect(){return this;},disconnect(){}};
  }
  createBufferSource(){
   return {buffer:null,gain:null,connect(g){this.gain=g;return g;},disconnect(){},stop(){},
    start(at){played.push({path:this.buffer?.id,at,gain:this.gain?.gain?.value});}};
  }
 }
 const win={
  innerWidth:390,innerHeight:844,Audio:FakeAudio,AudioContext:FakeContext,
  matchMedia:()=>({matches:true}),
  addEventListener:(n,fn)=>on(windows,n,fn),
  visualViewport:{height:780,addEventListener(){}}
 };
 const doc={
  hidden:false,body:{className:'',classList:{toggle(){}}},documentElement:{},
  getElementById:id=>el[id],createElement:n=>new Element(n),
  addEventListener:(n,fn)=>on(documents,n,fn),
 };
 const set=(k,v)=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 try{
  Date.now=()=>now;
  set('window',win);set('document',doc);set('navigator',{});
  set('location',{origin:'https://mastyukov.github.io',pathname:'/round-timer/'});
  set('localStorage',{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),
   removeItem:k=>storage.delete(k)});
  set('fetch',async path=>({ok:true,arrayBuffer:async()=>path}));
  set('getComputedStyle',()=>({fontFamily:'sans-serif',fontSize:'16px'}));
  set('requestAnimationFrame',fn=>{fn();return 1;});
  set('setInterval',fn=>{heartbeat=fn;return 1;});
  await import('../site/app.mjs?'+label);
  const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,0));};
  const tap=node=>{node.fire('pointerdown');node.fire('click');};
  const hide=()=>{
    emit(windows,'blur');doc.hidden=true;emit(documents,'visibilitychange');
  };
  const show=()=>{
    doc.hidden=false;emit(documents,'visibilitychange');emit(windows,'focus');
  };
  await run({el,win,doc,instances,played,tap,hide,show,flush,storage,
   tick:()=>heartbeat(),time:t=>{now=t;},getTime:()=>now});
 }finally{
  Date.now=originalDateNow;
  for(const [key,descriptor] of descriptors){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
 }
}

test('cold iPhone START with zero preparation plays one gong after delayed resume and decode',async()=>{
 await simulate('cold-start',async({el,tap,instances,played,flush})=>{
  assert.equal(el.prepareInput.value,0);
  tap(el.startPauseButton);
  assert.equal(instances.length,1);
  assert.equal(played.length,0,'do not assume a suspended AudioContext is audible');
  instances[0].release();
  await flush();
  assert.equal(played.filter(p=>p.path?.includes('studio-gong-start.mp3')).length,1);
  assert.equal(el.audioRecoveryButton.hidden,true);
 },{delayInitialResume:true});
});

test('RESET cancels a delayed cold-start gong, including after loading finishes',async()=>{
 await simulate('cancel-start',async({el,tap,instances,played,flush})=>{
  tap(el.startPauseButton);
  tap(el.resetButton);
  instances[0].release();
  await flush();
  assert.equal(played.filter(p=>p.path?.includes('studio-gong-start.mp3')).length,0);
 });
});

test('background switching preserves decoded buffers and returns to Web Audio cue events',async()=>{
 await simulate('background',async({el,tap,instances,played,hide,show,flush,tick,time,getTime})=>{
  tap(el.startPauseButton);
  await flush();
  const ctx=instances[0],before=played.length,base=getTime();
  assert(played.some(p=>p.path?.includes('studio-gong-start.mp3')));
  hide();
  ctx.state='interrupted';
  time(base+49500);
  show();
  await flush();
  assert.equal(instances.length,1,'re-use user-unlocked context instead of recreating it');
  assert.equal(ctx.closed,false);
  assert.equal(ctx.state,'running');
  assert.equal(el.audioRecoveryButton.hidden,true);
  assert.equal(played.length,before,'do not replay missed signals during foreground return');
  time(base+50020);tick();
  const clacks=played.filter(p=>p.path?.includes('woodclack-single.mp3'));
  assert.equal(clacks.length,2,'10-second double remains audible after restoring audio');
  assert(Math.abs(clacks[1].at-clacks[0].at-.142)<1e-8,'142ms spacing');
 });
});

test('blocked foreground resume shows a recovery button; one user tap revives sound',async()=>{
 await simulate('blocked-foreground',async({el,tap,instances,played,hide,show,flush})=>{
  tap(el.startPauseButton);
  await flush();
  const ctx=instances[0];hide();
  ctx.state='interrupted';ctx.mode='blocked';
  show();
  await flush();
  assert.equal(el.audioRecoveryButton.hidden,false);
  assert.equal(ctx.state,'interrupted');
  ctx.mode='auto';
  tap(el.audioRecoveryButton);
  await flush();
  assert.equal(el.audioRecoveryButton.hidden,true);
  assert.equal(ctx.state,'running');
  assert.equal(instances.length,1);
 });
});

test('142ms HTML fallback, quieter WebAudio buttons, stable UI and new offline cache',()=>{
 const htmlAudioTasks=[],hits=[];
 const html=createHtmlAudioController({
  makeAudio:name=>({paused:true,currentTime:0,load(){},pause(){},play(){hits.push(name);return Promise.resolve();}}),
  paths:{start:'start',end:'end',clack:'clack',double:'double',button:'button'},
  isActive:()=>true,
  schedule:(fn,ms)=>{htmlAudioTasks.push({fn,ms});return htmlAudioTasks.at(-1);},unschedule:()=>{}
 });
 html.play('ten-double');
 assert.equal(htmlAudioTasks[0].ms,142);
 assert.deepEqual(hits,['clack']);
 htmlAudioTasks[0].fn();
 assert.deepEqual(hits,['clack','clack']);
 const app=appSource(),htmlPage=source('index.html'),sw=source('sw.js');
 assert(app.includes("volume:kind==='button'?.5832:kind==='clack'?.96:.9"));
 assert(app.includes("type==='ten-double'?[0,.142]"));
 assert(htmlPage.includes('ВЕРСИЯ · v0.8.17'));
 assert(htmlPage.includes('id="audioRecoveryButton"'));
 assert(sw.includes("round-timer-shell-v0.8.17"));
 assert(!htmlPage.includes('ТЕСТОВАЯ ВЕРСИЯ'));
});

test('a single 30-second clack received 2 seconds late is NOT played',async()=>{
 await simulate('stale-clack',async({el,tap,played,flush,time,tick,getTime})=>{
  tap(el.startPauseButton);
  await flush();
  const initial=played.length,base=getTime();
  time(base+32000);
  tick();
  assert.equal(played.length,initial,'no 30s sound when delivered 2s late');
  assert.equal(el.clock.textContent,'00:28','wall-clock countdown is not changed');
 });
});
test('fresh 30-second clack remains audible within 80ms of its threshold',async()=>{
 await simulate('fresh-clack',async({el,tap,played,flush,time,tick,getTime})=>{
  tap(el.startPauseButton);
  await flush();
  const base=getTime();
  time(base+30080);tick();
  const clacks=played.filter(p=>p.path?.includes('woodclack-single.mp3'));
  assert.equal(clacks.length,1,'fresh clack plays once');
 });
});
test('2-second late phase-change gong is discarded, but next timely work gong sounds',async()=>{
 await simulate('stale-next-gong',async({el,tap,played,flush,time,tick,getTime})=>{
  tap(el.startPauseButton);
  await flush();
  const base=getTime(),gongStarts=()=>played.filter(p=>p.path?.includes('studio-gong-start.mp3')).length;
  const gongEnds=()=>played.filter(p=>p.path?.includes('studio-gong-end.mp3')).length;
  assert.equal(gongStarts(),1);
  time(base+62000);tick(); // REST started at 60s; delayed 2 seconds
  assert.equal(gongEnds(),0,'stale REST transition not replayed');
  time(base+90080);tick(); // WORK 2 begins at 90s; callback just 80ms late
  assert.equal(gongStarts(),2,'next timely gong is not muted');
 });
});
