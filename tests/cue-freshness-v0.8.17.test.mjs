import test from 'node:test';
import assert from 'node:assert/strict';
import {isCueFresh} from '../site/audio-guard.mjs';
test('fresh cue jitter is allowed up to 280ms',()=>{
 for(const ms of [0,20,99,160,200,280])assert.equal(isCueFresh(ms),true);
});
test('late WebKit callbacks at 281ms, 2sec or invalid are rejected',()=>{
 for(const ms of [281,600,2000,-2,Infinity,NaN,undefined])assert.equal(isCueFresh(ms),false);
});
