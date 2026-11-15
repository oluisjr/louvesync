import { attendanceFailure, attendancePayload, validAttendanceResponse } from './attendance.js';
import { normalizeSupabaseUrl } from './supabase-url.js';

export async function attendanceRequest(credentials, payload, options = {}) {
  if (!credentials?.memberId || !credentials.pin) throw new Error('Não foi possível validar a sessão. Entre novamente no app.');
  const body = attendancePayload({ ...payload, memberId: credentials.memberId, pin: credentials.pin });
  if (!body) throw new Error('Dados da chamada inválidos.');
  const controller = new AbortController(), abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  const send = async (url, headers = {}, rpc = false) => {
    const response = await (options.fetcher || fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, cache: 'no-store', signal: controller.signal, body: JSON.stringify(rpc ? { p_payload: body } : body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = rpc ? attendanceFailure(data) : { status: response.status, error: data?.error || 'Não foi possível salvar a chamada.' };
      const error = new Error(failure.error); error.status = failure.status; throw error;
    }
    if (!validAttendanceResponse(data, body)) throw new Error('O servidor não confirmou os dados da chamada. Atualize e confira o registro.');
    return data;
  };
  try {
    const connection = options.connection;
    if (connection?.url && connection.anonKey) {
      try { return await send(normalizeSupabaseUrl(connection.url) + '/rest/v1/rpc/louvesync_attendance', { apikey: connection.anonKey, Authorization: `Bearer ${connection.anonKey}`, 'Content-Profile': 'public' }, true); }
      catch (error) { if (controller.signal.aborted || error.status < 500) throw error; }
    }
    return await send('/api/attendance');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A chamada não foi confirmada. Confira sua conexão e tente novamente.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
