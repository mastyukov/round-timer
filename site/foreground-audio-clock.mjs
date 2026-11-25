// APP-001 G-TEST.2: local foreground clock gate. Never changes workout time or audio session category.
export function createForegroundAudioGate(){
 let phase='cold',generation=0,context=null,last=null,healthy=0,since=null,attempted=false;
 const reset=(next)=>{generation++;phase=next;context=null;last=null;healthy=0;since=null;attempted=false};
 function observe(ctx,wall){
  const result={cancel:false,recover:false,ready:false,needsGesture:false};
  if(phase==='hidden'||phase==='recovering')return result;
  if(phase==='needs-gesture'){result.needsGesture=true;return result}
  if(!Number.isFinite(wall))return result;
  if(context!==ctx){if(phase==='ready'){phase='checking';result.cancel=true;attempted=false}
   context=ctx;last=null;healthy=0;since=wall}
  if(since===null)since=wall;
  const running=ctx?.state==='running'&&Number.isFinite(ctx.currentTime)&&ctx.currentTime>=0;
  if(running){
   const current=ctx.currentTime;
   if(last!==null){
    const dt=wall-last.wall,da=(current-last.audio)*1000;
    if(dt>=60){
     const ok=dt<=350&&da>=Math.max(12,dt*.50)&&da<=dt*1.50+25;
     if(ok){healthy++;if(healthy>=2){phase='ready';since=wall;result.ready=true}}
     else{if(phase==='ready'||phase==='cold'){result.cancel=true;phase='checking';since=wall}
      healthy=0}
     last={wall,audio:current};
    }else if(dt<0){if(phase==='ready'||phase==='cold')result.cancel=true;phase='checking';healthy=0;since=wall;last={wall,audio:current}}
   }else last={wall,audio:current};
  }else{
   if(phase==='ready'){phase='checking';since=wall;result.cancel=true}
   last=null;healthy=0;
  }
  if(phase!=='ready'&&wall-since>=350){
   if(!attempted){attempted=true;generation++;phase='recovering';result.cancel=true;result.recover=true;result.token=generation}
   else{phase='needs-gesture';result.cancel=true;result.needsGesture=true}
  }
  return result;
 }
 return Object.freeze({
  interrupt(){reset('hidden')},
  foreground(){if(phase==='hidden')reset('checking')},
  resetCold(){reset('cold')},
  manualCheck(){reset('checking')},
  observe,
  isRecovery(token){return phase==='recovering'&&generation===token},
  finish(token,ok){if(phase!=='recovering'||generation!==token)return false;phase=ok?'checking':'needs-gesture';last=null;healthy=0;since=null;return true},
  get phase(){return phase},
  get allowDirect(){return phase==='cold'||phase==='ready'},
  get allowTimed(){return phase==='ready'},
  get needsGesture(){return phase==='needs-gesture'},
  get recovering(){return phase==='recovering'}
 });
}
export async function boundedResume(ctx,{isCurrent,timeoutMs=900,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let timer;
 try{
  if(!ctx||ctx.state==='closed'||!isCurrent())return false;
  await Promise.race([Promise.resolve(ctx.resume()),new Promise((_,reject)=>{timer=setTimer(()=>reject(Error('resume timeout')),timeoutMs)})]);
  return isCurrent()&&ctx.state==='running';
 }catch(_){return false}
 finally{if(timer!==undefined)clearTimer(timer)}
}
