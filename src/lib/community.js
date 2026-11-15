export const churchCategories = ['Culto', 'Encontro', 'Estudo bíblico', 'Ação solidária', 'Outro'];
export const prayerStatuses = { pending:'Recebido', praying:'Em oração', answered:'Respondido', archived:'Arquivado' };
export function communityEvents(events, { now = Date.now(), filter = 'all' } = {}) {
  const end = new Date(now); end.setHours(23,59,59,999); end.setDate(end.getDate() + (7-end.getDay())%7);
  const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  return events.filter(event => event.published && (event.ends_at ? new Date(event.ends_at).getTime()>=now : new Date(event.starts_at).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})>=today) && (filter !== 'week' || new Date(event.starts_at).getTime() <= end.getTime())).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
}
export function churchDate(value, options = {}) { return new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'numeric',month:'long',...options}); }
export function churchTime(value) { return new Date(value).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}); }
export function eventFromForm(values, existing = {}) {
  const start = new Date(values.get('starts_at')), endValue=values.get('ends_at'), end=endValue?new Date(endValue):null;
  if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end<start))) throw new Error('Confira as datas e os horários do evento.');
  return {...existing,id:existing.id||crypto.randomUUID(),title:String(values.get('title')||'').trim(),description:String(values.get('description')||'').trim(),location:String(values.get('location')||'').trim(),category:values.get('category'),starts_at:start.toISOString(),ends_at:end?.toISOString()||null,published:values.get('published')==='on'};
}
