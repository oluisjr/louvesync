export const prayerStatuses = { pending:'Recebido', praying:'Em oração', answered:'Respondido', archived:'Arquivado' };
import { scheduleWeekStart, shiftScheduleWeek } from './schedule-view.js';

export const churchDay = value => new Date(value).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});

export function communityEvents(events, { now = Date.now(), filter = 'all', week } = {}) {
  const today=churchDay(now);
  const start=week || (filter==='week' ? scheduleWeekStart(today) : null);
  const end=start ? shiftScheduleWeek(start,1) : null;
  return events.filter(event => {
    if(!event.published) return false;
    const day=churchDay(event.starts_at);
    if(start && (day<start || day>=end)) return false;
    if(week) return true; // Keep earlier days of the selected week in an already loaded agenda.
    return event.ends_at ? new Date(event.ends_at).getTime()>=now : day>=today;
  }).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
}
export function churchDate(value, options = {}) { return new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'numeric',month:'long',...options}); }
export function churchTime(value) { return new Date(value).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}); }
