import { performanceKey } from './chords.js';
import { withSongChart } from './song-charts.js';
import { normalizeSetlistConfirmation } from './event-preferences.js';

// Store the exact approved musical choices, rather than a flag that could stay
// green after an automatic regeneration, another editor or an offline update.
export function setlistSnapshot(event, songs) {
  if (!event?.id || event.type === 'ensaio') return null;
  const catalog = songs instanceof Map ? songs : new Map((songs || []).map(song => [song.id, song]));
  const items = event.items?.length ? event.items : (event.songs || []).map(song_id => ({ type: 'song', song_id }));
  if (!items.some(item => item.type === 'song')) return null;
  const choices = [];
  for (const item of items) {
    if (item.type !== 'song') { choices.push(['note', item.text || '']); continue; }
    const song = withSongChart(catalog.get(item.song_id));
    if (!song) return null;
    const singer = Object.hasOwn(event.singerBySong || {}, song.id) ? event.singerBySong[song.id] : item.singer_id;
    const effectiveEvent = { ...event, singerBySong: { ...event.singerBySong, [song.id]: singer } };
    choices.push(['song', song.id, singer || null, performanceKey(song, effectiveEvent), event.sequenceBySong?.[song.id] || '', String(song.bpm || ''), song.time_signature || '']);
  }
  return JSON.stringify([1, event.id, choices]);
}

export function isSetlistConfirmed(event, songs) {
  const confirmation = normalizeSetlistConfirmation(event?.setlist_confirmation);
  return !!confirmation && confirmation.snapshot === setlistSnapshot(event, songs);
}
