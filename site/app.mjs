import {createDiagnosticSender,attachBrowserErrorCapture,productionDiagnosticEndpoint} from './diagnostics/sender.mjs';
import {createDelayedStartGuard,createActiveSoundController,createAudioInterruptionGuard,isCueFresh} from './audio-guard.mjs';
import {createHtmlAudioController} from './html-audio.mjs';
import {createWebAudioRetirement} from './web-audio-retire.mjs';
import {createAudioDucking} from './audio-duck.mjs';
import {createAudioClockWatchdog,pulseStalledContext} from './audio-clock-watchdog.mjs';
import {cp18WindowFromSearch,deferredButtonCueAllowed} from './cp18-audio-window.mjs';
import {CP19_MODES,cp19Mode,cp19Paths,cp19PrimeAudio,cp19CanPlayStartCue} from './cp19-audio-modes.mjs';
import {createCP19KeepAlive} from './cp19-keepalive.mjs';
import {createCP19WorkletHost} from './cp19-worklet-host.mjs';
import {createCP19Haptics} from './cp19-haptics.mjs';
import {createCP19WheelPicker} from './cp19-wheel-picker.mjs';
import {fitCP19Clock} from './preview-variants-clock-fit.mjs';
import {prewarmButtonFirst} from './preview-audio-prewarm.mjs';
import {ensureAmbientAudioSession} from './preview-ambient-audio-session.mjs';
const PREVIEW_VARIANT=/\/preview-(graphite-musicfix|graphite-deck|graphite-prewarm|graphite-v2|graphite|classic)\.html$/.exec(globalThis.location?.pathname||'')?.[1]||null;
const PREVIEW_MAIN_HOME=/(?:\/|\/index\.html|\/test-f\.html)$/.test(globalThis.location?.pathname||'')
 && !new URLSearchParams(globalThis.location?.search||'').has('cp18')
 && !new URLSearchParams(globalThis.location?.search||'').has('cp19');
const PREVIEW_MUSIC_FIX=PREVIEW_VARIANT==='graphite-musicfix'||PREVIEW_MAIN_HOME;
const PREVIEW_CONTROL_DECK=PREVIEW_VARIANT==='graphite-deck'||PREVIEW_MUSIC_FIX||PREVIEW_MAIN_HOME;
const PREVIEW_PREWARM=PREVIEW_CONTROL_DECK||PREVIEW_VARIANT==='graphite-prewarm';
const CP19_F_LAUNCH=(globalThis.location?.pathname||'').endsWith('/test-f.html')||!!PREVIEW_VARIANT;
const CP19_F_ROOT_DEFAULT=/(?:\/|\/index\.html)$/.test(globalThis.location?.pathname||'') && !new URLSearchParams(globalThis.location?.search||'').has('cp18') && !new URLSearchParams(globalThis.location?.search||'').has('cp19');
const CP19_MODE=(CP19_F_LAUNCH||CP19_F_ROOT_DEFAULT)?'wav-keepalive':cp19Mode(globalThis.location?.search||'');
const CP19=CP19_MODE===null?null:CP19_MODES[CP19_MODE];
const CP19F_UX=CP19_MODE==='wav-keepalive';
if(CP19F_UX)document.documentElement?.classList?.add?.('cp19f-ux');
if(CP19F_UX&&PREVIEW_MUSIC_FIX){
 const applyAmbient=()=>{
  const result=ensureAmbientAudioSession(navigator);
  const indicator=document.getElementById('ambientMixStatus');
  if(indicator)indicator.textContent=
   result.applied?'Apple Music: режим совместного воспроизведения запрошен (проверь на iPhone)':
   'Apple Music: ambient недоступен — совместимость не подтверждена';
 };
 // Set ambient BEFORE creating AudioContext or preloading HTMLAudioElement.
 applyAmbient();
 // Reapply only when necessary, before each real tap and after foreground return.
 document.addEventListener('pointerdown',event=>{if(event.isTrusted)applyAmbient();},{capture:true,passive:true});
 window.addEventListener('pageshow',applyAmbient);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyAmbient();});
}
const CP19_VERSION=CP19F_UX?(PREVIEW_MAIN_HOME?'0.8.20.18-MAIN':PREVIEW_MUSIC_FIX?'0.8.20.15-MUSIC':PREVIEW_MAIN_HOME?'0.8.20.14-MAIN':PREVIEW_CONTROL_DECK?'0.8.20.13-DECK':PREVIEW_PREWARM?'0.8.20.12-PW':PREVIEW_VARIANT==='graphite-v2'?'0.8.20.11-A2':PREVIEW_VARIANT?`0.8.20.10-${PREVIEW_VARIANT==='graphite'?'A':'B'}`:'0.8.20.9'):'0.8.19.4';
const CP18_BUTTON_WINDOW_MS=CP19?null:cp18WindowFromSearch(globalThis.location?.search||'');
const DIAGNOSTICS_VERSION='0.8.20.18';
const diagnosticSender=createDiagnosticSender({
  endpoint:productionDiagnosticEndpoint(globalThis.location,'https://round-timer-error-receiver.mastyukov.workers.dev/v1/error')
});
attachBrowserErrorCapture({target:window,sender:diagnosticSender,version:DIAGNOSTICS_VERSION});
// Error-only telemetry; no usage, no personal information and no UI changes.
import {normalizeConfig,computePhase,formatTime,WORK_CHOICES,REST_CHOICES,ROUND_CHOICES,PREPARE_CHOICES,crossedCountdown,cueForPhaseTransition} from './engine.mjs';
const STORAGE_KEY=CP19?`timer-active-session-cp19-${CP19_MODE}-v1`:(CP18_BUTTON_WINDOW_MS===null?'timer-active-session-v1':`timer-active-session-cp18-${CP18_BUTTON_WINDOW_MS}-v1`);
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

const SOUND_KEY='round-timer-cp19f-sound-toggle-v1';
const SETTINGS_KEY=CP19F_UX?'round-timer-cp19f-settings-v1':null;
let soundEnabled=true;
if(CP19F_UX){try{soundEnabled=localStorage.getItem(SOUND_KEY)!=='off';}catch(_){}}
const cp19Haptics=CP19F_UX?createCP19Haptics({navigatorRef:navigator}):null;
if(CP19F_UX)document.addEventListener('pointerdown',event=>{
 const target=event.target?.closest?.('button,summary');
 if(!target||target.disabled)return;
 target.classList.remove('cp19f-touch');void target.offsetWidth;
 target.classList.add('cp19f-touch');
 target.addEventListener('animationend',()=>target.classList.remove('cp19f-touch'),{once:true});
},{capture:true,passive:true});
const byId=id=>document.getElementById(id);
if(CP19){
 const label=document.querySelector?.('.preview-version');
 if(label)label.textContent=PREVIEW_MAIN_HOME?'미하일 0.8.20.18':`미하일 ${CP19_VERSION} · TEST ${CP19.label}`;
}else if(CP18_BUTTON_WINDOW_MS!==null){
 const label=document.querySelector?.('.preview-version');
 if(label)label.textContent=`미하일 0.8.19.3 · TEST ${CP18_BUTTON_WINDOW_MS} мс`;
}
const el={work:byId('workInput'),rest:byId('restInput'),rounds:byId('roundsInput'),prepare:byId('prepareInput'),clock:byId('clock'),round:byId('roundLabel'),roundCount:byId('roundCount'),roundCurrent:byId('roundCurrent'),roundTotal:byId('roundTotal'),phase:byId('phaseLabel'),progress:byId('progressBar'),start:byId('startPauseButton'),reset:byId('resetButton'),settings:byId('settings'),closeSettings:byId('closeSettingsButton'),audioRecover:byId('audioRecoveryButton'),form:byId('settingsForm'),soundControl:byId('soundControl'),soundToggle:byId('soundToggle')};
function durationLabel(sec) {
  if(sec===0) return '0 секунд';
  const min=Math.floor(sec/60), remainder=sec%60;
  if(!min) return `${sec} секунд`;
  if(!remainder) return `${min} ${min===1?'минута':min>=2&&min<=4?'минуты':'минут'}`;
  return `${min} мин ${remainder} сек`;
}
for(const [element,choices] of [[el.work,WORK_CHOICES],[el.rest,REST_CHOICES],[el.rounds,ROUND_CHOICES],[el.prepare,PREPARE_CHOICES]]) {
  for(const c of choices) {const option=document.createElement('option');option.value=String(c);option.textContent=c==='infinity'?'∞':element===el.rounds?String(c):durationLabel(c);element.append(option);}
}
const cp19Wheel=CP19F_UX?createCP19WheelPicker({form:el.form,ids:['workInput','roundsInput','prepareInput','restInput'],feedback:cp19Haptics}):null;
function renderSoundToggle(){
 if(!el.soundToggle)return;
 el.soundToggle.textContent=soundEnabled?'ВКЛ':'ВЫКЛ';
 el.soundToggle.dataset.sound=soundEnabled?'on':'off';
 el.soundToggle.setAttribute('aria-checked',String(soundEnabled));
}
if(el.soundControl)el.soundControl.hidden=!CP19F_UX;
renderSoundToggle();
el.soundToggle?.addEventListener('click',()=>{
 if(!CP19F_UX)return;
 const next=!soundEnabled;
 if(!next){
  ++buttonCueEpoch;
  delayedStartGong.invalidate();
  stopActiveAudio({fadeMs:0,preserveMix:true});
  cp19KeepAlive.stop();
 }
 soundEnabled=next;
 try{localStorage.setItem(SOUND_KEY,soundEnabled?'on':'off');}catch(_){}
 renderSoundToggle();
 // Apple Music is external and must never be paused or ducked by this control.
 if(soundEnabled){
  cp19Gesture();
  // The very first ON tap may occur before the WAV buffer has decoded.
  // Use the already preloaded original button sample as a direct-gesture fallback.
  // Never invoke an external music pause or change another app's volume.
  if(audioMode==='web'&&!soundBuffers.button){
   if(!htmlSounds?.playButton())buttonSound();
  }else buttonSound();
 }
});
let config=normalizeConfig({work:60}),session=null,lastPhase=null,lastCuePhase=null,audioContext=null,wakeLock=null,wasHidden=false;
const cp19KeepAlive=createCP19KeepAlive();
const cp19Worklet=createCP19WorkletHost();
let cp19WorkletBusy=false;
function cp19Status(message){
 if(!CP19)return;
 const el=document.querySelector?.('.preview-version');
 if(el)el.textContent=PREVIEW_MAIN_HOME?'미하일 0.8.20.18':`미하일 ${CP19_VERSION} · TEST ${CP19.label} · ${message}`;
}
function cp19Gesture(event){
 if(!CP19||document.hidden||!soundEnabled||event?.target?.closest?.('#soundToggle'))return;
 // Controls with their own first-tap sound must not be delayed by global
 // WebAudio resume/decode in capturing pointerdown. They unlock after playback.
 if(CP19F_UX&&event?.target?.closest?.('button,summary'))return;
 audioGestureSeen=true;
 try{
  if(audioContext?.state==='closed')webRetirement.retire();
  audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
  if(CP19.prime)cp19PrimeAudio(audioContext);
  void unlockAudio();
 }catch(_){}
}
if(CP19?.prime)document.addEventListener('pointerdown',cp19Gesture,{capture:true});
function readConfig(){return normalizeConfig({work:el.work.value,rest:el.rest.value,rounds:el.rounds.value,prepare:el.prepare.value});}
function updateInputs(c){el.work.value=c.work;el.rest.value=c.rest;el.rounds.value=c.rounds;el.prepare.value=c.prepare;cp19Wheel?.refresh();}
function restoreSavedSettings(){
 if(!SETTINGS_KEY)return;
 try{
  const raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))config=normalizeConfig(raw);
 }catch(_){}
}
function save(){try{
 if(SETTINGS_KEY)localStorage.setItem(SETTINGS_KEY,JSON.stringify(config));
 if(session)localStorage.setItem(STORAGE_KEY,JSON.stringify(session));
 else localStorage.removeItem(STORAGE_KEY);
}catch(_){}}
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
 if(!soundEnabled)return Promise.resolve(false);
  if(audioMode==='html')return Promise.resolve(false);
 try{
   if(audioContext?.state==='closed')webRetirement.retire();
   audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
   const context=audioContext,token=webRetirement.generation;
   const resume=context.state==='running'?Promise.resolve():context.resume();
   return Promise.resolve(resume).then(async()=>{
     if(!webRetirement.isCurrent(context,token)||document.hidden||context.state!=='running')return false;
     await preloadSounds();
     if(!webRetirement.isCurrent(context,token)||context.state!=='running'||!soundBuffers.start)return false;
     if(CP19&&Object.keys(SOUND_PATHS).some(name=>!soundBuffers[name])){
      cp19Status('загрузка звуков не завершена');return false;
     }
     if(CP19?.transport==='worklet'){
      const ok=await cp19Worklet.prepare(context,soundBuffers);
      if(!ok){cp19Status('AudioWorklet недоступен');return false;}
     }
     if(CP19?.keepalive)cp19KeepAlive.start(context);
     if(CP19)cp19Status('звук готов');
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
// Browser instrumentation: not a real microphone measurement, never uploads data.
let firstButtonPointerAt=null,firstButtonPlayingReported=false,prewarmBufferReady=false;
const prewarmReadout=PREVIEW_PREWARM&&!PREVIEW_CONTROL_DECK?document.createElement('small'):null;
if(prewarmReadout){
 prewarmReadout.className='prewarm-readout';
 prewarmReadout.style.cssText='grid-column:1/-1;color:#c5d6e5;font-size:.73rem;line-height:1.35;padding:0 2px';
 prewarmReadout.textContent='Audio Prewarm: декодирование кнопки… (без воспроизведения)';
 el.form.insertBefore(prewarmReadout,el.closeSettings);
 document.addEventListener('pointerdown',event=>{
  if(firstButtonPointerAt===null&&event.isTrusted&&event.target?.closest?.('button,summary'))
   firstButtonPointerAt=performance.now();
 },{capture:true,passive:true});
}
const SOUND_PATHS=CP19?cp19Paths(CP19.codec):isPreview?{
 start:'./sounds/studio-gong-start.mp3',
 end:'./sounds/studio-gong-end.mp3',
 clack:'./sounds/woodclack-single.mp3',
 double:'./sounds/woodclack-double.mp3',
 button:'./sounds/button.mp3'
}:{start:'./sounds/gong-start.mp3',end:'./sounds/gong-end.mp3',clack:'./sounds/woodclack.mp3'};
const soundBuffers={};
let soundsLoading=null;
let audioGestureSeen=false;
let buttonCueEpoch=0;
let activeSounds=createActiveSoundController();
const webRetirement=createWebAudioRetirement({
  getContext:()=>audioContext,
  reset:()=>{
    cp19KeepAlive.stop();cp19Worklet.reset();
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
    makeAudio:path=>{
      const player=new window.Audio(path);
      if(PREVIEW_PREWARM&&path===SOUND_PATHS.button)
       player.addEventListener('playing',()=>{
         if(firstButtonPlayingReported||firstButtonPointerAt===null)return;
         firstButtonPlayingReported=true;
         const delay=Math.round(performance.now()-firstButtonPointerAt);
         if(prewarmReadout)prewarmReadout.textContent=
          'Первый звук: '+delay+' мс до playing (по браузеру; не замер динамика). Буфер '+(prewarmBufferReady?'готов':'ещё готовился');
       },{once:true});
      return player;
    },
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
  canPlay: context=>soundEnabled && !!context.sessionRef && session===context.sessionRef &&
    session.status==='running' && !document.hidden && !audioInterruption.interrupted &&
    audioContext?.state==='running' && !!soundBuffers.start &&
    phaseNow().key===context.phaseKey && elapsedNow()<=(CP19?150:3000) &&
    (!CP19||CP19.transport!=='worklet'||cp19Worklet.ready),
  play: ()=>sound('start'),
});
function preloadSounds(){
 if(soundsLoading||!audioContext)return soundsLoading;
 const context=audioContext,token=webRetirement.generation;
 // Fetch/decode the short button sample first on cold launch.
 const soundEntries=Object.entries(SOUND_PATHS);
 if(CP19)soundEntries.sort(([a],[b])=>Number(b==='button')-Number(a==='button'));
 const decodeEntry=async([name,url])=>{
   try{
     const resp=await fetch(url);
     if(!resp.ok)throw new Error('audio fetch failed');
     const raw=await resp.arrayBuffer();
     if(!webRetirement.isCurrent(context,token))return;
     const buffer=await context.decodeAudioData(raw);
     if(webRetirement.isCurrent(context,token)){
      soundBuffers[name]=buffer;
      if(PREVIEW_PREWARM&&name==='button'){
       prewarmBufferReady=true;
       if(prewarmReadout&&!firstButtonPlayingReported)prewarmReadout.textContent=
        'Audio Prewarm: кнопка декодирована заранее; первое касание активирует звук';
      }
     }
   }catch(err){
     if(!webRetirement.isCurrent(context,token))return;
     console.warn('Audio not available',name,err);
     void diagnosticSender.report({event:'audio_failure',code:'ASSET_LOAD_FAILED',component:'audio',version:DIAGNOSTICS_VERSION});
   }
 };
 // Experiment: load+decode button completely before competing cue fetches.
 // Existing A2 uses Promise.all; do not alter main timer or release behavior.
 soundsLoading=(PREVIEW_PREWARM?prewarmButtonFirst(soundEntries,decodeEntry):
  Promise.all(soundEntries.map(decodeEntry))).then(()=>{
  if(CP19&&Object.keys(SOUND_PATHS).some(name=>!soundBuffers[name])&&webRetirement.isCurrent(context,token))soundsLoading=null;
 });return soundsLoading;
}
function sound(type){
 if(!soundEnabled||document.hidden||audioInterruption.interrupted)return false;
 if(audioMode==='html'&&htmlSounds){
   sessionMix.begin();
   return htmlSounds.play(type);
 }
 if(!audioContext||audioContext.state!=='running')return false;
 const kind=type==='start'?'start':(type==='end'||type==='done')?'end':(isPreview&&type==='ten-double')?'clack':(isPreview&&type==='button')?'button':'clack';
 const sample=soundBuffers[kind];
 if(!sample){
   const loading=preloadSounds();
   if(type==='start'&&loading&&session)delayedStartGong.schedule(loading,{
     sessionRef:session,phaseKey:phaseNow().key
   });
   return false;
 }
 const offsets=isPreview&&type==='ten-double'?[0,.478]:type==='slow-double'?[0,.25]:type==='double'?[0,.155]:[0];
 if(CP19?.transport==='worklet'){
  if(!cp19Worklet.ready){void unlockAudio();return false;}
  return cp19Worklet.play({name:kind,offsets,volume:kind==='button'?.1944:kind==='clack'?.96:.9,category:kind==='button'?'button':'cue'});
 }
 let played=false;
 for(const offset of offsets){
   try{
     activeSounds.play({context:audioContext,buffer:sample,offset,volume:kind==='button'?.1944:kind==='clack'?.96:.9,category:kind==='button'?'button':'cue'});
     played=true;
   }catch(_){
     void diagnosticSender.report({event:'audio_failure',code:'AUDIO_PLAY_REJECTED',component:'audio',version:DIAGNOSTICS_VERSION});
   }
 }
 return played;
}
// Foreground PAUSE/RESET should not switch Safari from transient back to
// auto, since this interrupts other apps' background music on the iPhone.
function keepForegroundMix(){
 return isPreview&&audioMode==='html'&&musicMixEnabled&&!document.hidden;
}
function stopActiveAudio({fadeMs=16,preserveButton=false,preserveMix=false}={}){
 delayedStartGong.invalidate();
 activeSounds.stopAll({fadeMs,includeButton:!preserveButton});
 if(CP19?.transport==='worklet')cp19Worklet.stopAll();
 htmlSounds?.stopAll({includeButton:!preserveButton});
 if(!preserveMix)sessionMix.stop();
}
let audioRecoveryEpoch=0;
let audioClockNeedsGesture=false;
function showAudioRecovery(show){if(el.audioRecover)el.audioRecover.hidden=!show;}
const audioInterruption=createAudioInterruptionGuard({
 windowTarget:window,documentTarget:document,
 stop:reason=>{
   const web=isPreview&&audioMode==='web';
   // Stop queued sounds, but retain the unlocked context and decoded buffers.
   // Creating a fresh context without a direct tap can fail on iPhone Safari.
   stopActiveAudio({fadeMs:web?0:reason==='blur'?12:0});
   if(CP19?.keepalive)cp19KeepAlive.stop();
   if(web)webWasInterrupted=true;
   audioClockWatchdog.resetEpoch();
   ++audioRecoveryEpoch;
 },
});

// TEST-only watchdog for an iOS WebKit AudioContext with state='running'
// while its audio rendering clock no longer advances. Never replay past cues.
const audioClockWatchdog=createAudioClockWatchdog({
 getContext:()=>audioContext,
 // iOS can freeze the audio clock even if the workout was never started.
 isEligible:()=>isPreview&&audioMode==='web'&&audioGestureSeen&&
  !document.hidden&&!audioInterruption.interrupted&&
  !audioClockNeedsGesture&&!!audioContext,
 onStall:ctx=>{
  if(ctx!==audioContext)return;
  console.warn('[RT AUDIO TEST] running clock frozen; one bounded recovery');
  void recoverFrozenAudio(ctx);
 }
});
async function recoverFrozenAudio(ctx){
 const token=++audioRecoveryEpoch;
 const stillCurrent=()=>token===audioRecoveryEpoch&&ctx===audioContext&&
  !document.hidden&&!audioInterruption.interrupted&&audioGestureSeen;
 if(!stillCurrent())return;
 const ok=await pulseStalledContext(ctx,{
  isCurrent:stillCurrent,timeoutMs:900,settleMs:420
 });
 if(!stillCurrent())return;
 audioClockNeedsGesture=!ok;
 showAudioRecovery(!ok);
 console.warn('[RT AUDIO TEST] clock recovery',ok?'PASS':'NEEDS USER TAP');
}
function endWebBackgroundReturn(){
 if(!isPreview||audioMode!=='web'||document.hidden||audioInterruption.interrupted)return;
 // No need to unlock a site the user has never interacted with.
 if(!audioGestureSeen)return;
 if(!webWasInterrupted&&audioContext?.state==='running')return;
 webWasInterrupted=false;
 audioClockWatchdog.resetEpoch();
 const token=++audioRecoveryEpoch;
 let finished=false;
 const timeout=setTimeout(()=>{
   if(!finished&&token===audioRecoveryEpoch&&!document.hidden)showAudioRecovery(true);
 },1500);
 void unlockAudio().then(ok=>{
   finished=true;clearTimeout(timeout);
   if(token!==audioRecoveryEpoch||document.hidden)return;
   showAudioRecovery(!ok);
 }).catch(()=>{
   finished=true;clearTimeout(timeout);
   if(token===audioRecoveryEpoch&&!document.hidden)showAudioRecovery(true);
 });
}
window.addEventListener('focus',endWebBackgroundReturn);
el.audioRecover?.addEventListener('pointerdown',()=>cp19Haptics?.tap());
 el.audioRecover?.addEventListener('click',()=>{
  if(document.hidden)return;
  if(audioClockNeedsGesture&&audioContext){
   stopActiveAudio({fadeMs:0});
   webRetirement.retire(); // New context only within the direct user tap.
   audioClockWatchdog.resetEpoch();
   audioClockNeedsGesture=false;
  }
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
 const scaleX=portrait?(isPreview?1.51:1.2):(isPreview?2.23:1.587);
 const scaleY=portrait?(isPreview?4.05:4.3164):(isPreview?1.79:1.587);
 // The TEST F clock uses independent drawn-width and drawn-height fitting.
 // A larger CSS transform alone is canceled by font-size compensation.
 const fit=CP19F_UX?fitCP19Clock({width:frame.clientWidth,height:frame.clientHeight,rawWidth:raw,portrait}):null;
 const byWidth=(frame.clientWidth*(isPreview?.965:.98))/(raw/100)/scaleX;
 const byHeight=(frame.clientHeight*(isPreview?(portrait?1.01:.985):.95))/scaleY;
 const size=fit?.fontSize??Math.max(15,Math.min(byWidth,byHeight,620));
 el.clock.style.fontSize=`${size}px`;
 if(fit)el.clock.style.transform=`scale(${fit.scaleX},${fit.scaleY})`;
 fitLabels();
}
function fitLabels(){
 const portrait=window.matchMedia('(orientation: portrait)').matches;
 const ctx=(fitClock.labelCanvas||(fitClock.labelCanvas=document.createElement('canvas'))).getContext('2d');
 if(el.roundCount){
  const st=getComputedStyle(el.round);
  // Pilot 0.8.20.10: make the REMAINING TIME larger, not the round fraction.
  // Compact round header frees height; measure actual CSS em factors.
  const shortLandscape=!portrait&&window.innerHeight<=350;
  let base=portrait?window.innerWidth*(CP19F_UX?.058:.068):
   window.innerHeight*(CP19F_UX?(shortLandscape?.032:.034):.037);
  base=Math.max(12,Math.min(base,32));
  const wordFactor=portrait?1:CP19F_UX?(shortLandscape?.95:1):1;
  const countFactor=portrait?4.5:CP19F_UX?(shortLandscape?3.35:3.75):4.5;
  ctx.font=`900 ${base*wordFactor}px ${st.fontFamily}`;
  const wordWidth=ctx.measureText('РАУНД').width;
  ctx.font=`900 ${base*countFactor}px ${st.fontFamily}`;
  const fraction=el.roundCurrent&&el.roundTotal?`${el.roundCurrent.textContent}/${el.roundTotal.textContent}`:el.roundCount.textContent||'12/12';
   const numberWidth=ctx.measureText(fraction).width;
  const total=wordWidth+numberWidth+base*.32;
  const max=(el.round.parentElement.clientWidth||window.innerWidth)*.94;
  if(total>max)base*=max/total;
  el.round.style.fontSize=`${Math.max(10,base)}px`;
 }
 for(const label of [el.phase]){
  const st=getComputedStyle(label),root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
  const ideal=portrait?window.innerWidth*(CP19F_UX?.070:(isPreview?.081:.073)):window.innerHeight*(CP19F_UX?.051:(isPreview?.057:.05));
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
  if(PREVIEW_CONTROL_DECK)el.start.dataset.controlState=session?.status==='running'?'pause':'start';
  el.start.disabled=!!el.settings.open;
  el.reset.disabled=!!el.settings.open;
  const locked=!!session&&type!=='done';
  for(const input of [el.work,el.rest,el.rounds,el.prepare])input.disabled=locked;
  cp19Wheel?.refresh();
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
        // Between rounds: original single start gong. Triple end gong only
        // after the last configured round (phase done).
        const cue=cueForPhaseTransition(phase);
        if(cue)sound(cue);
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
  audioGestureSeen=true;
  let startupCuePlayed=false;
  // Every button action invalidates delayed initial gong requests.
  delayedStartGong.invalidate();
  const current=session&&phaseNow();
  if(!session||current?.type==='done'){
    // Do not immediately silence the first-tap button cue during START.
    stopActiveAudio({preserveButton:isPreview,preserveMix:keepForegroundMix()});
    firstClackMeasured=false;
    if(cueLatencyLabel)cueLatencyLabel.textContent='Первый щелчок: задержка ещё не измерена';
    if(audioClockNeedsGesture&&audioContext){
     webRetirement.retire();audioClockWatchdog.resetEpoch();audioClockNeedsGesture=false;
    }
    const ready=unlockAudio();
    config=readConfig();updateInputs(config);
    session={status:'running',config,elapsedBeforeMs:0,resumedAt:Date.now()};
    el.settings.open=false;lastPhase=null;lastCuePhase=null;
    showAudioRecovery(false);++audioRecoveryEpoch;
    if(config.prepare===0){
      if(CP19?cp19CanPlayStartCue({contextState:audioContext?.state,bufferReady:!!soundBuffers.start,
        transport:CP19.transport,workletReady:cp19Worklet.ready}):
        (audioContext?.state==='running'&&soundBuffers.start))sound('start');
      // When cold, play the existing HTML cue in this START gesture.
      // Do not queue a second WebAudio gong if HTML playback was attempted.
      else if(soundEnabled && !cp19DirectGestureFallback('start'))
        delayedStartGong.schedule(ready,{sessionRef:session,phaseKey:phaseNow().key});
    }else if(config.prepare<=5 && !sound('single'))cp19DirectGestureFallback('single');
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
// First-tap iOS fallback: synchronous HTML play() attempt in the gesture.
// Do not queue a duplicate cue or change external audio session state.
function cp19DirectGestureFallback(type){
 if(!CP19||!soundEnabled||document.hidden||audioInterruption.interrupted||!htmlSounds)return false;
 return type==='button'?htmlSounds.playButton():htmlSounds.play(type);
}
function buttonSound(){
 if(!soundEnabled||!isPreview||document.hidden||audioInterruption.interrupted)return false;
 audioGestureSeen=true;
 const request=++buttonCueEpoch;
 if(audioMode==='html'&&htmlSounds){
   sessionMix.begin();
   return htmlSounds.playButton();
 }
 // Try the preloaded HTML button audio before new WebAudio work on a cold gesture.
 // Do not schedule a delayed WebAudio echo after the HTML attempt.
 if(CP19&&(!audioContext||audioContext.state!=='running'||!soundBuffers.button)){
  const accepted=cp19DirectGestureFallback('button');
  void Promise.resolve(unlockAudio()).catch(()=>{});
  return accepted;
 }
 // Warm path uses the existing decoded Web Audio sample.
 const ready=(!audioContext||audioContext.state!=='running'||!soundBuffers.button)
   ?unlockAudio():Promise.resolve(true);
 if(sound('button'))return true;
 // CP19 previously returned true for silent first taps when WAV had not decoded.
 // Use the preloaded matching HTML cue synchronously without a delayed echo.
 // If unavailable, allow the following click handler one retry.
 if(CP19){
  const accepted=cp19DirectGestureFallback('button');
  void Promise.resolve(ready).catch(()=>{});
  return accepted;
 }
 // CP18 A/B only: try the original preloaded MP3 in this same gesture.
 // If that transport accepted the press, never add a delayed WebAudio echo.
 if(!CP19&&CP18_BUTTON_WINDOW_MS!==null&&htmlSounds?.playButton()){
   void Promise.resolve(ready).catch(()=>{});
   return true;
 }
 const pressedAt=Date.now();
 // Normal TEST root retains the original <=180ms policy, A/B uses 0 or 30.
 const maxLateMs=CP19?0:(CP18_BUTTON_WINDOW_MS===null?180:CP18_BUTTON_WINDOW_MS);
 if(maxLateMs>0){
   void Promise.resolve(ready).then(ok=>{
     const age=Date.now()-pressedAt;
     if(ok&&request===buttonCueEpoch&&deferredButtonCueAllowed(age,maxLateMs)&&
        !document.hidden&&!audioInterruption.interrupted)
       sound('button');
   }).catch(()=>{});
 }else{
   // 0ms = no deferred replay, not an added delay to immediate playback.
   void Promise.resolve(ready).catch(()=>{});
 }
 return true; // Prevent a duplicate sound on the later click.
}
// Pointerdown plays the button sound in the direct iOS user gesture.
// The later click performs the operation and does not play a duplicate.
function bindFastPress(target,action,{allowed=()=>true,suppress=()=>false}={}){
 let pressed=false;
 target?.addEventListener('pointerdown',event=>{
   if(event.isPrimary===false||!allowed())return;
   cp19Haptics?.tap();
   if(CP19&&!CP19.prime)cp19Gesture();
   if(suppress())return;
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
el.form.addEventListener('input',event=>{if(event.target?.tagName==='SELECT')cp19Haptics?.picker();});
 el.form.addEventListener('change',event=>{
   if(event.target?.tagName==='SELECT')cp19Haptics?.picker();
   if(!session){config=readConfig();save();draw({notify:false});}
 });
el.settings.addEventListener('toggle',()=>{
 document.body.classList.toggle('settings-visible',el.settings.open);
 el.start.disabled=!!el.settings.open;
 el.reset.disabled=!!el.settings.open;
 lastClockLayout='';requestAnimationFrame(()=>fitClock(true));
});
// Keep the close-button touch targeted as the settings overlay collapses.
// Safari can otherwise send a subsequent synthetic touch to a native picker.
el.closeSettings?.addEventListener('pointerdown',event=>{
 if(event.isPrimary===false)return;
 try{
  if(Number.isFinite(event.pointerId))
   el.closeSettings.setPointerCapture?.(event.pointerId);
 }catch(_){}
});
el.closeSettings?.addEventListener('click',event=>event.stopPropagation?.());
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
window.addEventListener('pagehide',()=>{save();if(CP19?.keepalive)cp19KeepAlive.stop();});
restoreSavedSettings();updateInputs(config);restore();draw({notify:false});
// Fetch and decode sounds without playing. Safari will resume on a real tap.
if(soundEnabled&&isPreview&&audioMode==='web'&&(window.AudioContext||window.webkitAudioContext)){
 try{
  audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
  void preloadSounds();
 }catch(_){}
}
// A force-quit can restore a running countdown without an unlocked context.
if(session?.status==='running'&&audioMode==='web')showAudioRecovery(true);
setInterval(()=>{if(!document.hidden){draw({notify:true});audioClockWatchdog.sample();}},100);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
