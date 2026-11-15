import { localDate } from './domain.js';

const noon=date=>new Date(`${date}T12:00:00`);
const order=(a,b)=>a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id));

export function scheduleWeekStart(date) {
  const cursor=noon(date);
  cursor.setDate(cursor.getDate()-(cursor.getDay()+6)%7);
  return localDate(cursor);
}

export function shiftScheduleWeek(start, direction) {
  const cursor=noon(start);cursor.setDate(cursor.getDate()+direction*7);return localDate(cursor);
}

export function scheduleWeekDates(start) {
  return Array.from({length:7},(_,index)=>{const date=noon(start);date.setDate(date.getDate()+index);return localDate(date);});
}

export function scheduleWeekLabel(dates) {
  const first=noon(dates[0]),last=noon(dates[6]);
  if(first.getFullYear()!==last.getFullYear())return `${first.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})} – ${last.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}`;
  if(first.getMonth()!==last.getMonth())return `${first.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})} – ${last.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}`;
  return `${first.getDate()}–${last.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}`;
}

export function scheduleEventState(event, now=Date.now()) {
  const current=localDate(new Date(now));
  if(!/^\d{2}:\d{2}/.test(event.time || ''))return event.date<current?'past':'upcoming';
  const start=new Date(`${event.date}T${String(event.time).slice(0,8)}`).getTime();
  if(!Number.isFinite(start))return event.date<current?'past':'upcoming';
  return now<start?'upcoming':now<start+2*60*60*1000?'ongoing':'past';
}

export function scheduleAttendance(event) {
  const ids=[...new Set(event.members || [])];
  const confirmed=ids.filter(id=>event.confirmations?.[id]===true).length;
  const declined=ids.filter(id=>event.confirmations?.[id]===false).length;
  return {total:ids.length,confirmed,declined,pending:ids.length-confirmed-declined};
}

export function scheduleView({events,profileId,week,today,scope='all',history=false,now=Date.now()}) {
  const start=scheduleWeekStart(week || today),dates=scheduleWeekDates(start);
  const all=events.filter(event=>event.date>=start&&event.date<=dates[6]).sort(order);
  const mine=all.filter(event=>(event.members || []).includes(profileId));
  const past=events.filter(event=>event.date<today && (scope!=='mine'||(event.members || []).includes(profileId))).sort((a,b)=>order(b,a));
  const visible=history?past:scope==='mine'?mine:all;
  const groups=(history?[...new Set(visible.map(event=>event.date))]:dates).map(date=>({date,events:visible.filter(event=>event.date===date)}));
  return {start,dates,all,mine,past,visible,groups,range:scheduleWeekLabel(dates),
    pending:mine.filter(event=>event.confirmations?.[profileId]==null && scheduleEventState(event,now)==='upcoming').length,
  };
}

function csvCell(value) {
  const text=String(value ?? '');
  return '"'+(/^[=+\-@\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';
}

export function scheduleHistoryCsv(events) {
  return '\uFEFFData,Horário,Compromisso,Tipo,Confirmados,Recusados,Pendentes\r\n'+events.map(event=>{
    const counts=scheduleAttendance(event);
    return [event.date,String(event.time || '').slice(0,5),event.label,event.type || 'culto',counts.confirmed,counts.declined,counts.pending].map(csvCell).join(',');
  }).join('\r\n');
}
