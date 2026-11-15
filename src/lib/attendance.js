import { isNotificationLeader } from './notification-policy.js';

export const attendanceStatuses = { present: 'Presente', absent: 'Ausente', excused: 'Falta justificada' };
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export const validAttendanceDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function canManageAttendance(member) {
  return isNotificationLeader(member) && (!member.status || ['ativo', 'ativa', 'active'].includes(String(member.status).trim().toLowerCase()));
}

export function attendancePayload(body) {
  if (!body || !identifier(body.memberId) || typeof body.pin !== 'string' || !body.pin || body.pin.length > 256 || !['list', 'get', 'save'].includes(body.action)) return null;
  const payload = { action: body.action, memberId: body.memberId, pin: body.pin };
  if (body.action === 'list') {
    if (!validAttendanceDate(body.from) || !validAttendanceDate(body.to) || body.from > body.to || Date.parse(body.to) - Date.parse(body.from) > 366 * 86400000) return null;
    return { ...payload, from: body.from, to: body.to };
  }
  if (!identifier(body.eventId)) return null;
  payload.eventId = body.eventId;
  if (body.action === 'get') return payload;
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version > 2147483646 || typeof body.finalize !== 'boolean' || !Array.isArray(body.entries) || !body.entries.length || body.entries.length > 300) return null;
  if (new Set(body.entries.map(entry => entry?.memberId)).size !== body.entries.length) return null;
  const entries = [];
  for (const entry of body.entries) {
    if (!identifier(entry?.memberId) || !(entry.status === null || Object.hasOwn(attendanceStatuses, entry.status)) || typeof entry.note !== 'string' || entry.note.length > 500) return null;
    entries.push({ memberId: entry.memberId, status: entry.status, note: entry.note.trim() });
  }
  return { ...payload, version: body.version, finalize: body.finalize, entries };
}

export function attendanceCounts(roster = []) {
  const counts = { total: roster.length, present: 0, absent: 0, excused: 0, pending: 0 };
  for (const person of roster) counts[Object.hasOwn(attendanceStatuses, person.status) ? person.status : 'pending']++;
  return { ...counts, rate: counts.total ? Math.round(counts.present / counts.total * 100) : null };
}

export function attendanceByMember(sheets) {
  const members = new Map();
  for (const sheet of sheets.filter(sheet => sheet.finalized)) for (const person of sheet.roster) {
    const member = members.get(person.memberId) || { memberId: person.memberId, name: person.name, instrument: person.instrument, total: 0, present: 0, absent: 0, excused: 0 };
    if (!Object.hasOwn(attendanceStatuses, person.status)) continue;
    member.total++; member[person.status]++; members.set(person.memberId, member);
  }
  return [...members.values()].map(member => ({ ...member, rate: Math.round(member.present / member.total * 100) })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function attendanceCsv(sheets) {
  const cell = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  const rows = [['Data', 'Evento', 'Integrante', 'Função', 'Presença', 'Observação', 'Registrado por', 'Atualizado em']];
  for (const sheet of sheets.filter(sheet => sheet.finalized)) for (const person of sheet.roster) rows.push([sheet.date, sheet.label, person.name, person.instrument, attendanceStatuses[person.status] || 'Não marcado', person.note, sheet.recordedBy?.name, sheet.updatedAt]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}

export function validAttendanceSheet(sheet) {
  return !!sheet && identifier(sheet.eventId) && validAttendanceDate(sheet.date) && typeof sheet.label === 'string' && Number.isSafeInteger(sheet.version) && sheet.version >= 0 && typeof sheet.finalized === 'boolean' && Array.isArray(sheet.roster) && sheet.roster.length <= 300 && new Set(sheet.roster.map(person => person?.memberId)).size === sheet.roster.length && sheet.roster.every(person => identifier(person?.memberId) && typeof person.name === 'string' && typeof person.note === 'string' && (person.status === null || Object.hasOwn(attendanceStatuses, person.status))) && (!sheet.finalized || (sheet.roster.length > 0 && sheet.roster.every(person => person.status !== null))) && (sheet.version === 0 || (identifier(sheet.recordedBy?.memberId) && typeof sheet.recordedBy.name === 'string' && Number.isFinite(Date.parse(sheet.updatedAt))));
}

export function validAttendanceResponse(data, payload) {
  if (data?.ok !== true || !validAttendanceDate(data.today) || typeof data.serverTime !== 'string' || !Number.isFinite(Date.parse(data.serverTime))) return false;
  if (payload.action === 'list') return Array.isArray(data.sheets) && new Set(data.sheets.map(sheet => sheet?.eventId)).size === data.sheets.length && data.sheets.every(sheet => validAttendanceSheet(sheet) && sheet.date >= payload.from && sheet.date <= payload.to);
  if (!validAttendanceSheet(data.sheet) || data.sheet.eventId !== payload.eventId || typeof data.canRecord !== 'boolean') return false;
  if (payload.action !== 'save') return true;
  if (data.sheet.version !== payload.version + 1 || data.sheet.finalized !== payload.finalize || !Array.isArray(payload.entries) || payload.entries.length !== data.sheet.roster.length) return false;
  return payload.entries.every(entry => data.sheet.roster.some(person => person.memberId === entry.memberId && person.status === entry.status && person.note === entry.note.trim()));
}

export function attendanceFailure(error) {
  if (error?.code === '28000') return { status: 401, error: 'Sessão inválida. Entre novamente no app.' };
  if (error?.code === '42501') return { status: 403, error: 'A chamada é exclusiva da liderança do ministério.' };
  if (error?.code === 'P0002') return { status: 404, error: 'Evento não encontrado.' };
  if (error?.code === '40001') return { status: 409, error: 'A chamada ou a equipe foi alterada em outro aparelho. Atualize antes de salvar novamente.' };
  const validationMessages = ['Período inválido.', 'Selecione um período de até um ano.', 'Reduza o período para consultar todas as chamadas.', 'Solicitação inválida.', 'O evento precisa ter uma data válida.', 'A chamada fica disponível no dia do evento.', 'Versão da chamada inválida.', 'Equipe inválida.', 'Marcações de presença inválidas.', 'Informe o motivo da falta justificada.', 'Marque todos os integrantes antes de concluir a chamada.'];
  if (['22023', '22007', '22008', '22P02'].includes(error?.code)) return { status: 400, error: validationMessages.includes(error.message) ? error.message : 'Dados da chamada inválidos.' };
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return { status: 503, error: 'O registro de presença ainda precisa ser ativado no servidor.' };
  return { status: 503, error: 'Não foi possível verificar a chamada. Tente novamente.' };
}
