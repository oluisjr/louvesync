import { Capacitor } from '@capacitor/core';
import { offlineAction, offlineRead, apiScope } from './offline-actions.js';
import { visitorOwner } from './offline-store.js';
export function communityEndpoint() {
  const origin = globalThis.location?.origin || '';
  return Capacitor.isNativePlatform() && /^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:capacitor|ionic):.*)$/.test(origin) ? 'https://louvesync.vercel.app/api/community' : '/api/community';
}
export async function communityRequest(payload, { credentials, signal, fetcher=fetch, endpoint=communityEndpoint(), offlineBypass=false } = {}) {
  if (!offlineBypass) {
    const owner = credentials?.memberId || visitorOwner;
    const send = () => communityRequest(payload, { credentials, signal, fetcher, endpoint, offlineBypass: true });
    if (['public', 'admin_list'].includes(payload.action)) return offlineRead(apiScope('community', payload.action === 'public' ? visitorOwner : owner, payload), send);
    return offlineAction('community', payload, send, { ok: true, id: payload.id, pendingOffline: true }, owner);
  }
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...(credentials?{memberId:credentials.memberId,pin:credentials.pin}:{})}),signal,cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok){const error=new Error(data?.error||'Não foi possível carregar a comunidade. Tente novamente.');error.code=data?.code;error.status=response.status;throw error;}
  return data;
}
