const limits = new Map();
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'O Maestro ainda não está configurado no servidor.' });
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { return res.status(403).json({ error: 'Origem inválida.' }); }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const now = Date.now();
  for (const [id, entry] of limits) if (now >= entry.until) limits.delete(id);
  const rate = limits.get(ip) || { count: 0, until: now + 300000 };
  if (++rate.count > 30) return res.status(429).json({ error: 'Muitas solicitações. Tente novamente em alguns minutos.' });
  limits.set(ip, rate);
  const { messages, model, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 30 || messages.some(item => !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 16000) || JSON.stringify(messages).length > 60000) return res.status(400).json({ error: 'Conversa inválida.' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages, model: model === 'llama-3.1-8b-instant' ? model : 'llama-3.3-70b-versatile', max_tokens: Math.min(2000, Math.max(1, Number(max_tokens) || 1300)) }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? 'O Maestro atingiu o limite de uso. Tente novamente mais tarde.' : 'O serviço de IA está indisponível.' });
    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch { return res.status(502).json({ error: 'Não foi possível conectar ao Maestro.' }); }
}
