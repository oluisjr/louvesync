import { createClient } from '@supabase/supabase-js';

const actions = new Set(['heartbeat', 'leave', 'view', 'online', 'viewers']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

function databaseFailure(res, error, upstreamStatus) {
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return res.status(503).json({ code: 'ACTIVITY_SETUP_REQUIRED', error: 'O monitoramento precisa ser ativado no banco.' });
  if (error?.code === '28000') return res.status(401).json({ error: 'Sessão inválida. Entre novamente no app.' });
  if (error?.code === '42501') return res.status(403).json({ error: 'Acesso exclusivo do administrador.' });
  if (error?.code === 'P0002') return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  if (['22023', '22P02', '22007', '22008'].includes(error?.code)) return res.status(400).json({ error: 'Solicitação de atividade inválida.' });
  if ([401, 403].includes(upstreamStatus) || ['PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) return res.status(503).json({
    code: 'ACTIVITY_SUPABASE_AUTH',
    error: 'O Supabase recusou a chave pública configurada na Vercel. Confira se a URL e a chave anon são do mesmo projeto, salve em Production e faça Redeploy.',
  });
  // Only fixed-format diagnostic codes are safe to return. Upstream messages,
  // details and hints may include SQL values or credential material.
  const databaseCode = typeof error?.code === 'string' && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code) ? error.code : null;
  const status = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : null;
  const diagnostic = databaseCode || (status ? `HTTP ${status}` : 'sem código');
  return res.status(503).json({
    code: 'ACTIVITY_DATABASE_ERROR',
    databaseCode,
    upstreamStatus: status,
    error: `O Supabase não conseguiu consultar as visualizações (${diagnostic}).`,
  });
}

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
    const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_ANON_KEY');
    if (missing.length) return res.status(503).json({
      code: 'ACTIVITY_UNAVAILABLE',
      missing,
      error: `Configure ${missing.map(name => `${name} (ou VITE_${name})`).join(' e ')} na Vercel em Production. Salve e faça Redeploy.`,
    });
    try {
      const client = clientFactory(url.trim(), key.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error, status } = await client.rpc('louvesync_activity', { p_payload: payload }).abortSignal(AbortSignal.timeout(8000));
      if (error) return databaseFailure(res, error, status);
      const valid = typeof data?.serverTime === 'string' && Number.isFinite(Date.parse(data.serverTime)) &&
        (payload.action === 'online' ? Array.isArray(data.members) : payload.action === 'viewers' ? Array.isArray(data.viewers) : data.ok === true);
      if (!valid) return res.status(503).json({ error: 'O monitoramento retornou uma resposta inválida.' });
      return res.status(200).json(data);
    } catch { return res.status(503).json({ error: 'Não foi possível conectar ao monitoramento.' }); }
  };
}
