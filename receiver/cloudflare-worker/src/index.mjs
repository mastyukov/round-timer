/**
 * Minimal Round Timer technical-error receiver.
 * Four analytics dimensions only; one-off event ID lives in optional
 * short-term KV dedupe store and is NEVER sent to Analytics Engine.
 * No identities, device IDs, request URLs, exceptions, or workout data.
 */
const TYPES=new Set(['app_error','asset_error','audio_failure']);
const CODES=new Set(['UNHANDLED_ERROR','AUDIO_PLAY_REJECTED','CACHE_INSTALL_FAILED','ASSET_LOAD_FAILED','UNKNOWN']);
const COMPONENTS=new Set(['ui','audio','cache','assets','other']);
const ORIGINS=new Set(['https://mastyukov.github.io','https://mastyukov-cyber.github.io','https://round-timer-pwa.pages.dev']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEDUPE_TTL_SECONDS=24*3600;

export function extractError(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw) || !TYPES.has(raw.event) ||
      !CODES.has(raw.code)||!COMPONENTS.has(raw.component) ||
      typeof raw.version!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw.version))return null;
  // Old clients may send the original four-field payload.
  // New clients add exactly one ephemeral, random per-error ID.
  if(raw.eventId!==undefined && (typeof raw.eventId!=='string'||!UUID.test(raw.eventId)))return null;
  return {dimensions:[raw.event,raw.code,raw.component,raw.version],eventId:raw.eventId||null};
}

function response(status,origin,headers={}) {
  return new Response(null,{status,headers:{
    'Cache-Control':'no-store','Vary':'Origin',
    ...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),...headers
  }});
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin'),url=new URL(request.url);
    if(url.pathname!=='/v1/error')return response(404,origin);
    if(!ORIGINS.has(origin))return response(403,origin);
    if(request.method==='OPTIONS') {
      return response(204,origin,{
        'Access-Control-Allow-Methods':'POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type',
        'Access-Control-Max-Age':'600'
      });
    }
    if(request.method!=='POST')return response(405,origin);
    const length=Number(request.headers.get('Content-Length'));
    if(Number.isFinite(length)&&length>400)return response(413,origin);
    if(!env.ERROR_EVENTS || typeof env.ERROR_EVENTS.writeDataPoint!=='function')return response(503,origin);
    let body;
    try{
      const raw=await request.text();
      if(raw.length>400)return response(413,origin);
      body=JSON.parse(raw);
    }catch{return response(400,origin);}
    const safe=extractError(body);
    if(!safe)return response(400,origin);
    const key=safe.eventId?'round-timer-event:'+safe.eventId:null;
    if(key && (!env.ERROR_DEDUP_KV ||
       typeof env.ERROR_DEDUP_KV.get!=='function'||typeof env.ERROR_DEDUP_KV.put!=='function'))
      return response(503,origin);
    try{
      if(key && await env.ERROR_DEDUP_KV.get(key)!==null)
        return response(204,origin); // Duplicate sequential retry; no additional count.
    }catch{return response(503,origin);}
    if(!env.ERROR_RATE_LIMIT || typeof env.ERROR_RATE_LIMIT.limit!=='function')return response(503,origin);
    try{
      const limit=await env.ERROR_RATE_LIMIT.limit({key:'round-timer-technical-errors'});
      if(!limit?.success)return response(429,origin);
    }catch{return response(503,origin);}
    try{
      // Do not mark a dedupe key before the Analytics Engine write has
      // returned: that could yield a false 204 on retry after a failed write.
      // KV is eventually consistent, NOT a transactional exactly-once store.
      env.ERROR_EVENTS.writeDataPoint({
        blobs:safe.dimensions,doubles:[1],indexes:['round-timer-errors']
      });
      if(key)await env.ERROR_DEDUP_KV.put(key,'1',{expirationTtl:DEDUPE_TTL_SECONDS});
    }catch{return response(503,origin);}
    // 204 confirms receiver processing; Analytics Engine persistence requires
    // independent aggregate verification. It is NOT an individual-storage proof.
    return response(204,origin);
  }
};
