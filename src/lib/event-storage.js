import { eventPayload } from './domain.js';
import { decodeEventPreferences, encodeEventPreferences } from './event-preferences.js';

export async function upsertEventRecord(supabase, event) {
  if (!supabase) return null;
  if (!event || typeof event !== 'object') throw new Error('Invalid event payload');
  if (!event.date) throw new Error('Event must have a `date` (YYYY-MM-DD)');
  const { data, error } = await supabase.from('events').upsert(eventPayload(event)).select().single();
  if (error) throw error;
  return data;
}

export async function updateEventItems(supabase, eventId, items, memberIds, preferences) {
  if (!supabase) return null;
  const [{ data: existing, error: songError }, { data: existingMembers, error: memberError }] = await Promise.all([
    supabase.from('event_songs').select('*').eq('event_id', eventId),
    supabase.from('event_members').select('*').eq('event_id', eventId),
  ]);
  if (songError || memberError) throw songError || memberError;
  // Write additions/updates before removing obsolete rows. Keep stable IDs and
  // never rewrite confirmations for members who remain in the event.
  const internal = (existing || []).filter(row => decodeEventPreferences(row)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const available = (existing || []).filter(row => !internal.includes(row));
  // Old callers without preferences must preserve stored selections. Explicit
  // empty selections are persisted too, so clearing them survives a refresh.
  const retained = new Set(preferences === undefined ? internal.map(row => row.id) : []);
  const rows = (items || []).map((it, i) => {
    const index = available.findIndex(row => it.type === 'song' ? row.song_id === it.song_id : row.id === it.id);
    const old = index >= 0 ? available.splice(index, 1)[0] : null;
    if (old) retained.add(old.id);
    return {
      ...(old ? { id: old.id } : {}), event_id: eventId,
      song_id: it.type === 'song' ? it.song_id : null, item_type: it.type || 'song',
      note_text: it.text || null, order_index: i + 1,
      singer_member_id: Object.hasOwn(it, 'singer_id') ? it.singer_id : old?.singer_member_id || null,
      sequence: old?.sequence || null,
    };
  });
  if (preferences !== undefined) {
    const previous = internal.at(-1);
    if (previous) retained.add(previous.id);
    rows.push({
      ...(previous ? { id: previous.id } : {}), event_id: eventId,
      song_id: null, item_type: 'note', note_text: encodeEventPreferences(preferences),
      order_index: rows.length + 1, singer_member_id: null, sequence: null,
    });
  }
  // event_songs.id may be a generated bigint, even when events/songs use UUIDs.
  // Existing keys stay unchanged; new rows omit id and use the database default.
  // Separate requests prevent PostgREST from filling a missing id with null in
  // a mixed upsert batch. UI/offline item IDs never become database row IDs.
  const updates = rows.filter(row => Object.hasOwn(row, 'id'));
  const additions = rows.filter(row => !Object.hasOwn(row, 'id'));
  if (updates.length) {
    const { error } = await supabase.from('event_songs').upsert(updates);
    if (error) throw error;
  }
  if (additions.length) {
    const { error } = await supabase.from('event_songs').insert(additions);
    if (error) throw error;
  }
  const newMembers = [...new Set(memberIds || [])].filter(id => !(existingMembers || []).some(row => row.member_id === id));
  if (newMembers.length) {
    const { error } = await supabase.from('event_members').insert(newMembers.map(member_id => ({ event_id: eventId, member_id, confirmed: null })));
    if (error) throw error;
  }
  const obsoleteSongs = (existing || []).filter(row => !retained.has(row.id)).map(row => row.id);
  if (obsoleteSongs.length) {
    const { error } = await supabase.from('event_songs').delete().eq('event_id', eventId).in('id', obsoleteSongs);
    if (error) throw error;
  }
  const obsoleteMembers = (existingMembers || []).filter(row => !(memberIds || []).includes(row.member_id)).map(row => row.member_id);
  if (obsoleteMembers.length) {
    const { error } = await supabase.from('event_members').delete().eq('event_id', eventId).in('member_id', obsoleteMembers);
    if (error) throw error;
  }
}

