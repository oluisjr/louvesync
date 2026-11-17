import { availabilityReason, isChurchMember } from './member-settings.js';

const instruments = [
  ['guitar','Violão',/\bviolao\b/], ['electric_guitar','Guitarra',/\bguitarra\b/],
  ['drums','Bateria',/\bbateria\b/], ['keys','Teclado',/\b(teclado|piano)\b/],
  ['bass','Baixo',/\b(baixo|contrabaixo)\b/], ['percussion','Percussão',/\b(percussao|cajon)\b/],
  ['sax','Saxofone',/\b(sax|saxofone)\b/], ['flute','Flauta',/\bflauta\b/],
  ['cavaquinho','Cavaquinho',/\b(cavaquinho|cavaco)\b/], ['ukulele','Ukulele',/\bukulele\b/],
];
const normalized = member => String(member.instrument || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function instrumentGroups(members) {
  const team = members.filter(member => !isChurchMember(member) && !/^(inativo|inativa|inactive)$/i.test(member.status || '') && (member.schedule_enabled ?? member.scheduleEnabled) !== false);
  return instruments.map(([id,label,pattern])=>({id,label,members:team.filter(member=>pattern.test(normalized(member)))})).filter(group=>group.members.length>1);
}

export function assignedInstrument(event, group) {
  if (Object.hasOwn(event.instrument_assignments || {}, group.id)) {
    const id = event.instrument_assignments[group.id];
    return event.members?.includes(id) ? id : '';
  }
  const assigned = group.members.filter(member=>event.members?.includes(member.id));
  return assigned.length>1 ? '__multiple__' : assigned[0]?.id || '';
}

export function chooseInstrument(event, members, instrumentId, memberId) {
  const group = instrumentGroups(members).find(item=>item.id===instrumentId);
  const chosen = memberId && group?.members.find(member=>member.id===memberId);
  if (!group || (memberId && !chosen)) throw new Error('Escolha um integrante deste instrumento.');
  const reason = chosen && availabilityReason(chosen,event.date);
  if (reason && !event.members?.includes(chosen.id)) throw new Error(reason);
  const assignments={...event.instrument_assignments,[instrumentId]:memberId || null};
  const otherAssignments=new Set(Object.entries(assignments).filter(([id])=>id!==instrumentId).map(([,id])=>id));
  const vocals=new Set(Object.values(event.singerBySong || {}));
  const groupIds=new Set(group.members.map(member=>member.id));
  const roster=(event.members || []).filter(id=>!groupIds.has(id) || id===memberId || vocals.has(id) || otherAssignments.has(id) || /vocal|voz/i.test(members.find(member=>member.id===id)?.instrument || ''));
  if (memberId && !roster.includes(memberId)) roster.push(memberId);
  return {eventId:event.id,instrumentId,memberId:memberId || null,previousMembers:[...(event.members || [])],roster,assignments};
}
