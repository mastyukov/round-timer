/* CP19 TEST: genuine PCM playback in an AudioWorkletProcessor; no tracking. */
class CP19Sampler extends AudioWorkletProcessor {
 constructor(){
  super();this.samples=new Map();this.voices=[];
  this.port.onmessage=e=>{
   const m=e?.data||{};
   if(m.type==='load'){
    this.voices=[];this.samples.clear();
    for(const item of m.items||[]){
     if(typeof item.name!=='string'||!Array.isArray(item.channels)||!item.channels.length)continue;
     const channels=item.channels.filter(ch=>ch instanceof Float32Array&&ch.length>0);
     if(!channels.length)continue;
     this.samples.set(item.name,{channels,length:Math.min(...channels.map(ch=>ch.length))});
    }
    this.port.postMessage({type:'ready',count:this.samples.size});
   } else if(m.type==='play'){
    const sample=this.samples.get(m.name);if(!sample)return;
    const offsets=Array.isArray(m.offsets)?m.offsets:[0];
    const volume=Number.isFinite(m.volume)?Math.min(1,Math.max(0,m.volume)):1;
    for(const offset of offsets){
     if(!Number.isFinite(offset)||offset<0||offset>10)continue;
     this.voices.push({sample,start:currentFrame+Math.round(offset*sampleRate),volume,
       category:m.category==='button'?'button':'cue'});
    }
   }else if(m.type==='stop')this.voices=[];
  };
 }
 process(inputs,outputs){
  const out=outputs[0];if(!out?.length)return true;
  const count=out[0].length;
  for(const voice of this.voices){
   const {sample,start,category,volume}=voice;
   for(let i=0;i<count;i++){
    const pos=currentFrame+i-start;
    if(pos<0||pos>=sample.length)continue;
    let amp=volume;
    if(category==='button'){
     const attack=Math.max(1,Math.floor(sampleRate*.004));
     const release=Math.max(1,Math.floor(sampleRate*.012));
     amp=0.015+(volume-0.015)*Math.max(0,Math.min(1,pos/attack,(sample.length-1-pos)/release));
    }
    for(let c=0;c<out.length;c++)out[c][i]+=sample.channels[Math.min(c,sample.channels.length-1)][pos]*amp;
   }
  }
  const end=currentFrame+count;
  this.voices=this.voices.filter(v=>end<v.start+v.sample.length);
  for(const ch of out)for(let i=0;i<ch.length;i++)ch[i]=Math.max(-1,Math.min(1,ch[i]));
  return true;
 }
}
registerProcessor('cp19-sampler',CP19Sampler);
