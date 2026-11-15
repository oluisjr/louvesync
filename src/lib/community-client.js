import { Capacitor } from '@capacitor/core';
export function communityEndpoint() {
  const origin = globalThis.location?.origin || '';
  return Capacitor.isNativePlatform() && /^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:capacitor|ionic):.*)$/.test(origin) ? 'https://louvesync.vercel.app/api/community' : '/api/community';
}
export async function communityRequest(payload, { credentials, signal, fetcher=fetch, endpoint=communityEndpoint() } = {}) {
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...(credentials?{memberId:credentials.memberId,pin:credentials.pin}:{})}),signal,cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok){const error=new Error(data?.error||'Não foi possível carregar a comunidade. Tente novamente.');error.code=data?.code;throw error;}
  return data;
}
