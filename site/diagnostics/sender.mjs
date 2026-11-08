import {sanitizeDiagnosticEvent,ERROR_CODES,COMPONENTS} from './schema.mjs';

// Test/preview origins must never submit synthetic errors to production.
// A preview's localhost/browser source is deliberately not trusted.
export function productionDiagnosticEndpoint(locationLike, endpoint) {
  return locationLike?.origin==='https://mastyukov.github.io' &&
    typeof locationLike?.pathname==='string' &&
    (locationLike.pathname==='/round-timer/' ||
      locationLike.pathname.startsWith('/round-timer/index.html'))
    ? endpoint : '';
}


// Privacy-safe, bounded queue. Event identifiers are one-off random values,
// never stable device/user identifiers; retained locally for at most 24 hours.
const ERROR_TYPES = new Set(['app_error','asset_error','audio_failure']);
const STORE_KEY = 'round-timer-technical-errors-v1';
const MAX_EVENTS = 5;
const TTL_MS = 24 * 60 * 60 * 1000;
const DELAYS = [30_000,120_000,600_000,3_600_000];
const MAX_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newId() {
  try {return globalThis.crypto?.randomUUID?.() || null;} catch {return null;}
}
const project = e => ({
  event:e.event,code:e.code,component:e.component,version:e.version,
  eventId:e.id,
});
const valid = e => !!e && UUID.test(e.id) &&
  ERROR_TYPES.has(e.event) && ERROR_CODES.includes(e.code) &&
  COMPONENTS.includes(e.component) && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(e.version) &&
  Number.isSafeInteger(e.createdAt) && Number.isSafeInteger(e.nextAt) &&
  Number.isInteger(e.tries) && e.tries >= 0 && e.tries < DELAYS.length;

export function createDiagnosticSender({
  endpoint='',transport=globalThis.fetch,maxReports=MAX_EVENTS,
  storage=undefined,now=()=>Date.now(),idFactory=newId,
  onlineTarget=globalThis,timeout=globalThis.setTimeout,
  requestTimeoutMs=8_000,
}={}) {
  let enabled=false;
  try {const u=new URL(endpoint);enabled=u.protocol==='https:' && !!u.hostname &&
    typeof transport==='function';} catch {}
  const limit=Math.min(MAX_EVENTS,Math.max(0,Math.floor(maxReports)));
  let used=0,busy=false,timer=null;
  // Access localStorage lazily: SecurityError/private-mode failures must not break the timer.
  const getStorage=()=>{try {return storage===undefined?globalThis.localStorage:storage;} catch{return null;}};
  const timestamp=()=>Math.max(0,Math.floor(now()));
  const filter=(rows,time)=>Array.isArray(rows) ? rows.filter(e=>
    valid(e) && e.createdAt<=time && time-e.createdAt<TTL_MS).slice(-MAX_EVENTS):[];
  let queue=[];
  try {
    const persisted=getStorage()?.getItem(STORE_KEY);
    if(persisted && persisted.length<=MAX_BYTES)queue=filter(JSON.parse(persisted),timestamp()).map(e=>({
      id:e.id,event:e.event,code:e.code,component:e.component,version:e.version,
      createdAt:e.createdAt,nextAt:e.nextAt,tries:e.tries
    }));
  } catch {}
  function persist() {
    try {
      const data=JSON.stringify(queue);
      if(data.length>MAX_BYTES)throw new Error('queue size cap');
      getStorage()?.setItem(STORE_KEY,data);
    } catch {} // Fall back to bounded in-memory storage.
  }
  function prune() {queue=filter(queue,timestamp());persist();}
  function nextTimer(){
    if(timer!=null) {try{clearTimeout(timer);}catch{}timer=null;}
    if(!queue.length || !enabled || typeof timeout!=='function')return;
    const due=Math.min(...queue.map(e=>e.nextAt));
    const delay=Math.max(1000,Math.min(3_600_000,due-timestamp()));
    try {timer=timeout(()=>{timer=null;void flush();},delay);timer?.unref?.();} catch {}
  }
  async function flush() {
    if(!enabled || busy)return false;
    busy=true;
    let acknowledged=false;
    try{
      prune();
      for(const e of [...queue]) {
        if(e.nextAt>timestamp())continue;
        // Persist the retry schedule BEFORE transport, so a reloaded tab does
        // not hammer the receiver after an opaque/no-cors response.
        e.tries++;
        e.nextAt=timestamp()+DELAYS[Math.min(DELAYS.length-1,e.tries-1)];
        persist();
        try {
          // A fetch() can hang indefinitely when a mobile radio stalls. Bound
          // EACH attempt so a bad connection cannot starve the entire queue.
          const abort=typeof AbortController==='function'?new AbortController():null;
          let deadline=null;
          const network=Promise.resolve().then(()=>transport(endpoint,{
            method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
            redirect:'error',keepalive:true,
            headers:{'Content-Type':'text/plain;charset=UTF-8'},
            body:JSON.stringify(project(e)),
            ...(abort?{signal:abort.signal}:{}),
          }));
          const duration=Math.max(100,Math.min(30_000,Number(requestTimeoutMs)||8_000));
          const timeoutResponse=new Promise((_,reject)=>{
            deadline=globalThis.setTimeout(()=>{
              try{abort?.abort();}catch{}
              reject(new Error('diagnostic request timed out'));
            },duration);
            deadline?.unref?.();
          });
          try {
            const res=await Promise.race([network,timeoutResponse]);
            // Only a non-opaque server 204 confirms receipt, not Analytics persistence.
            if(res?.status===204 && res?.type!=='opaque'){
              queue=queue.filter(x=>x.id!==e.id);acknowledged=true;
            }
          }finally{if(deadline!=null)globalThis.clearTimeout(deadline);}
        }catch{} // Advisory telemetry: never interrupt the timer or UI.
        if(e.tries>=DELAYS.length)queue=queue.filter(x=>x.id!==e.id);
        persist();
      }
    }finally{busy=false;nextTimer();}
    return acknowledged;
  }
  const onOnline=()=>{void flush();};
  try {onlineTarget?.addEventListener?.('online',onOnline);} catch {}
  const api={
    get enabled(){return enabled;},
    get pending(){prune();return queue.length;},
    async report(raw) {
      if(!enabled || !raw || !ERROR_TYPES.has(raw.event) || used>=limit)return false;
      const safe=sanitizeDiagnosticEvent(raw);
      if(safe.version==='unknown')return false;
      prune();
      if(queue.length>=MAX_EVENTS)return false;
      const id=idFactory();
      if(typeof id!=='string' || !UUID.test(id))return false;
      used++;
      queue.push({id,event:safe.event,code:safe.code,component:safe.component,version:safe.version,
        createdAt:timestamp(),nextAt:timestamp(),tries:0});
      persist();
      // Fire and forget: no sound or UI waits for the network.
      void flush();
      return true; // Queued, NOT a server receipt.
    },
    flush,
    dispose() {
      try{onlineTarget?.removeEventListener?.('online',onOnline);}catch{}
      if(timer!=null){try{clearTimeout(timer);}catch{}timer=null;}
    }
  };
  // Attempt replay after reloading cached app (never blocks startup).
  if(queue.length)queueMicrotask(()=>{void flush();});
  return api;
}

export function attachBrowserErrorCapture({target,sender,version='unknown'}) {
  if(!target||!sender||typeof target.addEventListener!=='function')return ()=>{};
  const report=()=>{void sender.report({event:'app_error',code:'UNHANDLED_ERROR',component:'ui',version});};
  target.addEventListener('error',report);
  target.addEventListener('unhandledrejection',report);
  return ()=>{
    target.removeEventListener('error',report);
    target.removeEventListener('unhandledrejection',report);
  };
}
