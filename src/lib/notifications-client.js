export async function notificationRequest(credentials, payload, { signal, fetcher = fetch, keepalive = false } = {}) {
  if (!credentials?.memberId || !credentials?.pin) throw new Error('Entre novamente para acessar as notificações.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once:true });
  const timer = setTimeout(cancel, 12000);
  try {
    const response = await fetcher('/api/notifications', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', keepalive, signal:controller.signal, body:JSON.stringify({...payload,memberId:credentials.memberId,pin:String(credentials.pin)}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      const error = new Error(data?.error || 'Não foi possível atualizar as notificações.');
      error.status=response.status; error.setupRequired=data?.setupRequired===true; throw error;
    }
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
}

export function pushSupport(environment = globalThis) {
  const ios = /iPad|iPhone|iPod/.test(environment.navigator?.userAgent || '');
  const installed = environment.navigator?.standalone === true || environment.matchMedia?.('(display-mode: standalone)').matches;
  if (ios && !installed) return {supported:false,reason:'No iPhone, adicione o app à Tela de Início e abra pelo ícone para ativar os avisos.'};
  if (!environment.isSecureContext || !environment.Notification || !environment.PushManager || !environment.navigator?.serviceWorker) return {supported:false,reason:'Este navegador não oferece avisos com o app fechado. As notificações continuam disponíveis aqui.'};
  return {supported:true,reason:''};
}

export function applicationServerKey(value) {
  const binary=atob(value.replaceAll('-','+').replaceAll('_','/'));
  return Uint8Array.from(binary,character=>character.charCodeAt(0));
}

export function notificationDestination(item, origin) {
  try {
    const url=new URL(item.url || '/',origin);
    if (url.origin!==origin) return null;
    const tab=url.searchParams.get('tab') || (item.type==='song_added'?'repertorio':'escala');
    if (!['escala','repertorio','mural'].includes(tab)) return null;
    return {tab,eventId:url.searchParams.get('event') || (tab==='escala'?item.targetId:null),songId:url.searchParams.get('song') || (tab==='repertorio'?item.targetId:null)};
  } catch {return null;}
}
