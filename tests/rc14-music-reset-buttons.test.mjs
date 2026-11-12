import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createActiveSoundController} from '../site/audio-guard.mjs';
import {createAudioDucking} from '../site/audio-duck.mjs';
const src=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
function contextHarness(){
  const sources=[];
  const context={currentTime:3,destination:{},
    createBufferSource(){
      const s={onended:null,stopAt:null,buffer:null,
        connect(){},disconnect(){},start(){},stop(t){this.stopAt=t;}};
      sources.push(s);return s;
    },
    createGain(){return {gain:{value:1,cancelScheduledValues(){},
      setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},
      connect(){},disconnect(){}};}
  };
  return {context,sources};
}
test('RC14 Web Audio RESET stops training gong but preserves full button sound',()=>{
 const {context,sources}=contextHarness(),active=createActiveSoundController();
 active.play({context,buffer:{duration:.33},category:'button'});
 active.play({context,buffer:{duration:2},category:'cue'});
 active.stopAll({fadeMs:16,includeButton:false});
 assert.equal(sources[0].stopAt,null,'button must not be cut off at reset');
 assert(sources[1].stopAt!==null,'cue must stop at reset');
 active.stopAll({fadeMs:0});
 assert.equal(sources[0].stopAt,context.currentTime,'Home must silence button too');
});
test('RC14 Web Audio foreground PAUSE retains a button while Home stops it',()=>{
 const {context,sources}=contextHarness(),active=createActiveSoundController();
 active.play({context,buffer:{duration:.33},category:'button'});
 active.stopAll({fadeMs:16,includeButton:false});
 assert.equal(sources[0].stopAt,null);
 active.stopAll({fadeMs:0});
 assert.equal(sources[0].stopAt,3);
});
test('RC14 original audio categories: keep transient after RESET; restore on Home',()=>{
 const transitions=[];
 const session={_type:'auto',get type(){return this._type;},set type(value){this._type=value;transitions.push(value);}};
 const mix=createAudioDucking({session,enabled:()=>true});
 assert.equal(mix.begin(),true);
 assert.deepEqual(transitions,['transient']);
 // Foreground pause/reset intentionally performs no stop/reconfigure.
 assert.equal(mix.begin(),true);
 assert.deepEqual(transitions,['transient']);
 mix.stop();
 assert.deepEqual(transitions,['transient','auto']);
});
test('RC14 Web Audio is prepared on user mode switch, no delayed click replay',()=>{
 const app=src('app.mjs');
 assert(app.includes("if(audioMode==='web')unlockAudio()"));
 assert(app.includes("if(!audioContext||audioContext.state!=='running')unlockAudio()"));
 assert(app.includes("category:kind==='button'?'button':'cue'"));
 assert(app.includes("activeSounds.stopAll({fadeMs,includeButton:!preserveButton})"));
 assert(app.includes('stopActiveAudio({preserveButton:isPreview,preserveMix:keepForegroundMix()})'));
});
test('RC14 retains music category through foreground RESET, but switches it off for Home',()=>{
 const app=src('app.mjs'),duck=src('audio-duck.mjs');
 assert(app.includes('function keepForegroundMix()'));
 assert(app.includes("audioMode==='html'&&musicMixEnabled&&!document.hidden"));
 assert(app.includes('if(!preserveMix)sessionMix.stop()'));
 assert(app.includes("stop:reason=>{"));
 assert(app.includes('stopActiveAudio({fadeMs:retire?0:reason'));
 assert(duck.includes('hold transient across foreground PAUSE/RESET'));
});
test('RC14 sound assets and offline cache identical to prior five approved recordings',()=>{
 const app=src('app.mjs'),sw=src('sw.js');
 assert(sw.includes('round-timer-shell-v0.8.10-mix-rc14'));
 for(const item of ['studio-gong-start','studio-gong-end','woodclack-single','woodclack-double','button']){
    assert(app.includes("'./sounds/"+item+".mp3'"),item);
    assert(sw.includes("'./sounds/"+item+".mp3'"),item);
 }
});
