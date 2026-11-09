/**
 * Preview-only Audio Session experiment. Requests transient audio during short
 * cues to encourage iOS to reduce other apps' playback volume. The OS chooses
 * the reduction; it cannot be commanded to exactly 50%.
 * Never use transient-solo (which may interrupt other audio).
 */
export function createAudioDucking({session=null,enabled=()=>false,
  schedule=(fn,ms)=>setTimeout(fn,ms),unschedule=id=>clearTimeout(id)}={}) {
  let token=null, active=false, original='auto';
  const supported=!!session && typeof session.type==='string';
  function stop(){
    if(token!==null){try{unschedule(token);}catch(_){} token=null;}
    if(!active)return;
    active=false;
    try{
      if(session.type==='transient')session.type=original;
    }catch(_){}
  }
  function cue(durationMs=1800){
    if(!supported || !enabled())return false;
    if(token!==null){try{unschedule(token);}catch(_){} token=null;}
    if(!active){
      try{
        original=session.type;
        session.type='transient';
        if(session.type!=='transient')return false;
        active=true;
      }catch(_){active=false;return false;}
    }
    const duration=Math.max(200,Math.min(3000,Number(durationMs)||1800));
    try{token=schedule(()=>{token=null;stop();},duration);}
    catch(_){stop();return false;}
    return true;
  }
  return Object.freeze({supported,cue,stop});
}
