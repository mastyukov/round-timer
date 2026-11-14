import test from 'node:test';
import assert from 'node:assert/strict';
import {mayReuseCiEvidence} from './provenance-policy.mjs';
const sha='a'.repeat(40),manifest='f'.repeat(64);
const record={origin:'authenticated-github-actions-api',repository:'mastyukov/round-timer',
 head_sha:sha,test_manifest_sha:manifest,workflow_id:123,run_id:1001,
 status:'completed',conclusion:'success',level:'critical'};
const args={requestedSha:sha,repository:'mastyukov/round-timer',
 requiredLevel:'standard',testManifestSha:manifest,trustedWorkflowId:123,record};
const call=(changes={},recordChanges={})=>mayReuseCiEvidence({...args,...changes,record:{...record,...recordChanges}});
test('exact SHA and adequate tier allow limited reuse',()=>assert.equal(call(),true));
test('identical branch name cannot substitute for SHA',()=>{
 assert.equal(call({requestedSha:'b'.repeat(40)}),false);
 assert.equal(call({}, {head_sha:'b'.repeat(40)}),false);
});
test('test-manifest SHA change blocks reuse',()=>{
 assert.equal(call({testManifestSha:'e'.repeat(64)}),false);
 assert.equal(call({}, {test_manifest_sha:'e'.repeat(64)}),false);
});
test('non-success, skipped and unauthenticated results are rejected',()=>{
 for(const r of [{conclusion:'failure'},{conclusion:'skipped'},{status:'queued'},
   {origin:'user-supplied-json'},{run_id:0},{workflow_id:999}])
   assert.equal(call({},r),false);
});
test('wrong repository or weak tier cannot satisfy CRITICAL',()=>{
 assert.equal(call({requiredLevel:'critical'},{level:'standard'}),false);
 assert.equal(call({},{repository:'other/round-timer'}),false);
});
test('RELEASE always requires fresh human-approved gate',()=>{
 assert.equal(call({requiredLevel:'release'}),false);
 assert.equal(call({requiredLevel:'release'},{level:'release'}),false);
});
