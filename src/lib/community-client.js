import { Capacitor } from '@capacitor/core';
import { offlineAction, offlineRead, apiScope } from './offline-actions.js';
import { visitorOwner } from './offline-store.js';
export function communityEndpoint() {
  const origin = globalThis.location?.origin || '';
  return Capacitor.isNativePlatform() && /^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:capacitor|ionic):.*)$/.test(origin) ? 'https://louvesync.vercel.app/api/community' : '/api/community';
}
export async function communityRequest(payload, { credentials, signal, fetcher=fetch, endpoint=communityEndpoint(), offlineBypass=false } = {}) {
  if(payload.action==='submit_prayer'){
    const name=(payload.name || '').trim();
    const anonymous=payload.anonymous || !name;
    payload={...payload,name:anonymous?'':name,anonymous,visibility:'team'};
  }
  if(payload.action==='review_prayer') payload={...payload,published:false};
  if (!offlineBypass) {
    const owner = credentials?.memberId || visitorOwner;
    const send = () => communityRequest(payload, { credentials, signal, fetcher, endpoint, offlineBypass: true });
    if (payload.action==='public') {
      const data=await offlineRead(apiScope('community',visitorOwner,payload),send);
      return {ok:true,events:data.events || [],_offlineCached:data._offlineCached};
    }
    if (payload.action==='admin_list') return offlineRead(apiScope('community',owner,payload),send);
    return offlineAction('community', payload, send, { ok: true, id: payload.id, pendingOffline: true }, owner);
  }
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...(credentials?{memberId:credentials.memberId,pin:credentials.pin}:{})}),signal,cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok){const error=new Error(data?.error||'Não foi possível carregar a comunidade. Tente novamente.');error.code=data?.code;error.status=response.status;throw error;}
  return data;
}
