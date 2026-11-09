/**
 * Preview-only audio coexistence: 'transient' allows short HTML Audio cues
 * to mix with other apps on the user's tested iPhone. It MAY reduce other
 * volume, but the browser cannot request or guarantee a 50% reduction.
 * RC7: hold transient for the running session (until PAUSE/RESET/HOME),
 * rather than repeatedly restoring auto after each gong. iPhone validation
 * must establish whether this avoids stopping the other music.
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
  // Held audio mode for training. Unlike per-cue timeout, the session type
  // is NOT changed at the end of the gong. User PAUSE/RESET/HOME restores it.
  function begin(){
    if(!supported || !enabled())return false;
    if(token!==null){try{unschedule(token);}catch(_){} token=null;}
    if(active)return true;
    try{
      original=session.type;
      session.type='transient';
      if(session.type!=='transient')return false;
      active=true;
      return true;
    }catch(_){active=false;return false;}
  }
  function cue(durationMs=1800){
    if(!begin())return false;
    const duration=Math.max(200,Math.min(3000,Number(durationMs)||1800));
    try{token=schedule(()=>{token=null;stop();},duration);}
    catch(_){stop();return false;}
    return true;
  }
  return Object.freeze({supported,begin,cue,stop});
}
