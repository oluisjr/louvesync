import { createClient } from '@supabase/supabase-js';

const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export function adminDeletionPayload(body) {
  if (!body || !['song', 'event'].includes(body.targetType) || !identifier(body.targetId) || !identifier(body.memberId) || typeof body.pin !== 'string' || !body.pin || body.pin.length > 256) return null;
  return { targetType:body.targetType, targetId:body.targetId, memberId:body.memberId, pin:body.pin };
}

export function createAdminDeleteHandler(clientFactory = createClient) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', 'POST');
    if (req.method !== 'POST') return res.status(405).json({ error:'Método não permitido.' });
    if (req.headers?.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error:'Origem não permitida.' }); }
      catch { return res.status(403).json({ error:'Origem não permitida.' }); }
    }
    if (!identifier(req.body?.memberId) || typeof req.body?.pin !== 'string' || !req.body.pin || req.body.pin.length > 256) return res.status(401).json({ error:'Sessão inválida. Entre novamente no app.' });
    const payload = adminDeletionPayload(req.body);
    if (!payload) return res.status(400).json({ error:'Solicitação de exclusão inválida.' });
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(503).json({ code:'ADMIN_DELETE_UNAVAILABLE', error:'A exclusão protegida ainda não está configurada no servidor.' });
    try {
      const client = clientFactory(url.trim(), key.trim(), { auth:{persistSession:false,autoRefreshToken:false} });
      const { data, error } = await client.rpc('louvesync_admin_delete', { p_payload:payload }).abortSignal(AbortSignal.timeout(10000));
      if (error) {
        if (error.code === '28000') return res.status(401).json({ error:'Sessão inválida. Entre novamente no app.' });
        if (error.code === '42501') return res.status(403).json({ error:'Acesso exclusivo do administrador.' });
        if (error.code === 'P0002') return res.status(404).json({ error:'Conteúdo não encontrado.' });
        if (['PGRST202','42P01','42883'].includes(error.code)) return res.status(503).json({ code:'ADMIN_DELETE_SETUP_REQUIRED', error:'A exclusão protegida precisa ser ativada no banco.' });
        if (['22023','22P02'].includes(error.code)) return res.status(400).json({ error:'Solicitação de exclusão inválida.' });
        if (error.code === '23503') return res.status(409).json({ error:'Este conteúdo ainda possui vínculos que impedem a exclusão.' });
        return res.status(503).json({ error:'Não foi possível confirmar a exclusão.' });
      }
      if (data?.ok !== true || data.targetType !== payload.targetType || data.targetId !== payload.targetId) return res.status(503).json({ error:'A exclusão não foi confirmada pelo banco.' });
      return res.status(200).json({ ok:true, targetType:data.targetType, targetId:data.targetId });
    } catch { return res.status(503).json({ error:'Não foi possível conectar para excluir.' }); }
  };
}

export default createAdminDeleteHandler();
