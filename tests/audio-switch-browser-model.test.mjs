import test from 'node:test';
import assert from 'node:assert/strict';

// Simulates the installed preview PWA, including a previously selected Web
// Audio transport, while keeping the real app's event handlers and logic.
test('RC13 supports explicit Web to HTML switch on the fresh preview preference key',async()=>{
 const names=['window','document','navigator','location','localStorage','fetch','getComputedStyle',
              'requestAnimationFrame','setInterval','ResizeObserver'];
 const backup=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const oldNow=Date.now;
 let time=1800000000000,heartbeat=null;
 const handlers=new Map(),store=new Map([['round-timer-preview-transport-rc13-v1','web']]);
 const musicTransitions=[];
 const audioSession={_type:'auto',get type(){return this._type;},
   set type(value){this._type=value;musicTransitions.push(value);}};
 class Element {
   constructor(name){
     this.name=name;this.id=name;this.value='';this.disabled=false;this.open=false;
     this.textContent='';this.children=[];this.events=new Map();this.style={};
     this.parentElement={clientWidth:380,clientHeight:150};
     this.clientWidth=380;this.clientHeight=140;
     this.classList={toggle(){}};
   }
   addEventListener(name,fn){this.events.set(name,fn);}
   append(item){this.children.push(item);}
   insertBefore(item,reference){this.children.push(item);}
   fire(name){this.events.get(name)?.({preventDefault(){}});}
   getContext(){return {font:'',measureText:t=>({width:t.length*65})};}
 }
 const ids=['workInput','restInput','roundsInput','prepareInput','clock','roundLabel',
   'phaseLabel','progressBar','startPauseButton','resetButton','settings',
   'closeSettingsButton','settingsForm'];
 const nodes=Object.fromEntries(ids.map(n=>[n,new Element(n)]));
 class HTMLAudio {
   constructor(src){this.src=src;this.muted=false;this.currentTime=0;}
   load(){}
   play(){return Promise.resolve();}
   pause(){}
 }
 class WebAudio {
   state='running';currentTime=0;destination={};
   resume(){return Promise.resolve();}
   decodeAudioData(){return Promise.resolve({});}
   createGain(){return {gain:{value:1},connect(){return this;}};}
   createBufferSource(){return {connect(){return this;},start(){},stop(){},disconnect(){}};}
 }
 const win={
   innerWidth:380,innerHeight:810,Audio:HTMLAudio,AudioContext:WebAudio,
   matchMedia:()=>({matches:true}),
   addEventListener:(n,fn)=>handlers.set(n,fn)
 };
 const doc={hidden:false,body:{className:'',classList:{toggle(){}}},
   documentElement:{},
   getElementById:id=>nodes[id],
   createElement:name=>new Element(name),
   addEventListener:(n,fn)=>handlers.set(n,fn)
 };
 const set=(name,value)=>Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 const findSelect=title=>{
   const l=nodes.settingsForm.children.find(x=>x.textContent===title);
   assert(l, 'settings label '+title+' exists');
   const s=l.children.find(x=>x.name==='select');
   assert(s, 'settings control exists');
   return s;
 };
 try{
   Date.now=()=>time;
   set('window',win);set('document',doc);
   set('location',{origin:'https://mastyukov-cyber.github.io',pathname:'/round-timer-pages-test/'});
   set('navigator',{audioSession,serviceWorker:undefined});
   set('localStorage',{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),
     removeItem:k=>store.delete(k)});
   set('fetch',()=>new Promise(()=>{}));
   set('getComputedStyle',()=>({fontFamily:'sans-serif',fontSize:'16px'}));
   set('requestAnimationFrame',fn=>fn());
   set('setInterval',fn=>{heartbeat=fn;return 1;});
   set('ResizeObserver',undefined);
   await import('../site/app.mjs?rc9-switch-model');
   const mode=findSelect('ЗВУК ТАЙМЕРА · ТЕСТ');
   const mix=findSelect('МУЗЫКА ПРИ СИГНАЛАХ · RC7');
   assert.equal(mode.value,'web');
   assert.equal(mode.disabled,false,'audio selector available when idle');
   assert.equal(mix.disabled,true,'mixing only applies to HTML Audio');
   nodes.startPauseButton.fire('click');
   assert.equal(nodes.startPauseButton.textContent,'Ⅱ ПАУЗА');
   time+=2000;
   nodes.settings.open=true;
   heartbeat();
   assert.equal(nodes.settings.open,true,'preview Settings do not close during test');
   assert.equal(mode.disabled,false,'audio selector remains available while running');
   assert.equal(nodes.workInput.disabled,true,'training duration is protected while running');
   const before=nodes.clock.textContent;
   mode.value='html';mode.fire('change');
   assert.equal(store.get('round-timer-preview-transport-rc13-v1'),'html');
   assert.equal(nodes.startPauseButton.textContent,'▶ ПРОДОЛЖИТЬ','engine change auto-pauses');
   assert.equal(nodes.settings.open,true,'settings remain visible after switching');
   assert.equal(mode.disabled,false,'audio selector available while paused');
   assert.equal(mix.disabled,false,'HTML music-mix control now available');
   time+=5000;heartbeat();
   assert.equal(nodes.clock.textContent,before,'elapsed time stops while paused');
   mode.value='web';mode.fire('change');
   assert.equal(store.get('round-timer-preview-transport-rc13-v1'),'web');
   assert.equal(mix.disabled,true);
   mode.value='html';mode.fire('change');
   assert.equal(store.get('round-timer-preview-transport-rc13-v1'),'html');
   assert.equal(nodes.startPauseButton.disabled,true,'settings modal blocks the START/PAUSE button');
   nodes.startPauseButton.fire('click');
   assert.equal(nodes.startPauseButton.textContent,'▶ ПРОДОЛЖИТЬ','background click is rejected');
   nodes.settings.open=false;
   nodes.settings.fire('toggle');
   assert.equal(nodes.startPauseButton.disabled,false,'close restores button control');
   nodes.startPauseButton.fire('click');
   assert.equal(nodes.startPauseButton.textContent,'Ⅱ ПАУЗА');
   time+=1000;heartbeat();
   assert.notEqual(nodes.clock.textContent,before,'countdown resumes correctly');
   assert.equal(audioSession.type,'transient','music mix must be engaged before reset');
   const musicCategoryChanges=musicTransitions.length;
   nodes.resetButton.fire('click');
   assert.equal(nodes.startPauseButton.textContent,'▶ СТАРТ');
   assert.equal(audioSession.type,'transient','reset must keep iOS music mix alive');
   assert.equal(musicTransitions.length,musicCategoryChanges,'RESET cannot switch audioSession back to auto');
   // Hiding the page must still release the iOS audio category.
   nodes.settings.open=false;
   doc.hidden=true;
   handlers.get('visibilitychange')?.();
   assert.equal(audioSession.type,'auto','background shutdown restores original session');
 }finally{
   Date.now=oldNow;
   for(const [key,descriptor] of backup){
     if(descriptor)Object.defineProperty(globalThis,key,descriptor);
     else delete globalThis[key];
   }
 }
});
