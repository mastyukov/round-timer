import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=path=>new URL('../'+path,import.meta.url);
const read=path=>readFileSync(root(path),'utf8');

test('publication checks v0.8.19.2 and all approved audio/credit markers',()=>{
 const wf=read('.github/workflows/publish-pages.yml');
 assert(wf.includes('Verify exact approved v0.8.19.2 release'));
 assert(wf.includes("round-timer-shell-v0.8.19.2"));
 assert(wf.includes("미하일 0.8.19.2"));
 assert(wf.includes("volume:kind==='button'?.1944:kind==='clack'?.96:.9"));
 assert(wf.includes("type==='ten-double'?[0,.478]"));
 assert(wf.includes("cueForPhaseTransition(phase)"));
 assert(!wf.includes('v0.8.17'));
});
test('GitHub Pages still deploys only site/ from FINAL main after verify',()=>{
 const wf=read('.github/workflows/publish-pages.yml');
 assert(wf.includes("github.ref == 'refs/heads/main'"));
 assert(wf.includes("github.repository == 'mastyukov/round-timer'"));
 assert(wf.includes('needs: [verify]'));
 assert(wf.includes('path: site'));
 assert(wf.includes('test ! -d site/tests'));
 assert(wf.includes('test ! -d site/project'));
});
test('FAST CI release cache version updated but tests retained',()=>{
 const wf=read('.github/workflows/ci.yml');
 assert(wf.includes('round-timer-shell-v0.8.19.2'));
 assert(wf.includes('node --test tests/*.test.mjs'));
 assert(wf.includes("python3 -m unittest discover -s tests -p 'test_*.py'"));
});
test('historic v0.8.17 release gate is limited to its own branch',()=>{
 const wf=read('.github/workflows/release-v0.8.17-qa.yml');
 assert(wf.includes("github.head_ref == 'assistant/round-timer/v0817-foreground-audio-20261114'"));
 assert(wf.includes("github.event_name == 'push'"));
 assert(wf.includes('round-timer-shell-v0.8.17'));
});
test('new release note explicitly retains stable v0.8.15 rollback',()=>{
 const doc=read('project/releases/v0.8.19.2-release.md');
 assert(doc.includes('bfa13c8aabb1fd49b042c58ce130d4abf0ed9499'));
 assert(doc.includes('0.1944'));
 assert(doc.includes('478 ms'));
 assert(doc.includes('intermittent audio output delay'));
});
