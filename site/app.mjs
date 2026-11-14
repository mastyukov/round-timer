import {createDiagnosticSender,attachBrowserErrorCapture,productionDiagnosticEndpoint} from './diagnostics/sender.mjs';
import {createDelayedStartGuard,createActiveSoundController,createAudioInterruptionGuard,isCueFresh} from './audio-guard.mjs';
import {createHtmlAudioController} from './html-audio.mjs';
import {createWebAudioRetirement} from './web-audio-retire.mjs';
import {createAudioDucking} from './audio-duck.mjs';
const DIAGNOSTICS_VERSION='0.8.17';
const diagnosticSender=createDiagnosticSender({
  endpoint:productionDiagnosticEndpoint(globalThis.location,'https://round-timer-error-receiver.mastyukov.workers.dev/v1/error')
});
attachBrowserErrorCapture({target:window,sender:diagnosticSender,version:DIAGNOSTICS_VERSION});
// Error-only telemetry; no usage, no personal information and no UI changes.
import {normalizeConfig,computePhase,formatTime,WORK_CHOICES,REST_CHOICES,ROUND_CHOICES,PREPARE_CHOICES,crossedCountdown} from './engine.mjs';
const STORAGE_KEY='timer-active-session-v1';
// RC6 preview resets earlier transport and speculative 50% options.
// RC13 TEST: reset previously saved audio mode to reliable HTML default.
const PREVIEW_AUDIO_KEY='round-timer-preview-transport-rc13-v1';
const PREVIEW_MUSIC_KEY='round-timer-preview-music-mix-v1';
// RC13: restore exact countdown boundaries; no speculative 700ms lead.
// Approved RC19 behavior is now the stable release, not a TEST-origin experiment.
// Audio QA controls remain disabled separately via AUDIO_QA_CONTROLS=false.
const isPreview=true;
// RC17: user-facing audio experiments retired. Dormant QA switches are disabled.
const AUDIO_QA_CONTROLS=false;
let audioMode='web';
let musicMixEnabled=isPreview;
if(AUDIO_QA_CONTROLS && isPreview){
  try{audioMode=localStorage.getItem(PREVIEW_AUDIO_KEY)==='web'?'web':'html';}catch(_){audioMode='html';}
  try{musicMixEnabled=localStorage.getItem(PREVIEW_MUSIC_KEY)!=='off';}catch(_){musicMixEnabled=true;}
}

const byId=id=>document.getElementById(id);
const el={work:byId('workInput'),rest:byId('restInput'),rounds:byId('roundsInput'),prepare:byId('prepareInput'),clock:byId('clock'),round:byId('roundLabel'),roundCount:byId('roundCount'),roundCurrent:byId('roundCurrent'),roundTotal:byId('roundTotal'),phase:byId('phaseLabel'),progress:byId('progressBar'),start:byId('startPauseButton'),reset:byId('resetButton'),settings:byId('settings'),closeSettings:byId('closeSettingsButton'),audioRecover:byId('audioRecoveryButton'),form:byId('settingsForm')};
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
let config=normalizeConfig({work:60}),session=null,lastPhase=null,lastCuePhase=null,audioContext=null,wakeLock=null,wasHidden=false;
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
// Return readiness: an immediate zero-preparation START can then queue its gong
// until Safari enables Web Audio and decodes the original recording.
function unlockAudio(){
 if(audioMode==='html')return Promise.resolve(false);
 try{
   if(audioContext?.state==='closed')webRetirement.retire();
   audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
   const context=audioContext,token=webRetirement.generation;
   const resume=context.state==='running'?Promise.resolve():context.resume();
   return Promise.resolve(resume).then(async()=>{
     if(!webRetirement.isCurrent(context,token)||document.hidden||context.state!=='running')return false;
     await preloadSounds();
     return webRetirement.isCurrent(context,token)&&context.state==='running'&&!!soundBuffers.start;
   }).catch(()=>{
     void diagnosticSender.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:DIAGNOSTICS_VERSION});
     return false;
   });
 }catch(_){return Promise.resolve(false);}
}
// Original boxing-style sounds, not extracted from any third-party app.
// Audio is unlocked on a direct button press; silence in the background is expected on iOS.
// RC11 studio recordings are TEST-only; production retains the approved originals.
const SOUND_PATHS=isPreview?{
 start:'./sounds/studio-gong-start.mp3',
 end:'./sounds/studio-gong-end.mp3',
 clack:'./sounds/woodclack-single.mp3',
 double:'./sounds/woodclack-double.mp3',
 button:'./sounds/button.mp3'
}:{start:'./sounds/gong-start.mp3',end:'./sounds/gong-end.mp3',clack:'./sounds/woodclack.mp3'};
const soundBuffers={};
let soundsLoading=null;
let activeSounds=createActiveSoundController();
const webRetirement=createWebAudioRetirement({
  getContext:()=>audioContext,
  reset:()=>{
    audioContext=null;
    soundsLoading=null;
    for(const key of Object.keys(soundBuffers))delete soundBuffers[key];
    // Release active nodes and any references to the old audio graph.
    activeSounds=createActiveSoundController();
  }
});
let webWasInterrupted=false;
// Test-only measurement of the first clack's browser playback-start latency.
// No telemetry is sent, and the approved audio files are not changed.
let firstClackMeasured=false;
const cueLatencyLabel=isPreview&&AUDIO_QA_CONTROLS?document.createElement('small'):null;
if(cueLatencyLabel){
  cueLatencyLabel.textContent='Первый щелчок: задержка ещё не измерена';
  cueLatencyLabel.style.cssText='grid-column:1/-1;font-size:.75rem;line-height:1.2;color:#c9d7e7';
  el.form.insertBefore(cueLatencyLabel,el.closeSettings);
}
// On the tested iPhone, HTML Audio + transient mixes with music without changing its volume.
const sessionMix=createAudioDucking({session:isPreview?navigator.audioSession:null,
  enabled:()=>isPreview&&audioMode==='html'&&musicMixEnabled});
const htmlSounds=isPreview&&typeof window.Audio==='function'?
  createHtmlAudioController({
    makeAudio:path=>new window.Audio(path),
    paths:SOUND_PATHS,
    isActive:()=>!document.hidden&&!audioInterruption.interrupted,
    onTiming:({kind,delayMs})=>{
      if(kind!=='clack1'||firstClackMeasured||!cueLatencyLabel)return;
      firstClackMeasured=true;
      cueLatencyLabel.textContent='Первый щелчок: '+delayMs+' мс (начало по браузеру)';
    },
    onError:()=>{
      if(!firstClackMeasured && cueLatencyLabel){
        cueLatencyLabel.textContent='Звук: запуск ограничен браузером iOS';
      }
      void diagnosticSender.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:DIAGNOSTICS_VERSION});
    },
  }):null;
if(isPreview && !htmlSounds)audioMode='web';
if(cueLatencyLabel)cueLatencyLabel.hidden=audioMode!=='html';

const delayedStartGong=createDelayedStartGuard({
  canPlay: context=>!!context.sessionRef && session===context.sessionRef &&
    session.status==='running' && !document.hidden && !audioInterruption.interrupted &&
    audioContext?.state==='running' && !!soundBuffers.start &&
    phaseNow().key===context.phaseKey && elapsedNow()<=3000,
  play: ()=>sound('start'),
});
function preloadSounds(){
 if(soundsLoading||!audioContext)return soundsLoading;
 const context=audioContext,token=webRetirement.generation;
 soundsLoading=Promise.all(Object.entries(SOUND_PATHS).map(async([name,url])=>{
   try{
     const resp=await fetch(url);
     if(!resp.ok)throw new Error('audio fetch failed');
     const raw=await resp.arrayBuffer();
     if(!webRetirement.isCurrent(context,token))return;
     const buffer=await context.decodeAudioData(raw);
     if(webRetirement.isCurrent(context,token))soundBuffers[name]=buffer;
   }catch(err){
     if(!webRetirement.isCurrent(context,token))return;
     console.warn('Audio not available',name,err);
     void diagnosticSender.report({event:'audio_failure',code:'ASSET_LOAD_FAILED',component:'audio',version:DIAGNOSTICS_VERSION});
   }
 }));return soundsLoading;
}
function sound(type){
 if(document.hidden||audioInterruption.interrupted)return;
 if(audioMode==='html' && htmlSounds){
   sessionMix.begin(); // Retain iOS mix through foreground PAUSE/RESET, not per cue.
   htmlSounds.play(type);
   return;
 }
 if(!audioContext||audioContext.state!=='running')return;
 const kind=type==='start'?'start':(type==='end'||type==='done')?'end':(isPreview&&type==='ten-double')?'clack':(isPreview&&type==='button')?'button':'clack';
 const sample=soundBuffers[kind];
 if(!sample){
   const loading=preloadSounds();
   if(type==='start'&&loading&&session)delayedStartGong.schedule(loading,{
     sessionRef:session,phaseKey:phaseNow().key
   });
   return;
 }
 const offsets=isPreview&&type==='ten-double'?[0,.142]:type==='slow-double'?[0,.25]:type==='double'?[0,.145]:[0];
 for(const offset of offsets){
   try {activeSounds.play({context:audioContext,buffer:sample,offset,volume:kind==='button'?.5832:kind==='clack'?.96:.9,category:kind==='button'?'button':'cue'});}
   catch(_){void diagnosticSender.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:DIAGNOSTICS_VERSION});}
 }
}
// Foreground PAUSE/RESET should not switch Safari from transient back to
// auto, since this interrupts other apps' background music on the iPhone.
function keepForegroundMix(){
 return isPreview&&audioMode==='html'&&musicMixEnabled&&!document.hidden;
}
function stopActiveAudio({fadeMs=16,preserveButton=false,preserveMix=false}={}){
 delayedStartGong.invalidate();
 activeSounds.stopAll({fadeMs,includeButton:!preserveButton});
 htmlSounds?.stopAll({includeButton:!preserveButton});
 if(!preserveMix)sessionMix.stop();
}
let audioRecoveryEpoch=0;
function showAudioRecovery(show){if(el.audioRecover)el.audioRecover.hidden=!show;}
const audioInterruption=createAudioInterruptionGuard({
 windowTarget:window,documentTarget:document,
 stop:reason=>{
   const web=isPreview&&audioMode==='web';
   // Stop queued sounds, but retain the unlocked context and decoded buffers.
   // Creating a fresh context without a direct tap can fail on iPhone Safari.
   stopActiveAudio({fadeMs:web?0:reason==='blur'?12:0});
   if(web)webWasInterrupted=true;
   ++audioRecoveryEpoch;
 },
});
function endWebBackgroundReturn(){
 if(!isPreview||audioMode!=='web'||document.hidden||audioInterruption.interrupted)return;
 if(!session||session.status!=='running'||phaseNow().type==='done'){
   webWasInterrupted=false;showAudioRecovery(false);return;
 }
 if(!webWasInterrupted&&audioContext?.state==='running')return;
 webWasInterrupted=false;
 const token=++audioRecoveryEpoch;
 let finished=false;
 // If WebKit cannot resume without a user gesture, show a small recovery tap.
 const timeout=setTimeout(()=>{
   if(!finished&&token===audioRecoveryEpoch&&!document.hidden)showAudioRecovery(true);
 },1500);
 void unlockAudio().then(ok=>{
   finished=true;clearTimeout(timeout);
   if(token!==audioRecoveryEpoch||document.hidden||!session||session.status!=='running')return;
   showAudioRecovery(!ok);
 }).catch(()=>{
   finished=true;clearTimeout(timeout);
   if(token===audioRecoveryEpoch&&!document.hidden)showAudioRecovery(true);
 });
}
window.addEventListener('focus',endWebBackgroundReturn);
el.audioRecover?.addEventListener('click',()=>{
  if(document.hidden)return;
  const token=++audioRecoveryEpoch;
  void unlockAudio().then(ok=>{
    if(token===audioRecoveryEpoch&&!document.hidden)showAudioRecovery(!ok);
  });
});
// Test host only: one-choice transport control, never rendered in production.
// A mode change is allowed during a running test, but pauses the clock
// first so that the sound transport never changes in the middle of a cue.
function pausePreviewForAudioChange(){
 if(!isPreview || !session || session.status!=='running')return false;
 stopActiveAudio({fadeMs:0});
 session.elapsedBeforeMs=elapsedNow();
 session.resumedAt=0;
 session.status='paused';
 releaseScreenOn();
 save();
 return true;
}
let audioModeSelect=null;
let musicMixLabel=null;
if(isPreview && AUDIO_QA_CONTROLS && htmlSounds){
 const label=document.createElement('label');
 label.textContent='ЗВУК ТАЙМЕРА · ТЕСТ';
 label.style.gridColumn='1/-1';
 const select=document.createElement('select');
 for(const [value,title] of [['html','HTML Audio (для музыки)'],['web','Web Audio (сравнение)']]){
   const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);
 }
 select.value=audioMode;label.append(select);
 el.form.insertBefore(label,el.closeSettings);
 select.addEventListener('change',()=>{
   pausePreviewForAudioChange();
   stopActiveAudio({fadeMs:0});
   audioMode=select.value==='web'?'web':'html';
   // On a user-initiated mode change, prepare Web Audio before subsequent taps.
   if(audioMode==='web')unlockAudio();
   if(cueLatencyLabel)cueLatencyLabel.hidden=audioMode!=='html';
   if(musicMixLabel)musicMixLabel.hidden=audioMode!=='html';
   try{localStorage.setItem(PREVIEW_AUDIO_KEY,audioMode);}catch(_){}
   draw({notify:false});
 });
 audioModeSelect=select;
}
let musicMixSelect=null;
if(isPreview && AUDIO_QA_CONTROLS){
  const label=document.createElement('label');
  label.textContent='МУЗЫКА ПРИ СИГНАЛАХ · RC7';
  label.style.gridColumn='1/-1';
  const select=document.createElement('select');
  for(const [value,title] of [
    ['on','ВКЛ · совместный режим на весь раунд'],
    ['off','ВЫКЛ · музыка может прерваться']
  ]){
    const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);
  }
  select.value=musicMixEnabled?'on':'off';
  if(!sessionMix.supported){
    select.value='off';select.disabled=true;musicMixEnabled=false;
    label.textContent='СОВМЕСТНЫЙ ЗВУК НЕДОСТУПЕН НА ЭТОМ iOS';
  }
  label.append(select);
  label.hidden=audioMode!=='html';
  el.form.insertBefore(label,el.closeSettings);
  select.addEventListener('change',()=>{
    pausePreviewForAudioChange();
    sessionMix.stop();
    musicMixEnabled=select.value==='on'&&sessionMix.supported;
    try{localStorage.setItem(PREVIEW_MUSIC_KEY,musicMixEnabled?'on':'off');}catch(_){}
    draw({notify:false});
  });
  musicMixLabel=label;musicMixSelect=select;
}
if(isPreview && AUDIO_QA_CONTROLS){
  const tip=document.createElement('small');
  tip.textContent='Смена звука автоматически ставит таймер на паузу';
  tip.style.cssText='grid-column:1/-1;font-size:.72rem;color:#c9d7e7;line-height:1.2';
  el.form.insertBefore(tip,el.closeSettings);
}
async function ensureScreenOn(){if(!('wakeLock' in navigator)||document.hidden||!session||session.status!=='running')return;if(wakeLock&&!wakeLock.released)return;try{wakeLock=await navigator.wakeLock.request('screen');}catch(_){}}
async function releaseScreenOn(){if(!wakeLock)return;try{await wakeLock.release();}catch(_){}wakeLock=null;}
// Fixed reference measurement prevents seconds changing the physical width of the display.
let lastClockLayout='';
function fitClock(force=false){
 const frame=el.clock.parentElement;
 if(!frame||!frame.clientWidth||!frame.clientHeight)return;
 const portrait=window.matchMedia('(orientation: portrait)').matches;
 const key=[frame.clientWidth,frame.clientHeight,window.innerWidth,window.innerHeight,window.visualViewport?.height||0,portrait].join(':');
 if(!force && key===lastClockLayout)return;
 lastClockLayout=key;
 const ctx=(fitClock.canvas||(fitClock.canvas=document.createElement('canvas'))).getContext('2d');
 const st=getComputedStyle(el.clock);
 ctx.font=`900 100px ${st.fontFamily}`;
 const raw=ctx.measureText('88:88').width-100*.055*4;
 const scaleX=portrait?(isPreview?1.51:1.2):(isPreview?2.23:1.587),scaleY=portrait?(isPreview?4.05:4.3164):(isPreview?1.79:1.587);
 // In landscape the expanded round count must not force a smaller or cropped clock.
 // RC19: fill more available width in both orientations while retaining
 // a small physical inset; the fitted font shrinks before any clipping.
 const byWidth=(frame.clientWidth*(isPreview?.965:.98))/(raw/100)/scaleX;
 const byHeight=(frame.clientHeight*(isPreview?(portrait?1.01:.985):.95))/scaleY;
 const size=Math.max(15,Math.min(byWidth,byHeight,620));
 el.clock.style.fontSize=`${size}px`;
 fitLabels();
}
function fitLabels(){
 const portrait=window.matchMedia('(orientation: portrait)').matches;
 const ctx=(fitClock.labelCanvas||(fitClock.labelCanvas=document.createElement('canvas'))).getContext('2d');
 if(el.roundCount){
  const st=getComputedStyle(el.round);
  // Use a compact landscape round heading so the clock receives maximal height.
   let base=portrait?window.innerWidth*.068:window.innerHeight*.037;
  base=Math.max(12,Math.min(base,32));
  ctx.font=`900 ${base}px ${st.fontFamily}`;
  const wordWidth=ctx.measureText('РАУНД').width;
  ctx.font=`900 ${base*4.5}px ${st.fontFamily}`;
  const fraction=el.roundCurrent&&el.roundTotal?`${el.roundCurrent.textContent}/${el.roundTotal.textContent}`:el.roundCount.textContent||'12/12';
   const numberWidth=ctx.measureText(fraction).width;
  const total=wordWidth+numberWidth+base*.32;
  const max=(el.round.parentElement.clientWidth||window.innerWidth)*.94;
  if(total>max)base*=max/total;
  el.round.style.fontSize=`${Math.max(10,base)}px`;
 }
 for(const label of [el.phase]){
  const st=getComputedStyle(label),root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
  const ideal=portrait?window.innerWidth*(isPreview?.081:.073):window.innerHeight*(isPreview?.057:.05);
  let size=Math.max(root*.82,Math.min(ideal,root*4.6));
  ctx.font=`900 ${size}px ${st.fontFamily}`;
  const expected=label.textContent||'ПОДГОТОВКА';
  const max=label.parentElement.clientWidth*.96;
  const w=ctx.measureText(expected).width;
  if(w>max)size*=max/w;
  label.style.fontSize=`${Math.max(12,size)}px`;
 }
}
window.addEventListener('resize',()=>{lastClockLayout='';fitClock(true);});
window.addEventListener('orientationchange',()=>{lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
// Re-evaluate iOS viewport on returning from Home; never change timer clock.
window.visualViewport?.addEventListener?.('resize',()=>{lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
window.addEventListener('focus',()=>{lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
if('ResizeObserver' in window)new ResizeObserver(()=>fitClock()).observe(el.clock.parentElement);
function draw({notify=true}={}) {
  const phase=session?phaseNow():computePhase({...config,prepare:0},0);
  const type=session?phase.type:'idle';
  // Foreground HTML cues get a small lead to offset Safari playback startup.
  // Visual time and phase-change gongs remain unshifted.
  const cuePhase=session&&session.status==='running'&&isPreview&&audioMode==='html'
    ?computePhase(config,elapsedNow()+250):phase;
  document.body.className=`phase-${type}${el.settings.open?' settings-visible':''}`;
  const roundNumbers=`${phase.round}/${phase.rounds==='infinity'?'∞':phase.rounds}`;
  if(el.roundCurrent && el.roundTotal){
    el.roundCurrent.textContent=String(phase.round);
    el.roundTotal.textContent=phase.rounds==='infinity'?'∞':String(phase.rounds);
    el.roundCount?.setAttribute?.('aria-label',`Раунд ${roundNumbers}`);
  }else if(el.roundCount)el.roundCount.textContent=roundNumbers;
  else el.round.textContent=`РАУНД ${roundNumbers}`;
  el.clock.textContent=formatTime(phase.remainingMs);
  fitClock();
  el.phase.textContent={prepare:'ПОДГОТОВКА',work:'РАБОТА',rest:'ОТДЫХ',done:'ЗАВЕРШЕНО',idle:'ГОТОВ К СТАРТУ'}[type];
  fitLabels();
  const duration=phase.durationMs||1;
  el.progress.style.width=type==='done'?'100%':`${Math.max(0,Math.min(100,100*(1-phase.remainingMs/duration)))}%`;
  const action=!session?'▶ СТАРТ':type==='done'?'↻ ЗАНОВО':session.status==='running'?'Ⅱ ПАУЗА':'▶ ПРОДОЛЖИТЬ';
  el.start.textContent=action;
  el.start.disabled=!!el.settings.open;
  el.reset.disabled=!!el.settings.open;
  const locked=!!session&&type!=='done';
  for(const input of [el.work,el.rest,el.rounds,el.prepare])input.disabled=locked;
  // Unlike workout duration fields, audio QA settings stay selectable.
  if(audioModeSelect)audioModeSelect.disabled=false;
  if(musicMixSelect)musicMixSelect.disabled=audioMode!=='html'||!sessionMix.supported;
  // Keep test Settings open even during a running timer so the user can switch
  // audio engines. Production preserves its original close-on-start behavior.
  if(locked&&el.settings.open&&!isPreview)el.settings.open=false;
  if(session&&session.status==='running'&&type==='done')releaseScreenOn();
  if(notify&&session&&session.status==='running'&&lastPhase&&!document.hidden){
    if(phase.key!==lastPhase.key){
      // Never replay a stale gong if WebKit delivers the phase-change callback
      // seconds late after the user returns to the app.
      const lateByMs=phase.type==='done'
        ?Math.max(0,elapsedNow()-phase.totalMs)
        :phase.durationMs-phase.remainingMs;
      if(isCueFresh(lateByMs)){
        if(phase.type==='work')sound('start');
        else if(phase.type==='rest')sound('end');
        else if(phase.type==='done')sound('end');
      }
    } else {
      // A single threshold crossed two seconds late is still a late signal.
      const ticks=crossedCountdown(lastCuePhase||lastPhase,cuePhase);
      if(ticks.length===1 && isCueFresh(ticks[0]*1000-cuePhase.remainingMs))
        sound(isPreview?(ticks[0]===10?'ten-double':'single'):(ticks[0]===30||ticks[0]===10)?'slow-double':'single');
    }
  }
  lastPhase=session?phase:null;
  lastCuePhase=session?cuePhase:null;
}
function startPause(){
  if(el.settings.open)return false;
  let startupCuePlayed=false;
  // Every button action invalidates delayed initial gong requests.
  delayedStartGong.invalidate();
  const current=session&&phaseNow();
  if(!session||current?.type==='done'){
    stopActiveAudio({preserveMix:keepForegroundMix()});
    firstClackMeasured=false;
    if(cueLatencyLabel)cueLatencyLabel.textContent='Первый щелчок: задержка ещё не измерена';
    const ready=unlockAudio();
    config=readConfig();updateInputs(config);
    session={status:'running',config,elapsedBeforeMs:0,resumedAt:Date.now()};
    el.settings.open=false;lastPhase=null;lastCuePhase=null;
    showAudioRecovery(false);++audioRecoveryEpoch;
    if(config.prepare===0){
      if(audioContext?.state==='running'&&soundBuffers.start)sound('start');
      else delayedStartGong.schedule(ready,{sessionRef:session,phaseKey:phaseNow().key});
    }else if(config.prepare<=5)sound('single');
    startupCuePlayed=config.prepare<=5;
    ensureScreenOn();
  } else if(session.status==='running'){
    showAudioRecovery(false);++audioRecoveryEpoch;
    stopActiveAudio({preserveButton:isPreview,preserveMix:keepForegroundMix()});
    session.elapsedBeforeMs=elapsedNow();session.resumedAt=0;session.status='paused';releaseScreenOn();
  } else {unlockAudio();session.status='running';session.resumedAt=Date.now();ensureScreenOn();}
  save();draw({notify:false});
  return startupCuePlayed;
}
function reset(){if(el.settings.open)return;showAudioRecovery(false);++audioRecoveryEpoch;stopActiveAudio({preserveButton:isPreview,preserveMix:keepForegroundMix()});session=null;lastPhase=null;lastCuePhase=null;config=readConfig();save();releaseScreenOn();draw({notify:false});}
function buttonSound(){
 if(!isPreview||document.hidden||audioInterruption.interrupted)return false;
 if(audioMode==='html'&&htmlSounds){
   sessionMix.begin();
   return htmlSounds.playButton();
 }
 // Unlock Web Audio inside the actual pointer gesture. The very first tap
 // may still be silent until decoding completes; never play it back late.
 if(!audioContext||audioContext.state!=='running')unlockAudio();
 sound('button');
 return true;
}
// Pointerdown plays the button sound in the direct iOS user gesture.
// The later click performs the operation and does not play a duplicate.
function bindFastPress(target,action,{allowed=()=>true,suppress=()=>false}={}){
 let pressed=false;
 target?.addEventListener('pointerdown',event=>{
   if(event.isPrimary===false||!allowed()||suppress())return;
   pressed=buttonSound();
 });
 target?.addEventListener('pointercancel',()=>{pressed=false;});
 target?.addEventListener('click',()=>{
   const played=pressed;pressed=false;
   if(!allowed())return;
   const skip=suppress();
   action?.();
   if(!skip&&!played)buttonSound();
 });
}
function willStartCue(){
 const phase=session&&phaseNow();
 return (!session||phase?.type==='done')&&readConfig().prepare<=5;
}
bindFastPress(el.start,()=>startPause(),{allowed:()=>!el.settings.open,suppress:willStartCue});
bindFastPress(el.reset,()=>reset(),{allowed:()=>!el.settings.open});
el.form.addEventListener('change',()=>{if(!session){config=readConfig();draw({notify:false});}});
el.settings.addEventListener('toggle',()=>{
 document.body.classList.toggle('settings-visible',el.settings.open);
 el.start.disabled=!!el.settings.open;
 el.reset.disabled=!!el.settings.open;
 lastClockLayout='';requestAnimationFrame(()=>fitClock(true));
});
bindFastPress(el.closeSettings,()=>{el.settings.open=false;lastClockLayout='';requestAnimationFrame(()=>fitClock(true));});
bindFastPress(el.settings.querySelector?.('summary'),()=>{});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&el.settings.open)el.settings.open=false;});
el.form.addEventListener('submit',event=>event.preventDefault());
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){wasHidden=true;lastPhase=null;save();}
  else{
    endWebBackgroundReturn();
    lastClockLayout='';
    draw({notify:false});
    requestAnimationFrame(()=>fitClock(true));
    ensureScreenOn();
    wasHidden=false;
  }
});
window.addEventListener('pageshow',()=>{
  endWebBackgroundReturn();
  lastClockLayout='';
  draw({notify:false}); // Never replay any skipped background gong/clacks.
  requestAnimationFrame(()=>fitClock(true));
});
window.addEventListener('pagehide',save);
updateInputs(config);restore();draw({notify:false});
// A force-quit can restore a running countdown without an unlocked context.
if(session?.status==='running'&&audioMode==='web')showAudioRecovery(true);
setInterval(()=>{if(!document.hidden)draw({notify:true});},100);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
