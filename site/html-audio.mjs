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
  unschedule=id=>clearTimeout(id), onError=()=>{}
}) {
  if (typeof makeAudio!=='function'||typeof isActive!=='function') {
    throw new TypeError('HTML audio controller requires makeAudio and isActive');
  }
  const elements={
    start:makeAudio(paths.start),
    end:makeAudio(paths.end),
    clack1:makeAudio(paths.clack),
    clack2:makeAudio(paths.clack)
  };
  for(const element of Object.values(elements)){
    element.preload='auto';
    element.autoplay=false;
  }
  let generation=0, pending=null;
  function silence(element){
    // Mute before pause, so an iOS playback callback cannot make a
    // trailing fragment audible on return from the Home Screen.
    try{element.muted=true;}catch(_){}
    try{element.pause();}catch(_){}
    try{element.currentTime=0;}catch(_){}
  }
  function stopAll(){
    generation++;
    if(pending!==null){try{unschedule(pending);}catch(_){}pending=null;}
    for(const element of Object.values(elements))silence(element);
  }
  function playElement(element,token){
    if(token!==generation||!isActive())return;
    try{
      element.currentTime=0;
      element.muted=false;
      const attempt=element.play();
      void Promise.resolve(attempt).then(()=>{
        if(token!==generation||!isActive())silence(element);
      }).catch(()=>{silence(element);onError('PLAY_REJECTED');});
    }catch(_){silence(element);onError('PLAY_REJECTED');}
  }
  function play(type){
    if(!isActive())return false;
    stopAll();
    const token=generation;
    if(type==='start')playElement(elements.start,token);
    else if(type==='end'||type==='done')playElement(elements.end,token);
    else if(type==='slow-double'||type==='double'){
      playElement(elements.clack1,token);
      pending=schedule(()=>{
        pending=null;
        playElement(elements.clack2,token);
      },type==='slow-double'?250:145);
    }else playElement(elements.clack1,token);
    return true;
  }
  return Object.freeze({play,stopAll});
}
