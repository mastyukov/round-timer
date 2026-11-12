/**
 * Preview-only disposable WebAudio lifecycle for installed iOS PWAs.
 * Safari may replay an old buffered gong when returning from the Home Screen.
 * Retire the entire context, not just its already scheduled source nodes.
 * The next foreground user gesture creates a new context; elapsed timer
 * time continues separately and missed cues are never replayed.
 */
export function createWebAudioRetirement({getContext, reset}) {
  if(typeof getContext!=='function'||typeof reset!=='function') {
    throw new TypeError('Audio retirement requires getContext and reset');
  }
  let generation=0;
  function retire() {
    const old=getContext();
    generation++;
    reset();
    if(!old)return false;
    try {
      const result=old.close?.();
      if(result&&typeof result.catch==='function')void result.catch(()=>{});
    }catch(_){}
    return true;
  }
  function isCurrent(context, token){
    return generation===token && getContext()===context;
  }
  return Object.freeze({retire,isCurrent,get generation(){return generation;}});
}
