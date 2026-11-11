import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const expected=JSON.parse(readFileSync(new URL('../studio-audio-manifest.json',import.meta.url),'utf8'));
test('RC11 deployment gated on all five real studio MP3s and exact original hashes',()=>{
 for(const item of expected.files){
   const path=new URL('../site/sounds/'+item.name,import.meta.url);
   assert(existsSync(path),'AUDIO MISSING: '+item.name+'; do not deploy RC11');
   assert.equal(statSync(path).size,item.bytes,'Unexpected length '+item.name);
   assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),item.sha256,
     'Unexpected recording hash '+item.name);
 }
});
