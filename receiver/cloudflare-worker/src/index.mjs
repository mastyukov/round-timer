/**
 * Round Timer: minimal error-only ingestion Worker.
 * Runtime: Cloudflare Workers + Analytics Engine binding ERROR_EVENTS.
 * DO NOT deploy without owner's approval and Russia reachability testing.
 *
 * No cookies, user IDs, IPs, URL paths, device metadata, training statistics,
 * raw exceptions, stack traces, location, or custom client text are stored.
 */
const EVENT_TYPES = new Set(['app_error','asset_error','audio_failure']);
const ERROR_CODES = new Set([
  'UNHANDLED_ERROR','AUDIO_PLAY_REJECTED','CACHE_INSTALL_FAILED',
  'ASSET_LOAD_FAILED','UNKNOWN'
]);
const COMPONENTS = new Set(['ui','audio','cache','assets','other']);
const ALLOWED_ORIGINS = new Set([
  'https://mastyukov.github.io',
  'https://mastyukov-cyber.github.io',
  'https://round-timer-pwa.pages.dev'
]);

export function extractError(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!EVENT_TYPES.has(raw.event) ||
      !ERROR_CODES.has(raw.code) ||
      !COMPONENTS.has(raw.component)) return null;
  if (typeof raw.version !== 'string' ||
      !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(raw.version)) return null;
  // Only four strict fields survive. Discard all other input, even if present.
  return [raw.event,raw.code,raw.component,raw.version];
}

function reply(status) {
  return new Response(null,{status,headers:{'Cache-Control':'no-store'}});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (url.pathname !== '/v1/error') return reply(404);
    if (request.method !== 'POST') return reply(405);
    const origin=request.headers.get('Origin');
    if (!ALLOWED_ORIGINS.has(origin)) return reply(403);
    const length=Number(request.headers.get('Content-Length'));
    if (Number.isFinite(length) && length > 400) return reply(413);
    if (!env.ERROR_EVENTS || typeof env.ERROR_EVENTS.writeDataPoint !== 'function') {
      return reply(503);
    }
    let body;
    try {
      const source=await request.text();
      if(source.length>400) return reply(413);
      body=JSON.parse(source);
    } catch {
      return reply(400);
    }
    const safe=extractError(body);
    if(!safe) return reply(400);
    // Analytics Engine stores time automatically. No sampling key/user identifier.
    env.ERROR_EVENTS.writeDataPoint({blobs:safe,doubles:[1],indexes:[]});
    return reply(204);
  }
};
