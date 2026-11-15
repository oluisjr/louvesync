// Event-wide selections fit in an internal note using the existing event_songs
// columns. They must never be posted as optional columns on the events table.
const prefix = 'louvesync:event-preferences:v1:';

export function normalizeSetlistConfirmation(value) {
  if (value?.version !== 1 || typeof value.snapshot !== 'string' || !value.snapshot || typeof value.confirmed_by !== 'string' || !value.confirmed_by || typeof value.confirmed_at !== 'string' || !Number.isFinite(Date.parse(value.confirmed_at))) return null;
  return { version: 1, snapshot: value.snapshot, confirmed_by: value.confirmed_by, confirmed_at: value.confirmed_at };
}

export function eventPreferences(value = {}) {
  return {
    requested_songs: [...new Set((Array.isArray(value.requested_songs) ? value.requested_songs : []).filter(id => typeof id === 'string' && id))],
    santa_ceia_song: typeof value.santa_ceia_song === 'string' && value.santa_ceia_song ? value.santa_ceia_song : null,
    setlist_confirmation: normalizeSetlistConfirmation(value.setlist_confirmation),
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
