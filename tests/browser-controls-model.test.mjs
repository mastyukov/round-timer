import test from 'node:test';
import assert from 'node:assert/strict';

test('synthetic DOM model: start / pause / resume / reset and stale gong',async()=>{
 const names=['window','document','navigator','localStorage','fetch','getComputedStyle',
              'requestAnimationFrame','setInterval','ResizeObserver'];
 const originals=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const originalNow=Date.now;let current=1700000000000,heartbeat=null,audioStarts=0;
 const waiting=[];let pendingSounds=true;
 const handlers=new Map();
 class Element {
   constructor(id){
     this.id=id;this.listeners=new Map();this.children=[];this.style={};this.open=false;
     this.clientWidth=380;this.clientHeight=140;this.value='';this.disabled=false;
     this.classList={toggle(){}};
     this.parentElement={clientWidth:380,clientHeight:150};
     this.textContent='';
   }
   addEventListener(n,fn){this.listeners.set(n,fn);}
   append(child){this.children.push(child);}
   fire(n,evt={}){this.listeners.get(n)?.(evt);}
   getContext(){return {measureText:t=>({width:t.length*65}),font:''};}
 }
 const ids=['workInput','restInput','roundsInput','prepareInput','clock','roundLabel','phaseLabel',
            'progressBar','startPauseButton','resetButton','settings','closeSettingsButton','settingsForm'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
 const db=new Map(),localStorage={
   getItem:key=>db.get(key)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)
 };
 class FakeAudio {
   state='running';currentTime=0;destination={};
   resume(){return Promise.resolve();}
   async decodeAudioData(){return {sample:true};}
   createGain(){return {gain:{value:0},connect(){return this;}};}
   createBufferSource(){return {connect(){return this;},start(){audioStarts++;}};}
 }
 const window={innerWidth:380,innerHeight:810,AudioContext:FakeAudio,
   matchMedia:()=>({matches:true}),
   addEventListener:(n,fn)=>handlers.set(n,fn)};
 const document={hidden:false,body:{className:'',classList:{toggle(){}}},
   getElementById:id=>nodes[id],
   createElement:id=>new Element(id),
   addEventListener:(n,fn)=>handlers.set(n,fn)};
 const set=(k,v)=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 const delay=()=>new Promise(resolve=>setImmediate(resolve));
 try{
   Date.now=()=>current;
   set('window',window);set('document',document);
   set('navigator',{serviceWorker:undefined});
   set('localStorage',localStorage);
   set('fetch',()=>new Promise(resolve=>waiting.push(resolve)));
   set('getComputedStyle',()=>({fontFamily:'sans-serif',fontSize:'16px'}));
   set('requestAnimationFrame',fn=>fn());
   set('setInterval',fn=>{heartbeat=fn;return 1;});
   set('ResizeObserver',undefined);
   await import('../site/app.mjs?browser-model-1');
   assert.equal(nodes.clock.textContent,'01:00');
   nodes.startPauseButton.fire('click');
   assert.equal(nodes.phaseLabel.textContent,'ПОДГОТОВКА');
   current+=2000;heartbeat();assert.equal(nodes.clock.textContent,'00:03');
   nodes.startPauseButton.fire('click');
   assert.equal(nodes.startPauseButton.textContent,'▶ ПРОДОЛЖИТЬ');
   const paused=nodes.clock.textContent;
   current+=12000;heartbeat();assert.equal(nodes.clock.textContent,paused);
   nodes.startPauseButton.fire('click');assert.equal(nodes.startPauseButton.textContent,'Ⅱ ПАУЗА');
   current+=3000;heartbeat();assert.equal(nodes.phaseLabel.textContent,'РАБОТА');
   nodes.resetButton.fire('click');
   assert.equal(nodes.clock.textContent,'01:00');
   assert.equal(nodes.startPauseButton.textContent,'▶ СТАРТ');
   assert.equal(db.has('timer-active-session-v1'),false);

   // Force 0s prepare. The sound is requested but its network load is delayed.
   nodes.prepareInput.value='0';nodes.settingsForm.fire('change');
   nodes.startPauseButton.fire('click');await delay();
   assert.equal(nodes.phaseLabel.textContent,'РАБОТА');
   nodes.startPauseButton.fire('click'); // PAUSE before sound data arrives
   for(const done of waiting)done(new Response(new Uint8Array([1,2,3])));
   await delay();await delay();await delay();
   assert.equal(audioStarts,0,'late start gong must never play after PAUSE');
   nodes.resetButton.fire('click');
   nodes.startPauseButton.fire('click'); // New running session persists when page closes
   current+=9000;
   await import('../site/app.mjs?browser-model-reopen');
   assert.equal(nodes.phaseLabel.textContent,'РАБОТА');
   assert.equal(nodes.clock.textContent,'00:51','restored session uses actual elapsed wall time');
   nodes.resetButton.fire('click');
 }finally{
   Date.now=originalNow;
   for(const [key,descriptor] of originals){
     if(descriptor)Object.defineProperty(globalThis,key,descriptor);
     else delete globalThis[key];
   }
 }
});
