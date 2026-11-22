/** CP19 TEST bridge for decoded AudioBuffer PCM -> AudioWorkletProcessor. */
export function createCP19WorkletHost({
 moduleUrl='./cp19-audio-worklet.mjs',
 makeNode=(ctx,name,opts)=>new AudioWorkletNode(ctx,name,opts),
 timeoutMs=2000,
}={}){
 let context=null,node=null,pending=null,ready=false,generation=0;
 function reset(){
  generation++;ready=false;pending=null;
  if(node){try{node.port.postMessage({type:'stop'})}catch(_){}try{node.disconnect()}catch(_){}}
  context=null;node=null;
 }
 function stopAll(){if(node)try{node.port.postMessage({type:'stop'})}catch(_){}}
 async function prepare(ctx,buffers){
  if(!ctx?.audioWorklet?.addModule)return false;
  if(context===ctx&&ready)return true;
  if(context===ctx&&pending)return pending;
  reset();context=ctx;const mine=generation;
  pending=(async()=>{
   try{
    await ctx.audioWorklet.addModule(moduleUrl);
    if(mine!==generation)return false;
    const n=makeNode(ctx,'cp19-sampler',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    if(mine!==generation){try{n.disconnect()}catch(_){}return false}
    node=n;
    const items=[],transfers=[];
    for(const [name,buffer] of Object.entries(buffers||{})){
     if(!buffer||!buffer.length||!buffer.numberOfChannels)continue;
     const channels=[];
     for(let c=0;c<Math.min(2,buffer.numberOfChannels);c++){
      const samples=new Float32Array(buffer.getChannelData(c));
      channels.push(samples);transfers.push(samples.buffer);
     }
     items.push({name,channels});
    }
    if(items.length<5){return false}
    const ok=await new Promise(resolve=>{
     let settled=false;
     let timer;
     function finish(value){if(settled)return;settled=true;clearTimeout(timer);n.port.onmessage=null;resolve(value)}
     timer=setTimeout(()=>finish(false),timeoutMs);
     n.port.onmessage=e=>finish(e?.data?.type==='ready'&&e.data.count===items.length);
     try{n.connect(ctx.destination);n.port.postMessage({type:'load',items},transfers)}catch(_){finish(false)}
    });
    if(mine!==generation||context!==ctx)return false;
    ready=ok;return ok;
   }catch(_){return false}
   finally{if(mine===generation&&!ready)pending=null}
  })();
  return pending;
 }
 function play({name,offsets=[0],volume=1,category='cue'}={}){
  if(!ready||!node||context?.state!=='running')return false;
  try{node.port.postMessage({type:'play',name,offsets,volume,category});return true}catch(_){return false}
 }
 return Object.freeze({prepare,play,stopAll,reset,get ready(){return ready}});
}
