import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const file=p=>new URL('../site/'+p,import.meta.url);
const read=p=>readFileSync(file(p),'utf8');
const sha256=p=>createHash('sha256').update(readFileSync(file(p))).digest('hex');
const gitSha=p=>{
 const bytes=readFileSync(file(p));
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
};

test('FINAL v0.8.20.19: public entry is production identity, approved controls and graphite, no TEST status',()=>{
 const html=read('index.html');
 assert.match(html,/name="round-timer-version" content="v0\.8\.20\.19"/);
 assert.match(html,/name="apple-mobile-web-app-title" content="Раунд таймер"/);
 assert.match(html,/href="\.\/manifest\.webmanifest"/);
 assert.match(html,/src="\.\/app\.mjs\?v=082019"/);
 assert.match(html,/href="\.\/graphite-polish-082016\.css\?v=082019"/);
 assert.match(html,/미하일 0\.8\.20\.19/);
 assert.doesNotMatch(html,/ТЕСТОВАЯ ВЕРСИЯ|Apple Music TEST|Таймер F TEST|round-timer-preview-build/);
 for(const id of ['workInput','roundsInput','prepareInput','restInput','soundToggle',
  'startPauseButton','resetButton','clock','roundCurrent','roundTotal','closeSettingsButton']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' uniqueness');
 }
 const man=JSON.parse(read('manifest.webmanifest'));
 assert.equal(man.name,'Раунд таймер');
 assert.equal(man.start_url,'./');
 assert.equal(man.scope,'./');
 assert.equal(man.display,'standalone');
});

test('Apple Music ambient and button-first Prewarm are on root and never stop external music',()=>{
 const app=read('app.mjs'),ambient=read('preview-ambient-audio-session.mjs');
 assert.match(app,/PREVIEW_MAIN_HOME=\/\(\?:\\\/\|\\\/index\\\.html\|\\\/test-f\\\.html\)\$/);
 assert.match(app,/const PREVIEW_MUSIC_FIX=PREVIEW_VARIANT==='graphite-musicfix'\|\|PREVIEW_MAIN_HOME/);
 assert.match(app,/const PREVIEW_PREWARM=PREVIEW_CONTROL_DECK\|\|PREVIEW_VARIANT==='graphite-prewarm'/);
 assert.match(app,/if\(CP19F_UX&&PREVIEW_MUSIC_FIX\)/);
 assert.match(app,/ensureAmbientAudioSession\(navigator\)/);
 assert.match(app,/if\(event\.isTrusted\)applyAmbient\(\)/);
 assert.match(app,/window\.addEventListener\('pageshow',applyAmbient\)/);
 assert.match(app,/soundsLoading=\(PREVIEW_PREWARM\?prewarmButtonFirst\(soundEntries,decodeEntry\):/);
 assert.match(app,/const DIAGNOSTICS_VERSION='0\.8\.20\.19'/);
 assert.match(app,/PREVIEW_MAIN_HOME\?'0\.8\.20\.19-MAIN'/);
 assert.doesNotMatch(ambient,/\.pause\(|\.play\(|\.volume\s*=/);
 assert.doesNotMatch(app,/dispatchEvent\(new (?:MouseEvent|PointerEvent)/);
});

test('frozen countdown source, four rounded corners and aligned PREPARE/REST wheels',()=>{
 assert.equal(gitSha('preview-variants-clock-fit.mjs'),'ead294a38cba89bc78ec295b88f18178b52ea7c8');
 const css=read('graphite-polish-082016.css');
 assert.match(css,/label:nth-of-type\(3\),[\s\S]*?label:nth-of-type\(4\)\s*\{[\s\S]*?margin-bottom:0/);
 assert.match(css,/label:nth-of-type\(3\) > \.cp19f-inline-wheel,[\s\S]*?label:nth-of-type\(4\) > \.cp19f-inline-wheel\s*\{[\s\S]*?margin-top:auto/);
 assert.match(css,/\.controls \.main-button,[\s\S]*?\.controls \.secondary-button\s*\{[\s\S]*?border-radius:16px/);
 assert.match(css,/orientation:landscape[\s\S]*?border-radius:10px/);
 assert.match(css,/data-sound="off"\]\s*\{[\s\S]*?background:linear-gradient\(180deg,#7a3645/);
 assert.match(read('styles.css'),/data-sound="on"\]\{background:#00b338/);
 assert.match(css,/translateY\(clamp\(20px,4\.2vh,29px\)\) scale\(1\.33\)/);
 assert.match(css,/translateY\(13px\) scale\(1\.19\)/);
 assert.ok(css.includes('overflow-x:hidden;'));
 assert.doesNotMatch(css,/\.cp19f-inline-limit\s*\{\s*display:none!important;/);
 const picker=read('cp19-wheel-picker.mjs');
 const refresh=picker.slice(picker.indexOf('function refresh(){'));
 assert.ok(refresh.includes('if(entry.touching)continue;'),'touch guard must exist');
 assert.ok(refresh.indexOf('if(entry.touching)continue;')<refresh.indexOf('entry.minMarker.hidden=idx!==0;'),'touch guard before stale marker state');
 assert.match(picker,/minMarker\.hidden=entry\.index!==0/);
 assert.match(picker,/maxMarker\.hidden=entry\.index!==select\.options\.length-1/);
 assert.ok(css.includes('overscroll-behavior-x:none;'));
 assert.ok(css.includes('touch-action:pan-y;'));
 assert.ok(css.includes('text-overflow:ellipsis;'));
 const runtime=read('app.mjs');
 assert.ok(runtime.includes("label.textContent=PREVIEW_MAIN_HOME?'미하일 0.8.20.19'"));
 assert.ok(runtime.includes("el.textContent=PREVIEW_MAIN_HOME?'미하일 0.8.20.19'"));
 const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(stripped,/\.clock\s*\{|\.clock-frame\s*\{|font-size\s*:|--wheel-row\s*:/);
});

test('offline SW precache contains every source, original audio and NO developer test pages',()=>{
 const sw=read('sw.js');
 assert.match(sw,/round-timer-shell-v0\.8\.20\.19-final-graphite-ambient/);
 assert.match(sw,/cache\.addAll\(SHELL\)/);
 assert.match(sw,/self\.skipWaiting\(\)/);
 assert.match(sw,/self\.clients\.claim\(\)/);
 assert.match(sw,/cache\.match\(event\.request, \{ignoreSearch:true\}\)/);
 const source=sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1];
 assert.ok(source,'missing constant offline shell');
 const list=[...source.matchAll(/'(\.\/[^']+)'/g)].map(x=>x[1]);
 assert.equal(new Set(list).size,list.length,'no duplicate cache entries');
 assert.ok(list.length>=48,'complete PWA dependency graph');
 for(const item of list){
  assert.ok(!item.includes('test-f')&&!item.includes('manifest-cp19f'),'no TEST only entry '+item);
  if(item==='./')continue;
  const path=item.slice(2).split('?')[0];
  assert.ok(existsSync(file(path)),'offline reference missing '+item);
 }
 for(const item of ['./app.mjs?v=082019','./graphite-polish-082016.css?v=082019',
  './preview-ambient-audio-session.mjs','./preview-audio-prewarm.mjs',
  './sounds/cp19-wav/button.wav','./sounds/cp19-wav/studio-gong-start.wav'])
  assert.ok(list.includes(item),'required resource not cached '+item);
 assert.ok(!existsSync(file('test-f.html')),'do not publish the TEST-F page');
 assert.ok(!existsSync(file('preview-build.json')),'do not publish QA build metadata');
});

test('original sound bytes are identical to the approved iPhone TEST (5 MP3 + 5 WAV)',()=>{
 const mp3={
 'button.mp3':'7568fbddf7d7e7af867a8f3d61cc1a39aa10b23239f71b691defd1514780e17e',
 'studio-gong-end.mp3':'5a11b07fa9056952b8aeb74996806ca707b5cc69dedac4d088a081fc64ecb55a',
 'studio-gong-start.mp3':'bc6e72b76bacdc54dd0bf0dcbc636ddaa9ec91d123b88e0f03c4e954038e9505',
 'woodclack-double.mp3':'9801847a45300f972cf5d381e20bbbdf54f743c0bfd80293b38b2b0bd3439a28',
 'woodclack-single.mp3':'9b1287db452b68cfede024748dd8d5ed5755e61950509354b4e197e9193d2918'
 };
 const wav={
 'button.wav':'345ea46a7b0420e17154895a4afe19e1b5439d0e03e1c3bc9b18d5f115d05517',
 'studio-gong-end.wav':'bc5a7d5d6c7d3b8e30c366887c187158ebe0f8ceffb644e93e7193da5aed6c19',
 'studio-gong-start.wav':'60ff9f9908e4e0976888801dfe8d6c7b2e78160b2e3440d7d5107eb7852eaa20',
 'woodclack-double.wav':'d90eff1cc9edffae69286da0edcacd9579af79d292c9c27f4e680410b525f914',
 'woodclack-single.wav':'ee49a5976177517e42c7b843f5791e0c6821294a10db7738b24c1969bf2fda8f'
 };
 for(const [name,sha] of Object.entries(mp3))assert.equal(sha256('sounds/'+name),sha,name);
 for(const [name,sha] of Object.entries(wav))assert.equal(sha256('sounds/cp19-wav/'+name),sha,name);
});

test('public artifact scope and error-only technical diagnostics remain limited',()=>{
 for(const bad of ['tests','receiver','project','.github','qa','.env','test-f.html'])
  assert.equal(existsSync(file(bad)),false,'forbidden site path: '+bad);
 const sender=read('diagnostics/sender.mjs');
 assert.match(sender,/locationLike\?\.origin==='https:\/\/mastyukov\.github\.io'/);
 assert.match(sender,/const MAX_EVENTS = 5/);
 assert.match(read('app.mjs'),/productionDiagnosticEndpoint\(globalThis\.location,/);
 assert.match(read('app.mjs'),/const DIAGNOSTICS_VERSION='0\.8\.20\.19';/);
});
