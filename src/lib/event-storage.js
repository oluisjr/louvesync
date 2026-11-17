import { eventPayload, normalizeEvent } from './domain.js';
import { decodeEventPreferences, encodeEventPreferences } from './event-preferences.js';
import { setlistSnapshot } from './setlist-confirmation.js';

async function readSetlist(supabase, eventId) {
  const [base, items] = await Promise.all([
    supabase.from('events').select('id,type').eq('id', eventId).maybeSingle(),
    supabase.from('event_songs').select('*').eq('event_id', eventId),
  ]);
  if (base.error || items.error) throw base.error || items.error;
  if (!base.data) throw new Error('Evento não encontrado. Atualize a escala.');
  const event = normalizeEvent({ ...base.data, event_songs: items.data || [] });
  const ids = [...new Set(event.songs)];
  const catalog = ids.length ? await supabase.from('songs').select('*').in('id', ids) : { data: [] };
  if (catalog.error) throw catalog.error;
  const internal = (items.data || []).filter(decodeEventPreferences).sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return { event, rows: items.data || [], internal: internal.at(-1), snapshot: setlistSnapshot(event, catalog.data) };
}

// Only update the existing hidden event preferences. Never rewrite songs,
// roster or attendance just to confirm a repertoire.
export async function updateSetlistConfirmation(supabase, eventId, expectedSnapshot, memberId, confirmed) {
  if (!supabase) throw new Error('Conecte-se para salvar a confirmação do setlist.');
  const current = await readSetlist(supabase, eventId);
  if (current.event.type === 'ensaio') throw new Error('O ensaio usa o repertório dos eventos de culto.');
  if (confirmed && (!memberId || !current.snapshot)) throw new Error('Adicione músicas antes de confirmar o setlist.');
  if (confirmed && current.snapshot !== expectedSnapshot) throw new Error('O repertório mudou. Atualize a escala, revise e confirme novamente.');
  if(confirmed&&current.event.setlist_confirmation?.snapshot===current.snapshot)return {requested_songs:current.event.requested_songs,santa_ceia_song:current.event.santa_ceia_song,setlist_confirmation:current.event.setlist_confirmation};
  if(!confirmed&&!current.event.setlist_confirmation)return {requested_songs:current.event.requested_songs,santa_ceia_song:current.event.santa_ceia_song,setlist_confirmation:null};
  const confirmation = confirmed ? { version: 1, snapshot: current.snapshot, confirmed_by: memberId, confirmed_at: new Date().toISOString() } : null;
  const preferences = { requested_songs: current.event.requested_songs, santa_ceia_song: current.event.santa_ceia_song, setlist_confirmation: confirmation };
  const note_text = encodeEventPreferences(preferences);
  const result = current.internal
    ? await supabase.from('event_songs').update({ note_text }).eq('event_id', eventId).eq('id', current.internal.id).eq('note_text', current.internal.note_text).select('id')
    : await supabase.from('event_songs').insert([{ event_id: eventId, item_type: 'note', song_id: null, note_text, order_index: Math.max(0, ...current.rows.map(row => row.order_index || 0)) + 1, singer_member_id: null, sequence: null }]).select('id');
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error('O evento foi alterado por outra pessoa. Atualize a escala e tente novamente.');
  const saved = await readSetlist(supabase, eventId);
  if (JSON.stringify(saved.event.setlist_confirmation) !== JSON.stringify(confirmation) || (confirmed && saved.snapshot !== current.snapshot)) throw new Error('O repertório mudou durante a confirmação. Atualize a escala e revise o status.');
  return preferences;
}

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

