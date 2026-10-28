// Event-wide selections fit in an internal note using the existing event_songs
// columns. They must never be posted as optional columns on the events table.
const prefix = 'louvesync:event-preferences:v1:';

export function eventPreferences(value = {}) {
  return {
    requested_songs: [...new Set((Array.isArray(value.requested_songs) ? value.requested_songs : []).filter(id => typeof id === 'string' && id))],
    santa_ceia_song: typeof value.santa_ceia_song === 'string' && value.santa_ceia_song ? value.santa_ceia_song : null,
  };
}

export function encodeEventPreferences(value) {
  return prefix + JSON.stringify(eventPreferences(value));
}

export function decodeEventPreferences(row) {
  if (row?.item_type !== 'note' || row.song_id || typeof row.note_text !== 'string' || !row.note_text.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(row.note_text.slice(prefix.length));
    if (!value || !Array.isArray(value.requested_songs) || !(value.santa_ceia_song === null || typeof value.santa_ceia_song === 'string')) return null;
    return eventPreferences(value);
  } catch { return null; }
}
