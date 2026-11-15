/**
 * APP-001: detect an iOS WebKit AudioContext whose state says "running"
 * while currentTime is frozen. No side effects except onStall, at most once
 * per foreground epoch. Restarts only on explicit resetEpoch or a new context.
 */
export function createAudioClockWatchdog({
  getContext, isEligible, onStall, now=()=>performance.now(),
  stallMs=1600, minAdvanceSec=0.012
}={}) {
  if(typeof getContext!=='function'||typeof isEligible!=='function'||
     typeof onStall!=='function')throw new TypeError('Missing watchdog callbacks');
  let context=null, lastAudioTime=null, lastAdvancedAt=0, attempted=false;
  function resetEpoch(){
    context=null;lastAudioTime=null;lastAdvancedAt=0;attempted=false;
  }
  function sample(){
    if(!isEligible())return 'hidden';
    const ctx=getContext();
    if(!ctx||ctx.state!=='running')return 'inactive';
    const t=ctx.currentTime, wall=now();
    if(!Number.isFinite(t)||!Number.isFinite(wall))return 'invalid';
    if(ctx!==context){
      context=ctx;lastAudioTime=t;lastAdvancedAt=wall;attempted=false;
      return 'baseline';
    }
    if(t>lastAudioTime+minAdvanceSec){
      lastAudioTime=t;lastAdvancedAt=wall;return 'advancing';
    }
    if(t<lastAudioTime-minAdvanceSec){
      lastAudioTime=t;lastAdvancedAt=wall;return 'clock-reset';
    }
    if(!attempted&&wall-lastAdvancedAt>=stallMs){
      attempted=true;onStall(ctx);return 'stalled';
    }
    return attempted?'already-attempted':'waiting';
  }
  return Object.freeze({sample,resetEpoch,get attempted(){return attempted;}});
}

/**
 * Single bounded suspend -> resume attempt. A resolved resume() promise is
 * insufficient on iOS: verify actual currentTime progress after settling.
 * Nothing is played/replayed and the workout's wall-clock is untouched.
 */
export async function pulseStalledContext(ctx,{
  isCurrent=()=>true, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  timeoutMs=900, settleMs=420, minAdvanceSec=0.012
}={}) {
  if(!ctx||ctx.state!=='running'||!isCurrent())return false;
  const before=ctx.currentTime;
  async function deadline(promise){
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('audio recovery timeout')),timeoutMs);})
      ]);
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }
  try {
    await deadline(ctx.suspend());
    if(!isCurrent())return false;
    await deadline(ctx.resume());
    if(!isCurrent())return false;
    await wait(settleMs);
    return isCurrent()&&ctx.state==='running'&&ctx.currentTime>before+minAdvanceSec;
  }catch(_){
    return false;
  }
}
