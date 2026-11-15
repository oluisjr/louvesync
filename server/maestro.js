import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '../src/lib/supabase-url.js';
import { canSeeScreen } from '../src/lib/member-settings.js';
import { actorHeaders } from '../src/lib/member-session.js';

export function maestroConfig(environment) {
  const entries = [['GROQ_API_KEY', 'groq'], ['XAI_API_KEY', 'xai'], ['GROK_API_KEY', 'xai'], ['VITE_GROQ_API_KEY', 'groq']];
  const selected = entries.find(([name]) => environment[name]?.trim());
  if (!selected) return null;
  const key = environment[selected[0]].trim(), provider = key.startsWith('gsk_') ? 'groq' : key.startsWith('xai-') || key.startsWith('xai_') ? 'xai' : selected[1];
  return { key, provider, model: environment.MAESTRO_MODEL?.trim() || (provider === 'groq' ? environment.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile' : environment.XAI_MODEL?.trim() || environment.GROK_MODEL?.trim() || 'grok-4.3'),
    url: provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions' };
}
async function verifySession(body, environment) {
  const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL, key = environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('auth_not_configured');
  const client = createClient(normalizeSupabaseUrl(url), key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: actorHeaders(body) } });
  const { data, error } = await client.rpc('louvesync_login', { p_payload: { memberId: body.memberId, pin: body.pin } }).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error('auth_unavailable');
  return data?.ok && data.member?.id === body.memberId ? data.member : null;
}
export function createMaestroHandler({ environment = process.env, fetcher = fetch, verifyActor = verifySession, now = Date.now } = {}) {
  const limits = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const origin = req.headers?.origin, host = req.headers?.host;
    const nativeOrigins = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'];
    if (origin) {
      let allowed = nativeOrigins.includes(origin);
      try { allowed ||= new URL(origin).host === host; } catch { /* Invalid origins are refused. */ }
      if (!allowed) return res.status(403).json({ code: 'origin_denied', error: 'Origem não permitida.' });
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-louvesync-member, x-louvesync-pin');
    }
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    const config = maestroConfig(environment);
    if (!config) return res.status(503).json({ code: 'not_configured', error: 'O Maestro ainda não está disponível. Avise a liderança e tente novamente depois.' });
    const { messages, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || !messages.length || messages.length > 30 || messages.some(item => !item || !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 16000) || JSON.stringify(messages).length > 60000) return res.status(400).json({ code: 'invalid_conversation', error: 'Conversa inválida.' });
    const { memberId, pin, purpose } = req.body;
    if (typeof memberId !== 'string' || !memberId || memberId.length > 128 || typeof pin !== 'string' || !pin || pin.length > 256) return res.status(401).json({ code: 'invalid_session', error: 'Entre novamente no app para conversar com o Maestro.' });
    let actor;
    try { actor = await verifyActor({ memberId, pin }, environment); }
    catch { return res.status(503).json({ code: 'auth_unavailable', error: 'Não foi possível validar seu acesso. Tente novamente.' }); }
    if (!actor) return res.status(401).json({ code: 'invalid_session', error: 'Sua sessão expirou. Entre novamente no app.' });
    if (!canSeeScreen(actor, purpose === 'chart' ? 'repertorio' : 'ia')) return res.status(403).json({ code: 'screen_denied', error: 'A liderança não liberou este recurso para seu perfil.' });
    const time = now();
    for (const [id, entry] of limits) if (time >= entry.until) limits.delete(id);
    const rate = limits.get(memberId) || { count: 0, until: time + 300000 };
    if (++rate.count > 30) return res.status(429).json({ code: 'rate_limited', error: 'Muitas solicitações. Aguarde alguns minutos.' });
    limits.set(memberId, rate);
    try {
      const response = await fetcher(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key },
        body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })), model: config.model, max_tokens: Math.min(2000, Math.max(1, Number(max_tokens) || 900)), stream: false }), signal: AbortSignal.timeout(40000) });
      if (!response.ok) {
        const kind = response.status === 401 || response.status === 403 ? 'provider_auth' : response.status === 404 ? 'provider_model' : response.status === 429 ? 'provider_quota' : 'provider_unavailable';
        return res.status(response.status === 429 ? 429 : 503).json({ code: kind, error: kind === 'provider_quota' ? 'O serviço de IA atingiu o limite de uso ou de créditos. Tente novamente mais tarde.' : kind === 'provider_auth' ? 'A configuração do Maestro foi recusada pelo serviço de IA. Avise a liderança.' : kind === 'provider_model' ? 'O modelo de IA configurado não está disponível. Avise a liderança.' : 'O serviço de IA está indisponível. Tente novamente.' });
      }
      const data = await response.json();
      if (typeof data.choices?.[0]?.message?.content !== 'string' || !data.choices[0].message.content.trim()) return res.status(502).json({ code: 'empty_reply', error: 'O Maestro não recebeu uma resposta completa. Tente novamente.' });
      return res.status(200).json({ choices: [{ message: { role: 'assistant', content: data.choices[0].message.content } }] });
    } catch (error) { return res.status(504).json({ code: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'provider_timeout' : 'provider_network', error: 'O Maestro não conseguiu responder agora. Seu texto foi preservado para tentar novamente.' }); }
  };
}
