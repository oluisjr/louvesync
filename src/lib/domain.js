export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const sharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function transposeKey(key, steps = 0) {
  const match = String(key || '').match(/^([A-G][#b]?)(.*)$/);
  if (!match) return String(key || 'N/A');
  const index = Math.max(sharp.indexOf(match[1]), flat.indexOf(match[1]));
  if (index < 0) return key;
  const notes = match[1].includes('b') ? flat : sharp;
  return notes[((index + steps) % 12 + 12) % 12] + match[2];
}
export function keyDistance(from, to) {
  const index = key => {
    const root = String(key || '').match(/^[A-G][#b]?/)?.[0];
    return Math.max(sharp.indexOf(root), flat.indexOf(root));
  };
  const a = index(from), b = index(to);
  if (a < 0 || b < 0) return 0;
  return ((b - a + 18) % 12) - 6;
}
export function readCache(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Preserve legacy plain-text sequences. Event-specific key metadata fits in the
// existing sequence text column, so no database migration is required.
const sequencePrefix = 'louvesync:v1:';
export function decodeSequence(value) {
  if (typeof value === 'string' && value.startsWith(sequencePrefix)) {
    try { return JSON.parse(value.slice(sequencePrefix.length)); } catch { /* legacy text */ }
  }
  return { text: value || '', key: null };
}
export function encodeSequence(text, key) {
  return key ? sequencePrefix + JSON.stringify({ text: text || '', key }) : text || null;
}
export function normalizeEvent(ev) {
  const sorted = [...(ev.event_songs || [])].filter(Boolean).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const songRows = sorted.filter(row => row.song_id);
  return {
    ...ev,
    songs: songRows.map(row => row.song_id),
    items: sorted.map(row => ({ id: row.id, type: row.item_type || 'song', song_id: row.song_id, text: row.note_text, singer_id: row.singer_member_id })),
    members: (ev.event_members || []).filter(Boolean).map(row => row.member_id),
    confirmations: Object.fromEntries((ev.event_members || []).filter(Boolean).map(row => [row.member_id, row.confirmed])),
    singerBySong: Object.fromEntries(songRows.map(row => [row.song_id, row.singer_member_id])),
    sequenceBySong: Object.fromEntries(songRows.map(row => [row.song_id, decodeSequence(row.sequence).text])),
    keyBySong: Object.fromEntries(songRows.map(row => [row.song_id, decodeSequence(row.sequence).key]).filter(([, key]) => key)),
    requested_songs: ev.requested_songs || [], santa_ceia_song: ev.santa_ceia_song || null,
  };
}
export function eventPayload(event) {
  const payload = { ...event };
  for (const key of ['songs', 'items', 'members', 'confirmations', 'singerBySong', 'sequenceBySong', 'keyBySong', 'event_songs', 'event_members']) delete payload[key];
  return payload;
}
export function timerSeconds(session, now = Date.now()) {
  return Math.max(0, Math.floor((session.seconds || 0) + (session.active && session.startedAt ? (now - session.startedAt) / 1000 : 0)));
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
