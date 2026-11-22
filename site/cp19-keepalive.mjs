/** TEST-only controlled near-silent audio keepalive; stops on background. */
export function createCP19KeepAlive(){
 let current=null,source=null,gain=null;
 function stop(){
  if(source){try{source.stop()}catch(_){}try{source.disconnect()}catch(_){}}
  if(gain){try{gain.disconnect()}catch(_){}}
  source=null;gain=null;current=null;
 }
 function start(ctx){
  if(!ctx||ctx.state!=='running')return false;
  if(current===ctx&&source)return true;
  stop();
  try{
   const len=Math.max(128,Math.floor(ctx.sampleRate/2));
   const buffer=ctx.createBuffer(1,len,ctx.sampleRate);
   const samples=buffer.getChannelData(0);
   // -80 dBFS alternating carrier. May be audible with some routes/settings.
   for(let i=0;i<len;i++)samples[i]=(i%2===0?1:-1)*0.0001;
   const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;
   const g=ctx.createGain();g.gain.value=1;
   src.connect(g);g.connect(ctx.destination);
   src.start();source=src;gain=g;current=ctx;return true;
  }catch(_){stop();return false}
 }
 return Object.freeze({start,stop,get active(){return !!source;}});
}
