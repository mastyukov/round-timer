/** CP19 TEST audio experiments: exact allow-list; baseline CP18 unchanged. */
export const CP19_MODES=Object.freeze({
 'wav-web':Object.freeze({label:'WAV + Web Audio',codec:'wav',transport:'web',prime:false,keepalive:false}),
 'mp3-worklet':Object.freeze({label:'MP3 + AudioWorklet',codec:'mp3',transport:'worklet',prime:false,keepalive:false}),
 'wav-worklet':Object.freeze({label:'WAV + AudioWorklet',codec:'wav',transport:'worklet',prime:false,keepalive:false}),
 'mp3-prime':Object.freeze({label:'MP3 + Web Audio + first-gesture prime',codec:'mp3',transport:'web',prime:true,keepalive:false}),
 'mp3-keepalive':Object.freeze({label:'MP3 + Web Audio + prime + keep-alive',codec:'mp3',transport:'web',prime:true,keepalive:true}),
 'wav-keepalive':Object.freeze({label:'WAV + Web Audio + prime + keep-alive',codec:'wav',transport:'web',prime:true,keepalive:true})
});
export function cp19Mode(search=''){
 const value=new URLSearchParams(String(search||'')).get('cp19');
 return Object.prototype.hasOwnProperty.call(CP19_MODES,value)?value:null;
}
export function cp19Paths(codec){
 const ext=codec==='wav'?'.wav':'.mp3';
 const root=codec==='wav'?'./sounds/cp19-wav/':'./sounds/';
 return {start:root+'studio-gong-start'+ext,end:root+'studio-gong-end'+ext,
   clack:root+'woodclack-single'+ext,double:root+'woodclack-double'+ext,
   button:root+'button'+ext};
}
/** Do not consume a start gong before the worklet host has confirmed readiness. */
export function cp19CanPlayStartCue({contextState,bufferReady,transport,workletReady}){
 return contextState==='running' && !!bufferReady &&
   (transport!=='worklet'||!!workletReady);
}
export function cp19PrimeAudio(context){
 if(!context||context.state==='closed')return false;
 try{
  if(context.state!=='running')void Promise.resolve(context.resume()).catch(()=>{});
  const b=context.createBuffer(1,1,context.sampleRate);
  const src=context.createBufferSource();src.buffer=b;src.connect(context.destination);
  src.onended=()=>{try{src.disconnect()}catch(_){}};
  src.start(0);return true;
 }catch(_){return false}
}
