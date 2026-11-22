/** Optional tactile feedback. On iOS Safari, navigator.vibrate is absent.
 * Do not substitute audible clicks or undocumented WebKit switch hacks.
 * Native iOS selection wheels retain OS-managed behavior.
 */
export function createCP19Haptics({navigatorRef=typeof navigator!=='undefined'?navigator:null,
 now=()=>Date.now(),cooldownMs=70,enabled=true}={}){
 let last=-Infinity;
 const supported=()=>!!enabled && typeof navigatorRef?.vibrate==='function';
 function pulse(durationMs){
  if(!supported())return false;
  const t=now();
  if(t-last<cooldownMs)return false;
  try{
   if(navigatorRef.vibrate(durationMs)===false)return false;
   last=t;
   return true;
  }catch(_){return false}
 }
 return Object.freeze({tap:()=>pulse(12),picker:()=>pulse(8),get supported(){return supported();}});
}
