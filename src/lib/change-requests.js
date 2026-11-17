import { canManageAttendance } from './attendance.js';
import { actorHeaders } from './member-session.js';
import { normalizeSupabaseUrl } from './supabase-url.js';
import { offlineAction, offlineRead, apiScope } from './offline-actions.js';
import { cacheRead, jobsFor } from './offline-store.js';

export const canManageMinistry = canManageAttendance;
export const changeKinds = { key: 'Troca de tom', song: 'Troca de música', song_edit: 'Edição de música', song_create: 'Nova música' };
export const changeStatuses = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Recusada', cancelled: 'Cancelada' };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function canRequestOwnKey(profile, event, songId) {
  return !!profile?.id && event?.type !== 'ensaio' && event?.singerBySong?.[songId] === profile.id && (event.members || []).includes(profile.id);
}
export function songProposal(song, creating = false) {
  const fields = ['title', 'artist', 'cat', 'bpm', 'time_signature', 'tags', 'yturl', 'media_url', 'lyrics', ...(creating ? ['key'] : [])];
  return Object.fromEntries(fields.filter(key => Object.hasOwn(song, key)).map(key => [key, song[key]]));
}
export function changesPayload(body) {
  if (!id(body?.memberId) || typeof body.pin !== 'string' || !body.pin || body.pin.length > 256 || !['request', 'list', 'audit', 'decide', 'cancel'].includes(body.action)) return null;
  const out = { action: body.action, memberId: body.memberId, pin: body.pin };
  if (body.eventId != null) { if (!id(body.eventId)) return null; out.eventId = body.eventId; }
  if (body.action === 'list') {
    if (body.status != null && !['all', 'pending'].includes(body.status)) return null;
    if (body.status) out.status = body.status;
    if (body.beforeRequest) { if (!uuid(body.beforeRequest)) return null; out.beforeRequest = body.beforeRequest; }
  } else if (body.action === 'audit') {
    if (body.beforeId != null) { if (!/^\d{1,19}$/.test(String(body.beforeId))) return null; out.beforeId = String(body.beforeId); }
  } else {
    if (!uuid(body.requestId)) return null; out.requestId = body.requestId;
    if (body.action === 'request') {
      if (!Object.hasOwn(changeKinds, body.kind) || !id(body.songId) || !body.proposal || Array.isArray(body.proposal) || typeof body.proposal !== 'object' || JSON.stringify(body.proposal).length > 200000 || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500) return null;
      if (['key', 'song'].includes(body.kind) && !out.eventId) return null;
      out.kind = body.kind; out.songId = body.songId; out.reason = body.reason.trim();
      out.proposal = body.kind === 'key' ? { key: body.proposal.key } : body.kind === 'song' ? { songId: body.proposal.songId } : songProposal(body.proposal, body.kind === 'song_create');
      if (body.kind === 'key' && !/^[A-G](#|b)?m?$/.test(out.proposal.key || '')) return null;
      if (body.kind === 'song' && !id(out.proposal.songId)) return null;
    } else if (body.action === 'decide') {
      if (!['approved', 'rejected'].includes(body.decision) || (body.decisionNote != null && (typeof body.decisionNote !== 'string' || body.decisionNote.length > 500))) return null;
      out.decision = body.decision; out.decisionNote = body.decisionNote?.trim() || '';
    }
  }
  return out;
}
export function changeFailure(error) {
  if (error?.code === '28000') return { status: 401, error: 'Sessão inválida. Entre novamente no app.' };
  if (error?.code === '42501') return { status: 403, error: 'Você não tem permissão para esta alteração. Tons só podem ser solicitados pelo vocal escalado; decisões são exclusivas da liderança.' };
  if (error?.code === '40001') return { status: 409, error: 'O repertório ou a solicitação mudou. Atualize a lista e revise antes de continuar.' };
  if (error?.code === '23505') return { status: 409, error: 'Você já tem um pedido pendente para esta alteração. Consulte Meus pedidos.' };
  if (error?.code === 'P0002') return { status: 404, error: 'O evento, a música ou a solicitação não foi encontrado. Atualize a lista.' };
  if (['22023', '22P02', '23502', '23514'].includes(error?.code)) return { status: 400, error: 'Confira os dados e o motivo da solicitação.' };
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return { status: 503, error: 'As solicitações ainda precisam ser ativadas no servidor.' };
  return { status: 503, error: 'Não foi possível confirmar a operação. Tente novamente.' };
}
const validRequest = request => uuid(request?.id) && id(request.actor_id) && typeof request.actor_name === 'string' && Object.hasOwn(changeKinds, request.kind) && Object.hasOwn(changeStatuses, request.status) && id(request.source_song_id) && typeof request.created_at === 'string';
export function validChangesResponse(data, payload) {
  if (data?.ok !== true) return false;
  if (payload.action === 'list') return Array.isArray(data.requests) && data.requests.every(validRequest) && Number.isSafeInteger(data.pendingCount) && typeof data.hasMore === 'boolean';
  if (payload.action === 'audit') return Array.isArray(data.entries) && data.entries.every(entry => entry && typeof entry.actor_name === 'string' && typeof entry.entity_type === 'string' && ['INSERT', 'UPDATE', 'DELETE'].includes(entry.action) && Array.isArray(entry.changed_fields)) && typeof data.hasMore === 'boolean';
  if (!validRequest(data.request) || data.request.id !== payload.requestId) return false;
  if (payload.action === 'request') return data.request.actor_id === payload.memberId && data.request.kind === payload.kind && data.request.source_song_id === payload.songId;
  return data.request.status === (payload.action === 'cancel' ? 'cancelled' : payload.decision) && data.request.decided_by === payload.memberId;
}
export async function changesRequest(credentials, payload, options = {}) {
  const body = changesPayload({ ...payload, memberId: credentials?.memberId, pin: credentials?.pin });
  if (!body) throw new Error('Confira sua sessão e os dados da solicitação.');
  if (!options.offlineBypass) {
    const send = () => changesRequest(credentials, payload, { ...options, offlineBypass: true });
    if (['list', 'audit'].includes(payload.action)) {
      const result = await offlineRead(apiScope('changes', credentials.memberId, payload), send);
      if (payload.action !== 'list') return result;
      const local = jobsFor(credentials.memberId).filter(job => job.type === 'changes' && job.data.action === 'request' && (!payload.eventId || job.data.eventId === payload.eventId)).map(job => pendingChange(job.data, credentials.memberId));
      const queued=jobsFor(credentials.memberId).filter(job=>job.type==='changes');
      return { ...result, requests: [...local.filter(request => !result.requests.some(saved => saved.id === request.id)), ...result.requests].map(request=>queued.some(job=>job.data.requestId===request.id)?{...request,_pendingOffline:true}:request) };
    }
    const previous = cacheRead(apiScope('changes', credentials.memberId, { action: 'list' }))?.requests?.find(request => request.id === payload.requestId);
    return offlineAction('changes', payload, send, { ok: true, pendingOffline: true, request: payload.action === 'request' ? pendingChange(payload, credentials.memberId) : { ...previous, id: payload.requestId, _pendingOffline: true } }, credentials.memberId);
  }
  const controller = new AbortController(), abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  const send = async (url, headers, rpc = false) => {
    const response = await (options.fetcher || fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...actorHeaders(credentials), ...headers }, cache: 'no-store', signal: controller.signal, body: JSON.stringify(rpc ? { p_payload: body } : body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) { const failure = rpc ? changeFailure(data) : { status: response.status, error: data?.error || 'A operação não foi confirmada.' }; const error = new Error(failure.error); error.status = failure.status; throw error; }
    if (!validChangesResponse(data, body)) throw new Error('A resposta do servidor não confirmou esta solicitação. Atualize e confira o registro.');
    return data;
  };
  try {
    const c = options.connection;
    if (c?.url && c.anonKey) {
      try { return await send(normalizeSupabaseUrl(c.url) + '/rest/v1/rpc/louvesync_changes', { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}`, 'Content-Profile': 'public' }, true); }
      catch (error) { if (controller.signal.aborted || error.status < 500) throw error; }
    }
    return await send('/api/changes');
  } catch (error) { if (controller.signal.aborted) throw new Error('A solicitação não foi confirmada. Verifique a conexão e tente novamente.', { cause: error }); throw error; }
  finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}

function pendingChange(payload, owner) {
  return { id: payload.requestId, actor_id: owner, actor_name: 'Você', kind: payload.kind, source_song_id: payload.songId, event_id: payload.eventId, proposal: payload.proposal, reason: payload.reason, status: 'pending', created_at: new Date().toISOString(), _pendingOffline: true };
}
