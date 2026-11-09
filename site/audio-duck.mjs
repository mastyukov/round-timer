/**
 * Preview-only audio coexistence: 'transient' allows short HTML Audio cues
 * to mix with other apps on the user's tested iPhone. It MAY reduce other
 * volume, but the browser cannot request or guarantee a 50% reduction.
 * Never request exclusive 'transient-solo' playback.
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
