import { connectionSucceeded, connectionFailed, networkFailure } from './connectivity.js';
import { cacheRead, cacheWrite } from './offline-store.js';
let currentActor = null;

export function readActorSession() {
  try {
    const actor = JSON.parse(localStorage.getItem('ls_actor_session') || 'null');
    return typeof actor?.memberId === 'string' && typeof actor.pin === 'string' && actor.pin ? { memberId: actor.memberId, pin: actor.pin } : null;
  } catch { return null; }
}

export function setMutationActor(actor) {
  currentActor = actor?.memberId && typeof actor.pin === 'string' && actor.pin ? { memberId: String(actor.memberId), pin: actor.pin } : null;
}
export function mutationActor() { return currentActor ? { ...currentActor } : null; }
export function actorHeaders(actor) {
  return actor?.memberId && actor.pin ? { 'x-louvesync-member': String(actor.memberId), 'x-louvesync-pin': String(actor.pin) } : {};
}
export function authenticatedFetch(projectUrl, fetcher = fetch, actorSource = () => currentActor) {
  const origin = new URL(projectUrl).origin;
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    // Keep credentials off third-party requests and public storage downloads.
    const actor=actorSource();
    if (new URL(url).origin === origin && new URL(url).pathname.startsWith('/rest/v1/')) {
      for (const [name, value] of Object.entries(actorHeaders(actor))) headers.set(name, value);
    }
    const canCache = new URL(url).origin === origin && new URL(url).pathname.startsWith('/rest/v1/') && !/\/rpc\//.test(url) && (init.method || 'GET').toUpperCase() === 'GET';
    const cacheKey = `rest:${actor?.memberId || 'public'}:${url}`;
    let bucket=null;
    if(canCache&&globalThis.caches)try{bucket=await caches.open('ls-private-data-v1:'+encodeURIComponent(actor?.memberId||'public'));}catch{/* Storage restrictions leave the last local fallback available. */}
    const cachedResponse=async()=>{
      if(bucket){const cached=await bucket.match(url,{ignoreVary:true});if(cached)return cached;}
      const cached=cacheRead(cacheKey);return cached?new Response(cached.body,{status:cached.status,headers:cached.headers}):null;
    };
    if (canCache && globalThis.navigator?.onLine===false) {
      const cached=await cachedResponse();
      if(cached)return cached;
      throw new TypeError('Conteúdo ainda não disponível offline.');
    }
    try {
      const response = await fetcher(input, { ...init, headers });
      if(response.ok)connectionSucceeded();
      if(canCache&&response.ok){
        if(bucket)try{await bucket.put(url,response.clone());}catch{/* A full cache never invalidates a confirmed server response. */}
        else cacheWrite(cacheKey,{status:response.status,body:await response.clone().text(),headers:Object.fromEntries(response.headers)});
      }
      return response;
    } catch (error) {
      if (canCache && networkFailure(error)) {
        connectionFailed();const cached=await cachedResponse();if(cached)return cached;
      }
      throw error;
    }
  };
}
export function publicMember(member) {
  const { pin: _pin, ...safe } = member || {};
  return safe;
}
export const memberColumns = 'id,name,role,instrument,avatar,color,status,is_admin,vocal_category,access_type';
