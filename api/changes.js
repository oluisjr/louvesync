import { createClient } from '@supabase/supabase-js';
import { changesPayload, changeFailure, validChangesResponse } from '../src/lib/change-requests.js';
import { actorHeaders } from '../src/lib/member-session.js';
import { normalizeSupabaseUrl } from '../src/lib/supabase-url.js';
export function createChangesHandler(clientFactory = createClient, environment = process.env) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Allow', 'POST');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (req.headers?.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); } catch { return res.status(403).json({ error: 'Origem não permitida.' }); } }
    const body = changesPayload(req.body);
    if (!body) return res.status(400).json({ error: 'Dados da solicitação inválidos.' });
    const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL, key = environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(503).json({ error: 'As solicitações ainda não estão configuradas no servidor.' });
    try {
      const client = clientFactory(normalizeSupabaseUrl(url), key.trim(), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: actorHeaders(body) } });
      const { data, error } = await client.rpc('louvesync_changes', { p_payload: body }).abortSignal(AbortSignal.timeout(10000));
      if (error) { const failure = changeFailure(error); return res.status(failure.status).json({ error: failure.error }); }
      if (!validChangesResponse(data, body)) return res.status(503).json({ error: 'O servidor não confirmou esta solicitação.' });
      return res.status(200).json(data);
    } catch { return res.status(503).json({ error: 'Não foi possível conectar às solicitações.' }); }
  };
}
export default createChangesHandler();
