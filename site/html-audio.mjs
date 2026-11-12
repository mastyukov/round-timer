/**
 * EXPERIMENT ONLY (iPhone installed-PWA audio lifecycle).
 * Uses ordinary HTMLMediaElement instead of Web Audio. A direct user START
 * click initiates playback. Future automatic cues may be blocked on iOS:
 * this must be tested on real hardware, never assumed to work from Node QA.
 *
 * No external music changes, no background playback, no personal data.
 */
export function createHtmlAudioController({
  makeAudio, paths, isActive, schedule=(fn,ms)=>setTimeout(fn,ms),
  unschedule=id=>clearTimeout(id), onError=()=>{}, onTiming=()=>{}, now=()=>Date.now()
}) {
  if (typeof makeAudio!=='function'||typeof isActive!=='function') {
    throw new TypeError('HTML audio controller requires makeAudio and isActive');
  }
  const elements={
    start:makeAudio(paths.start),
    end:makeAudio(paths.end),
    clack1:makeAudio(paths.clack),
    clack2:makeAudio(paths.clack),
    double:paths.double?makeAudio(paths.double):null,
    button:paths.button?makeAudio(paths.button):null,
    buttonAlt:paths.button?makeAudio(paths.button):null
  };
  for(const element of Object.values(elements).filter(Boolean)){
    element.preload='auto';
    element.autoplay=false;
    // Safari may ignore preload hints; explicitly request buffering without
    // starting playback or taking exclusive audio focus.
    try{element.load?.();}catch(_){}
  }
  let generation=0, pending=null, buttonTurn=0;
  function silence(element){
    // Mute before pause, so an iOS playback callback cannot make a
    // trailing fragment audible on return from the Home Screen.
    try{element.muted=true;}catch(_){}
    try{if(!element.paused)element.pause();}catch(_){}
    try{if(element.currentTime>0.015)element.currentTime=0;}catch(_){}
  }
  function stopAll({includeButton=true}={}){
    generation++;
    if(pending!==null){try{unschedule(pending);}catch(_){}pending=null;}
    for(const [name,element] of Object.entries(elements)){
      if(element&&(includeButton||!name.startsWith('button')))silence(element);
    }
  }
  function playElement(element,token,kind){
    if(token!==generation||!isActive())return;
    const requestedAt=now();
    try{
      if(element.currentTime>0.015)element.currentTime=0;
      element.muted=false;
      const attempt=element.play();
      void Promise.resolve(attempt).then(()=>{
        if(token!==generation||!isActive()){silence(element);return;}
        // play() resolution is browser-side start, NOT actual Bluetooth sound
        // output, which may be further delayed by the audio device.
        const delayMs=Math.max(0,Math.round(now()-requestedAt));
        try{onTiming({kind,delayMs});}catch(_){}
      }).catch(()=>{silence(element);onError('PLAY_REJECTED');});
    }catch(_){silence(element);onError('PLAY_REJECTED');}
  }
  function play(type){
    if(!isActive())return false;
    stopAll({includeButton:false});
    const token=generation;
    if(type==='start')playElement(elements.start,token,'gong-start');
    else if(type==='end'||type==='done')playElement(elements.end,token,'gong-end');
    else if(type==='ten-double'&&elements.clack2){
      // Use two approved single-hit samples with a shorter, deterministic gap.
      playElement(elements.clack1,token,'clack1');
      pending=schedule(()=>{pending=null;playElement(elements.clack2,token,'clack2');},140);
    }
    else if(type==='slow-double'||type==='double'){
      playElement(elements.clack1,token,'clack1');
      pending=schedule(()=>{
        pending=null;
        playElement(elements.clack2,token,'clack2');
      },type==='slow-double'?250:145);
    }else playElement(elements.clack1,token,'clack1');
    return true;
  }
  function playButton(){
    if(!elements.button||!isActive())return false;
    try{
      // Alternate two preloaded players: repeated taps need no forced seek.
      const pool=[elements.button,elements.buttonAlt].filter(Boolean);
      const element=pool[buttonTurn++%pool.length];
      if(!element.paused)element.pause();
      if(element.currentTime>0.015)element.currentTime=0;
      element.muted=false;
      void Promise.resolve(element.play()).catch(()=>onError('BUTTON_REJECTED'));
      return true;
    }catch(_){onError('BUTTON_REJECTED');return false;}
  }
  return Object.freeze({play,playButton,stopAll});
}
