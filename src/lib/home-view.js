import { localDate } from './domain.js';

const eventOrder = (a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''));

export function homeMonthDates(date) {
  const anchor = new Date(date + 'T12:00:00');
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  last.setDate(last.getDate() + (7 - last.getDay()) % 7);
  const days = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) days.push(localDate(cursor));
  return days;
}

export function homeView({ events, songs, members, profileId, today, selectedDate }) {
  const upcoming = events.filter(event => event.date >= today).sort(eventOrder);
  const date = selectedDate || (upcoming.some(event => event.date === today) ? today : upcoming[0]?.date || today);
  const dayEvents = events.filter(event => event.date === date).sort(eventOrder);
  const primary = dayEvents[0] || null;
  const deadline = new Date(today + 'T12:00:00');
  deadline.setDate(deadline.getDate() + 3);
  const pending = upcoming.filter(event => event.date <= localDate(deadline) && (event.members || []).includes(profileId) && event.confirmations?.[profileId] == null);
  const assigned = (primary?.members || []).map(id => members.find(member => member.id === id)).filter(Boolean);
  return {
    date, primary, additional: dayEvents.slice(1), upcoming, pending,
    otherPending: pending.filter(event => !dayEvents.some(visible => visible.id === event.id)),
    activeMembers: members.filter(member => member.status === 'ativo' && member.access_type !== 'church_member'),
    assigned,
    featured: songs.find(song => song.featured_week),
    eventSongs: primary?.type === 'ensaio' ? [] : (primary?.songs || []).map(id => songs.find(song => song.id === id)).filter(Boolean),
    stats: {
      songs: songs.length,
      members: members.filter(member => member.status === 'ativo' && member.access_type !== 'church_member').length,
      services: upcoming.filter(event => event.type === 'culto').length,
      confirmed: events.filter(event => event.confirmations?.[profileId] === true).length,
    },
  };
}

export function homeVocalCategories(profile) {
  if (!/vocal|voz/i.test(`${profile?.instrument || ''} ${profile?.role || ''}`)) return [];
  const labels = { adoracao:'adoração', hinario:'hinário', jubilo:'júbilo' };
  const assigned = [];
  if (labels[profile.vocal_category]) assigned.push(labels[profile.vocal_category]);
  else {
    const name = String(profile.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/cleide|kassya/.test(name)) assigned.push('adoração');
    if (/lidia|maria/.test(name)) assigned.push('hinário');
    if (/josi|sonia/.test(name)) assigned.push('júbilo');
  }
  return [...new Set([...assigned,'oferta','santa ceia'])];
}
