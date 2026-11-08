import { createClient } from '@supabase/supabase-js';

const actions = new Set(['heartbeat', 'leave', 'view', 'online', 'viewers']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

export function activityPayload(body) {
  if (!body || !actions.has(body.action) || !identifier(body.memberId) || typeof body.pin !== 'string' || !body.pin.length || body.pin.length > 256) return null;
  const payload = { action: body.action, memberId: body.memberId, pin: body.pin };
  if (body.action === 'heartbeat' || body.action === 'leave') {
    if (!uuid.test(body.sessionId || '') || !Number.isSafeInteger(body.version) || body.version < 1) return null;
    payload.sessionId = body.sessionId;
    payload.version = body.version;
  }
  if (body.action === 'view' || body.action === 'viewers') {
    if (!['event', 'announcement'].includes(body.targetType) || !identifier(body.targetId)) return null;
    Object.assign(payload, { targetType: body.targetType, targetId: body.targetId });
  }
  if (body.action === 'view') {
    if (!uuid.test(body.viewId || '') || typeof body.viewedAt !== 'string' || !Number.isFinite(Date.parse(body.viewedAt))) return null;
    Object.assign(payload, { viewId: body.viewId, viewedAt: new Date(body.viewedAt).toISOString() });
  }
  return payload;
}

export function createActivityHandler(clientFactory = createClient) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); }
      catch { return res.status(403).json({ error: 'Origem não permitida.' }); }
    }
    const payload = activityPayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Solicitação de atividade inválida.' });
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(503).json({ code: 'ACTIVITY_UNAVAILABLE', error: 'O monitoramento ainda não está configurado no servidor.' });
    try {
      const client = clientFactory(url.trim(), key.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.rpc('louvesync_activity', { p_payload: payload }).abortSignal(AbortSignal.timeout(8000));
      if (error) {
        if (['PGRST202', '42P01', '42883'].includes(error.code)) return res.status(503).json({ code: 'ACTIVITY_SETUP_REQUIRED', error: 'O monitoramento precisa ser ativado no banco.' });
        if (error.code === '28000') return res.status(401).json({ error: 'Sessão inválida. Entre novamente no app.' });
        if (error.code === '42501') return res.status(403).json({ error: 'Acesso exclusivo do administrador.' });
        if (error.code === 'P0002') return res.status(404).json({ error: 'Conteúdo não encontrado.' });
        if (['22023', '22P02', '22007', '22008'].includes(error.code)) return res.status(400).json({ error: 'Solicitação de atividade inválida.' });
        return res.status(503).json({ error: 'Não foi possível atualizar o monitoramento.' });
      }
      const valid = typeof data?.serverTime === 'string' && Number.isFinite(Date.parse(data.serverTime)) &&
        (payload.action === 'online' ? Array.isArray(data.members) : payload.action === 'viewers' ? Array.isArray(data.viewers) : data.ok === true);
      if (!valid) return res.status(503).json({ error: 'O monitoramento retornou uma resposta inválida.' });
      return res.status(200).json(data);
    } catch { return res.status(503).json({ error: 'Não foi possível conectar ao monitoramento.' }); }
  };
}
