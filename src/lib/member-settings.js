import { isNotificationLeader } from './notification-policy.js';

export const memberScreens = [
  ['home', 'Início'], ['escala', 'Escala'], ['mural', 'Mural'], ['biblia', 'Bíblia'],
  ['repertorio', 'Músicas'], ['ensaio', 'Ensaio'], ['patrimonio', 'Patrimônio'],
  ['devocional', 'Devocional'], ['treinamento', 'Treinamento'], ['ia', 'Maestro'],
  ['solicitacoes', 'Solicitações'], ['presencas', 'Presenças'], ['membros', 'Membros'], ['admin', 'Painel administrativo'],
];
export const screenIds = memberScreens.map(([id]) => id);
const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export function accountActive(member) { return !!member && ['ativo', 'ativa', 'active'].includes(String(member.status || 'ativo').trim().toLowerCase()); }
export function roleAllowsScreen(member, screen) {
  if (!accountActive(member) || !screenIds.includes(screen)) return false;
  if (['membros', 'admin'].includes(screen)) return member.is_admin === true;
  return screen !== 'presencas' || isNotificationLeader(member);
}
export function effectiveScreens(member) {
  const selected = member?.permissions == null ? screenIds : member.permissions;
  return screenIds.filter(screen => roleAllowsScreen(member, screen) && (selected.includes(screen) || (screen === 'admin' && member.is_admin === true)));
}
export function canSeeScreen(member, screen) { return effectiveScreens(member).includes(screen); }
export function normalizeMember(member) {
  const days = member.unavailable_days ?? member.unavailableDays ?? [];
  const { unavailable_days: _days, schedule_enabled: _schedule, ...publicFields } = member;
  return { ...publicFields, permissions: Array.isArray(member.permissions) ? [...new Set(member.permissions.filter(screen => screenIds.includes(screen)))] : null,
    unavailableDays: [...new Set(Array.isArray(days) ? days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [])].sort(),
    scheduleEnabled: (member.schedule_enabled ?? member.scheduleEnabled) !== false };
}
export function memberPayload(member) {
  const normalized = normalizeMember(member);
  const fields = ['id', 'name', 'role', 'instrument', 'avatar', 'color', 'status', 'is_admin', 'pin', 'vocal_category'];
  return { ...Object.fromEntries(fields.filter(key => Object.hasOwn(member, key)).map(key => [key, member[key]])),
    permissions: normalized.permissions, unavailable_days: normalized.unavailableDays, schedule_enabled: normalized.scheduleEnabled };
}
export function availabilityReason(member, date) {
  if (!accountActive(member)) return 'Conta inativa';
  if ((member.schedule_enabled ?? member.scheduleEnabled) === false) return 'Fora da escala';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Escolha a data do evento';
  const day = new Date(date + 'T12:00:00').getDay();
  return (member.unavailable_days ?? member.unavailableDays ?? []).includes(day) ? 'Indisponível neste dia (' + weekdays[day] + ')' : '';
}
export function availableMembers(members, date) { return members.filter(member => !availabilityReason(member, date)); }
export function rosterConflicts(event, members, existingEvent) {
  return (event.members || []).flatMap(id => {
    if(existingEvent?.date===event.date&&existingEvent.members?.includes(id))return [];
    const member = members.find(candidate => candidate.id === id), reason = member ? availabilityReason(member, event.date) : 'Cadastro não encontrado';
    return reason ? [{ id, name: member?.name || 'Membro', reason }] : [];
  });
}
