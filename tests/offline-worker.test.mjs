import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const workerCode=readFileSync(new URL('../site/sw.js',import.meta.url),'utf8');
const root='https://timer.example/round-timer/';
const clone=x=>x?.clone?.()||x;
const pathOf=x=>typeof x==='string'?new URL(x,root).href:x.url;
function setup({online=true,blocked=false,partialFailure=null,priorCaches={}}={}){
  const handlers={},store=new Map(),fetches=[],deleted=[];
  let connected=online;
  for(const [name,entries] of Object.entries(priorCaches)){
    store.set(name,new Map(Object.entries(entries).map(([p,v])=>[pathOf(p),new Response(v)])));
  }
  const network=async request=>{
    const u=pathOf(request);fetches.push(u);
    if(blocked)return new Promise(()=>{});
    if(!connected||u.includes(partialFailure||'___not_found___'))throw Error('offline');
    return new Response('asset:'+u,{status:200});
  };
  const caches={
    async open(name){
      if(!store.has(name))store.set(name,new Map());
      const data=store.get(name);
      return {
        async match(req){return clone(data.get(pathOf(req)));},
        async put(req,res){data.set(pathOf(req),clone(res));},
        async addAll(paths) {
          for(const p of paths) {
            const res=await network(p);
            if(!res.ok)throw Error('missing');
            data.set(pathOf(p),clone(res));
          }
        }
      };
    },
    async keys(){return [...store.keys()];},
    async delete(name){deleted.push(name);return store.delete(name);}
  };
  const self={
    location:{origin:new URL(root).origin},
    clients:{claim:async()=>{}},
    skipWaiting:async()=>{},
    addEventListener(name,callback){handlers[name]=callback;}
  };
  vm.runInNewContext(workerCode,{
    self,caches,Response,Request,URL,fetch:network,Promise,console
  });
  const trigger=(event,request)=>{
    let promise;
    const e={
      request,
      respondWith(p){promise=Promise.resolve(p);},
      waitUntil(p){promise=Promise.resolve(p)}
    };
    handlers[event](e);return promise;
  };
  return {
    trigger,store,fetches,deleted,
    setOnline(v){connected=v;},
    request:(p,opts)=>new Request(new URL(p,root),opts)
  };
}

test('initial complete shell install then fully offline cached startup, HTML, sound and script',async()=>{
 const s=setup();
 await s.trigger('install');
 assert.equal(s.store.has('round-timer-shell-v0.8.10-mix-rc14'),true);
 s.setOnline(false);
 const startFetches=s.fetches.length;
 for(const asset of ['./','./index.html','./app.mjs','./audio-guard.mjs','./sounds/gong-start.mp3']){
   const r=await s.trigger('fetch',s.request(asset));
   assert.equal(r.status,200);
 }
 assert.equal(s.fetches.length,startFetches,'offline shell must not use network');
});

test('stalled network does not stall cache-first app or audio and offline deep navigation',async()=>{
 const s=setup();await s.trigger('install');
 const first=s.fetches.length;
 s.setOnline(false);
 for(const p of ['./index.html','./sounds/gong-end.mp3','./privacy.html']){
   const r=await s.trigger('fetch',s.request(p));assert.equal(r.ok,true);
 }
 // Unknown route with navigation mode is modelled by Request.mode getter.
 const request=s.request('./some-deep-route');
 Object.defineProperty(request,'mode',{value:'navigate'});
 const navigation=await s.trigger('fetch',request);
 assert.equal(navigation.ok,true);
 assert.equal(s.fetches.length,first);
});

test('cache upgrade keeps complete new version and removes old version only after successful install',async()=>{
 const old='round-timer-shell-v0.8.5';
 const s=setup({priorCaches:{[old]:{'./index.html':'OLD HTML'}}});
 await s.trigger('install');
 assert.equal(s.store.has(old),true);
 await s.trigger('activate');
 assert.equal(s.store.has(old),false);
 assert.equal(s.store.has('round-timer-shell-v0.8.10-mix-rc14'),true);
 const r=await s.trigger('fetch',s.request('./index.html'));
 assert.match(await r.text(),/asset:/);
});

test('interrupted new cache download cannot delete existing v0.8.5 cache',async()=>{
 const old='round-timer-shell-v0.8.5';
 const s=setup({priorCaches:{[old]:{'./index.html':'OLD HTML'}},partialFailure:'audio-guard.mjs'});
 await assert.rejects(s.trigger('install'),/offline/);
 assert.equal(s.store.has(old),true);
 assert.equal(s.deleted.length,0,'activation must never run after install failure');
});

test('service worker does not intercept POST or cross-origin requests',async()=>{
 const s=setup();await s.trigger('install');
 assert.equal(s.trigger('fetch',s.request('./api',{method:'POST'})),undefined);
 assert.equal(s.trigger('fetch',new Request('https://outside.example/app.mjs')),undefined);
});
