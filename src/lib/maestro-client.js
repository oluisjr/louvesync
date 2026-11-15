import { Capacitor } from '@capacitor/core';
import { actorHeaders } from './member-session.js';

export function maestroEndpoint({ origin = globalThis.location?.origin, native = Capacitor.isNativePlatform(), configuredOrigin } = {}) {
  const local = !origin || /^(?:capacitor|ionic):/.test(origin) || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  return native && local ? (configuredOrigin || 'https://louvesync.vercel.app').replace(/\/+$/, '') + '/api/maestro' : '/api/maestro';
}
export async function maestroRequest(credentials, messages, { fetcher = fetch, signal, purpose = 'chat', endpoint = maestroEndpoint(), maxTokens = 900 } = {}) {
  if (!credentials?.memberId || !credentials.pin) throw new Error('Entre novamente no app para usar o Maestro.');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort(); signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 55000);
  try {
    const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...actorHeaders(credentials) }, cache: 'no-store', signal: controller.signal,
      body: JSON.stringify({ memberId: credentials.memberId, pin: credentials.pin, purpose, messages, max_tokens: maxTokens }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(data?.error || 'O Maestro está indisponível. Tente novamente.'); error.code = data?.code; throw error; }
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('O Maestro não recebeu uma resposta completa. Tente novamente.');
    return reply;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A resposta demorou mais que o esperado. Seu texto está preservado para tentar novamente.',{cause:error});
    if (error instanceof TypeError) throw new Error('Não foi possível alcançar o Maestro. Confira a conexão e tente novamente.',{cause:error});
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
