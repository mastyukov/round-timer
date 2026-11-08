import {createDiagnosticSender,attachBrowserErrorCapture} from './diagnostics/sender.mjs';
import {createDelayedStartGuard} from './audio-guard.mjs';
const DIAGNOSTICS_VERSION='0.8.6';
const diagnosticSender=createDiagnosticSender({
  endpoint:'https://round-timer-error-receiver.mastyukov.workers.dev/v1/error'
});
attachBrowserErrorCapture({target:window,sender:diagnosticSender,version:DIAGNOSTICS_VERSION});
// Error-only telemetry; no usage, no personal information and no UI changes.
import {normalizeConfig,computePhase,formatTime,WORK_CHOICES,REST_CHOICES,ROUND_CHOICES,PREPARE_CHOICES,crossedCountdown} from './engine.mjs';
const STORAGE_KEY='timer-active-session-v1';
const byId=id=>document.getElementById(id);
const el={work:byId('workInput'),rest:byId('restInput'),rounds:byId('roundsInput'),prepare:byId('prepareInput'),clock:byId('clock'),round:byId('roundLabel'),phase:byId('phaseLabel'),progress:byId('progressBar'),start:byId('startPauseButton'),reset:byId('resetButton'),settings:byId('settings'),closeSettings:byId('closeSettingsButton'),form:byId('settingsForm')};
function durationLabel(sec) {
  if(sec===0) return '0 секунд';
  const min=Math.floor(sec/60), remainder=sec%60;
  if(!min) return `${sec} секунд`;
  if(!remainder) return `${min} ${min===1?'минута':min>=2&&min<=4?'минуты':'минут'}`;
  return `${min} мин ${remainder} сек`;
}
for(const [element,choices] of [[el.work,WORK_CHOICES],[el.rest,REST_CHOICES],[el.rounds,ROUND_CHOICES],[el.prepare,PREPARE_CHOICES]]) {
  for(const c of choices) {const option=document.createElement('option');option.value=String(c);option.textContent=c==='infinity'?'∞ Бесконечно':element===el.rounds?String(c):durationLabel(c);element.append(option);}
}
let config=normalizeConfig({work:60}),session=null,lastPhase=null,audioContext=null,wakeLock=null,wasHidden=false;
function readConfig(){return normalizeConfig({work:el.work.value,rest:el.rest.value,rounds:el.rounds.value,prepare:el.prepare.value});}
function updateInputs(c){el.work.value=c.work;el.rest.value=c.rest;el.rounds.value=c.rounds;el.prepare.value=c.prepare;}
function save(){try{if(session)localStorage.setItem(STORAGE_KEY,JSON.stringify(session));else localStorage.removeItem(STORAGE_KEY);}catch(_){}}
function restore(){try{
  const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(!raw||!['running','paused'].includes(raw.status)||!raw.config)return;
  if(!Number.isFinite(raw.elapsedBeforeMs)||raw.elapsedBeforeMs<0)return;
  if(raw.status==='running'&&(!Number.isFinite(raw.resumedAt)||raw.resumedAt<=0))return;
  // Upgrade v0.1 values to the supported presets.
  config=normalizeConfig(raw.config);
  session={status:raw.status,config,elapsedBeforeMs:raw.elapsedBeforeMs,resumedAt:raw.resumedAt||0};
  updateInputs(config);
}catch(_){}}
function elapsedNow(){return session?session.elapsedBeforeMs+(session.status==='running'?Math.max(0,Date.now()-session.resumedAt):0):0;}
function phaseNow(){return computePhase(config,elapsedNow());}
function unlockAudio(){try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume().then(preloadSounds).catch(()=>{void diagnosticSender.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:DIAGNOSTICS_VERSION});});}catch(_){}}
// Original boxing-style sounds, not extracted from any third-party app.
// Audio is unlocked on a direct button press; silence in the background is expected on iOS.
const SOUND_PATHS={start:'./sounds/gong-start.mp3',end:'./sounds/gong-end.mp3',clack:'./sounds/woodclack.mp3'};
const soundBuffers={};
let soundsLoading=null;
const delayedStartGong=createDelayedStartGuard({
  canPlay: context=>!!context.sessionRef && session===context.sessionRef &&
    session.status==='running' && !document.hidden &&
    audioContext?.state==='running' && !!soundBuffers.start &&
    phaseNow().key===context.phaseKey,
  play: ()=>sound('start'),
});
function preloadSounds(){
 if(soundsLoading||!audioContext)return soundsLoading;
 soundsLoading=Promise.all(Object.entries(SOUND_PATHS).map(async([name,url])=>{
   try {const resp=await fetch(url);if(!resp.ok)throw new Error('audio fetch failed');
     soundBuffers[name]=await audioContext.decodeAudioData(await resp.arrayBuffer());}
   catch(err){console.warn('Audio not available',name,err);void diagnosticSender.report({event:'audio_failure',code:'ASSET_LOAD_FAILED',component:'audio',version:DIAGNOSTICS_VERSION});}
 }));return soundsLoading;
}
function sound(type){
 if(document.hidden||!audioContext||audioContext.state!=='running')return;
 const kind=type==='start'?'start':(type==='end'||type==='done')?'end':'clack';
 const sample=soundBuffers[kind];
 if(!sample){
   const loading=preloadSounds();
   if(type==='start'&&loading&&session)delayedStartGong.schedule(loading,{
     sessionRef:session,phaseKey:phaseNow().key
   });
   return;
 }
 const offsets=type==='slow-double'?[0,.25]:type==='double'?[0,.145]:[0];
 const now=audioContext.currentTime+.008;
 for(const offset of offsets){
   const source=audioContext.createBufferSource(),gain=audioContext.createGain();
   source.buffer=sample;gain.gain.value=kind==='clack'?.96:.9;
   source.connect(gain).connect(audioContext.destination);
   source.start(now+offset);
 }
}
async function ensureScreenOn(){if(!('wakeLock' in navigator)||document.hidden||!session||session.status!=='running')return;if(wakeLock&&!wakeLock.released)return;try{wakeLock=await navigator.wakeLock.request('screen');}catch(_){}}
async function releaseScreenOn(){if(!wakeLock)return;try{await wakeLock.release();}catch(_){}wakeLock=null;}
// Fixed reference measurement prevents seconds changing the physical width of the display.
let lastClockLayout='';
function fitClock(force=false){
 const frame=el.clock.parentElement;
 if(!frame||!frame.clientWidth||!frame.clientHeight)return;
 const portrait=window.matchMedia('(orientation: portrait)').matches;
 const key=[frame.clientWidth,frame.clientHeight,window.innerWidth,window.innerHeight,portrait].join(':');
 if(!force && key===lastClockLayout)return;
 lastClockLayout=key;
 const ctx=(fitClock.canvas||(fitClock.canvas=document.createElement('canvas'))).getContext('2d');
 const st=getComputedStyle(el.clock);
 ctx.font=`900 100px ${st.fontFamily}`;
 const raw=ctx.measureText('88:88').width-100*.055*4;
 const scaleX=portrait?1.2:1.587,scaleY=portrait?4.3164:1.587;
 const byWidth=(frame.clientWidth*.98)/(raw/100)/scaleX;
 const byHeight=(frame.clientHeight*.95)/scaleY;
 const size=Math.max(15,Math.min(byWidth,byHeight,620));
 el.clock.style.fontSize=`${size}px`;
 fitLabels();
}
function fitLabels(){
 const portrait=window.matchMedia('(orientation: portrait)').matches;
 const ctx=(fitClock.labelCanvas||(fitClock.labelCanvas=document.createElement('canvas'))).getContext('2d');
 for(const label of [el.round,el.phase]){
  const st=getComputedStyle(label),root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
  const ideal=label===el.round?(portrait?window.innerWidth*.09:window.innerHeight*.07):(portrait?window.innerWidth*.073:window.innerHeight*.05);
  let size=Math.max(root*.82,Math.min(ideal,root*4.6));
  ctx.font=`900 ${size}px ${st.fontFamily}`;
  const expected=label.textContent||'РАУНД 12 / ∞';
  const max=label.parentElement.clientWidth*.96;
  const w=ctx.measureText(expected).width;
  if(w>max)size*=max/w;
  label.style.fontSize=`${Math.max(12,size)}px`;
 }
}
window.addEventListener('resize',()=>{lastClockLayout='';fitClock(true);});
window.addEventListener('orientationchange',()=>{lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
if('ResizeObserver' in window)new ResizeObserver(()=>fitClock()).observe(el.clock.parentElement);
function draw({notify=true}={}) {
  const phase=session?phaseNow():computePhase({...config,prepare:0},0);
  const type=session?phase.type:'idle';
  document.body.className=`phase-${type}`;
  el.round.textContent=`РАУНД ${phase.round} / ${phase.rounds==='infinity'?'∞':phase.rounds}`;
  el.clock.textContent=formatTime(phase.remainingMs);
  fitClock();
  el.phase.textContent={prepare:'ПОДГОТОВКА',work:'РАБОТА',rest:'ОТДЫХ',done:'ЗАВЕРШЕНО',idle:'ГОТОВ К СТАРТУ'}[type];
  fitLabels();
  const duration=phase.durationMs||1;
  el.progress.style.width=type==='done'?'100%':`${Math.max(0,Math.min(100,100*(1-phase.remainingMs/duration)))}%`;
  const action=!session?'▶ СТАРТ':type==='done'?'↻ ЗАНОВО':session.status==='running'?'Ⅱ ПАУЗА':'▶ ПРОДОЛЖИТЬ';
  el.start.textContent=action;
  const locked=!!session&&type!=='done';
  for(const input of [el.work,el.rest,el.rounds,el.prepare])input.disabled=locked;
  if(locked&&el.settings.open)el.settings.open=false;
  if(session&&session.status==='running'&&type==='done')releaseScreenOn();
  if(notify&&session&&session.status==='running'&&lastPhase&&!document.hidden){
    if(phase.key!==lastPhase.key){
      if(phase.type==='work')sound('start');
      else if(phase.type==='rest')sound('end');
      else if(phase.type==='done')sound('end');
    } else {
      // Skip catch-up bursts on delayed ticks (e.g., the tab was briefly throttled).
      const ticks=crossedCountdown(lastPhase,phase);
      if(ticks.length===1)sound((ticks[0]===30||ticks[0]===10)?'slow-double':'single');
    }
  }
  lastPhase=session?phase:null;
}
function startPause(){
  // Every button action invalidates delayed initial gong requests.
  delayedStartGong.invalidate();
  unlockAudio();
  const current=session&&phaseNow();
  if(!session||current?.type==='done'){
    config=readConfig();updateInputs(config);
    session={status:'running',config,elapsedBeforeMs:0,resumedAt:Date.now()};
    el.settings.open=false;lastPhase=null;
    if(config.prepare===0)sound('start');
    else if(config.prepare<=5)sound('single');
    ensureScreenOn();
  } else if(session.status==='running'){
    session.elapsedBeforeMs=elapsedNow();session.resumedAt=0;session.status='paused';releaseScreenOn();
  } else {session.status='running';session.resumedAt=Date.now();ensureScreenOn();}
  save();draw({notify:false});
}
function reset(){delayedStartGong.invalidate();session=null;lastPhase=null;config=readConfig();save();releaseScreenOn();draw({notify:false});}
el.start.addEventListener('click',startPause);
el.reset.addEventListener('click',reset);
el.form.addEventListener('change',()=>{if(!session){config=readConfig();draw({notify:false});}});
el.settings.addEventListener('toggle',()=>{document.body.classList.toggle('settings-visible',el.settings.open);lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
el.closeSettings.addEventListener('click',()=>{el.settings.open=false;lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&el.settings.open)el.settings.open=false;});
el.form.addEventListener('submit',event=>event.preventDefault());
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){delayedStartGong.invalidate();wasHidden=true;lastPhase=null;save();}
  else{draw({notify:false});ensureScreenOn();wasHidden=false;}
});
window.addEventListener('pageshow',()=>draw({notify:false}));
window.addEventListener('pagehide',save);
updateInputs(config);restore();draw({notify:false});
setInterval(()=>{if(!document.hidden)draw({notify:true});},100);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
