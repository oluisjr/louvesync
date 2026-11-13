import { activityFailure } from './activity-errors.js';

const prefix = 'ls_content_view_v1:';

const validResponse = (data, action) => typeof data?.serverTime === 'string' && Number.isFinite(Date.parse(data.serverTime)) &&
  (action === 'online' ? Array.isArray(data.members) : action === 'viewers' ? Array.isArray(data.viewers) : data.ok === true);

export async function activityRequest(credentials, payload, options = {}) {
  if (!credentials?.memberId || !credentials.pin) throw new Error('Sessão de monitoramento indisponível. Entre novamente no app.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 10000);
  const body = { ...payload, memberId: credentials.memberId, pin: credentials.pin };
  const send = async (url, headers, rpc = false) => {
    const response = await (options.fetcher || fetch)(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, cache: 'no-store',
      body: JSON.stringify(rpc ? { p_payload: body } : body),
      signal: controller.signal, keepalive: !!options.keepalive,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = rpc ? activityFailure(data, response.status) : { status: response.status, body: data };
      const error = new Error(failure.body?.error || 'O monitoramento está temporariamente indisponível.');
      error.status = failure.status; error.code = failure.body?.code;
      throw error;
    }
    if (!validResponse(data, payload.action)) {
      const error = new Error('O monitoramento retornou uma resposta inválida.');
      error.status = 502;
      throw error;
    }
    return data;
  };
  try {
    let directError;
    const connection = options.connection;
    if (connection?.url && connection?.anonKey) {
      try {
        // Match the connection already used by members/events in this app.
        // Authorization and per-content aggregation stay in the existing RPC.
        return await send(connection.url.replace(/\/+$/, '') + '/rest/v1/rpc/louvesync_activity', { apikey: connection.anonKey, Authorization: `Bearer ${connection.anonKey}` }, true);
      } catch (error) {
        if (controller.signal.aborted || error.status < 500) throw error;
        directError = error;
      }
    }
    try { return await send('/api/activity'); }
    catch (error) {
      // Preserve the error from the app's actual project if both paths fail.
      if (directError && (!error.status || error.status >= 500)) throw directError;
      throw error;
    }
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Não foi possível conectar ao monitoramento.', { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

function validView(view) {
  return view && typeof view.viewId === 'string' && typeof view.memberId === 'string' &&
    ['event', 'announcement'].includes(view.targetType) && typeof view.targetId === 'string' &&
    typeof view.viewedAt === 'string' && Number.isFinite(Date.parse(view.viewedAt));
}

// One storage key per observation prevents two tabs from overwriting a shared array.
// Retries use the same view ID; the database makes them idempotent.
export function createViewRecorder({ storage, send = activityRequest, onSaved = () => {} } = {}) {
  if (!storage) { try { storage = globalThis.localStorage; } catch { /* Online recording still works. */ } }
  const memory = new Map(), flushing = new Map();
  const entries = () => {
    const views = new Map(memory);
    try {
      for (let i = 0; i < (storage?.length || 0); i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try { const value = JSON.parse(storage.getItem(key)); if (validView(value)) views.set(value.viewId, value); } catch { /* Ignore malformed local records. */ }
      }
    } catch { /* Private browsing may disable storage. */ }
    return [...views.values()].sort((a, b) => a.viewedAt.localeCompare(b.viewedAt));
  };
  const remove = view => {
    memory.delete(view.viewId);
    try { storage?.removeItem(prefix + view.viewId); } catch { /* Retry remains idempotent. */ }
  };
  return {
    add(memberId, targetType, targetId, viewedAt = new Date().toISOString()) {
      const view = { memberId, targetType, targetId, viewedAt, viewId: crypto.randomUUID() };
      if (!validView(view)) return null;
      memory.set(view.viewId, view);
      try { storage?.setItem(prefix + view.viewId, JSON.stringify(view)); } catch { /* Keep this session's record in memory. */ }
      return view;
    },
    pending: entries,
    flush(credentials) {
      if (!credentials) return Promise.resolve();
      if (flushing.has(credentials.memberId)) return flushing.get(credentials.memberId);
      const job = (async () => {
        let saved = false;
        const attempted = new Set();
        for (;;) {
          const view = entries().find(view => view.memberId === credentials.memberId && !attempted.has(view.viewId));
          if (!view) break;
          attempted.add(view.viewId);
          try { await send(credentials, { action: 'view', viewId: view.viewId, targetType: view.targetType, targetId: view.targetId, viewedAt: view.viewedAt }); remove(view); saved = true; }
          catch (error) {
            // Deleted content/invalid records must not block all later observations.
            if ([400, 404].includes(error.status)) { remove(view); continue; }
            break;
          }
        }
        if (saved) onSaved();
      })().finally(() => flushing.delete(credentials.memberId));
      flushing.set(credentials.memberId, job);
      return job;
    },
  };
}
