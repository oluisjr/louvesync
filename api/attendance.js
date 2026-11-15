import { actorHeaders } from '../src/lib/member-session.js';
import { createClient } from '@supabase/supabase-js';
import { attendanceFailure, attendancePayload, validAttendanceResponse } from '../src/lib/attendance.js';
import { normalizeSupabaseUrl } from '../src/lib/supabase-url.js';

export function createAttendanceHandler(clientFactory = createClient, environment = process.env) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Allow', 'POST');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (req.headers?.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); }
      catch { return res.status(403).json({ error: 'Origem não permitida.' }); }
    }
    const payload = attendancePayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Dados da chamada inválidos.' });
    const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL, key = environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(503).json({ error: 'O registro de presença ainda não está configurado no servidor.' });
    try {
      const client = clientFactory(normalizeSupabaseUrl(url), key.trim(), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: actorHeaders(payload) } });
      const { data, error } = await client.rpc('louvesync_attendance', { p_payload: payload }).abortSignal(AbortSignal.timeout(10000));
      if (error) { const failure = attendanceFailure(error); return res.status(failure.status).json({ error: failure.error }); }
      if (!validAttendanceResponse(data, payload)) return res.status(503).json({ error: 'A gravação da chamada não foi confirmada pelo servidor.' });
      return res.status(200).json(data);
    } catch { return res.status(503).json({ error: 'Não foi possível conectar ao registro de presença.' }); }
  };
}

export default createAttendanceHandler();
