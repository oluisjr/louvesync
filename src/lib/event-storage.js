import { decodeSequence, encodeSequence, eventPayload, normalizeEvent } from './domain.js';
import { ALL_VOCALS } from './event-vocals.js';
import { decodeEventPreferences, encodeEventPreferences, eventPreferences } from './event-preferences.js';
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
  if(confirmed&&current.event.setlist_confirmation?.snapshot===current.snapshot)return eventPreferences(current.event);
  if(!confirmed&&!current.event.setlist_confirmation)return eventPreferences(current.event);
  const confirmation = confirmed ? { version: 1, snapshot: current.snapshot, confirmed_by: memberId, confirmed_at: new Date().toISOString() } : null;
  const preferences = { ...eventPreferences(current.event), setlist_confirmation: confirmation };
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

// Keep the collective choice in existing musical metadata. The foreign key
// remains null, so TODOS cannot authenticate, receive assignments or be counted.
export function singerRecord(singerId, sequence) {
  const previous = decodeSequence(sequence);
  return {
    singer_member_id: singerId === ALL_VOCALS ? null : singerId || null,
    sequence: encodeSequence(previous.text, previous.key, singerId === ALL_VOCALS ? 'all' : undefined),
  };
}

export async function updateSongSinger(supabase, eventId, songId, singerId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('event_songs').select('sequence').eq('event_id', eventId).eq('song_id', songId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('A música não está mais neste evento. Atualize a escala.');
  const result = await supabase.from('event_songs').update(singerRecord(singerId, data.sequence)).eq('event_id', eventId).eq('song_id', songId);
  if (result.error) throw result.error;
}

export async function updateInstrumentRoster(supabase, choice) {
  if (!supabase) return;
  const [items,roster]=await Promise.all([
    supabase.from('event_songs').select('id,item_type,song_id,note_text,order_index').eq('event_id',choice.eventId),
    supabase.from('event_members').select('*').eq('event_id',choice.eventId),
  ]);
  if(items.error || roster.error)throw items.error || roster.error;
  const rows=items.data || [],internal=rows.filter(decodeEventPreferences).sort((a,b)=>(a.order_index || 0)-(b.order_index || 0) || String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).at(-1);
  const current={rows,internal,event:internal?decodeEventPreferences(internal):eventPreferences()};
  const ids=(roster.data || []).map(row=>row.member_id),same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  const allowed=new Set([...choice.previousMembers,...choice.roster]);
  if(ids.some(id=>!allowed.has(id)) || (!same(ids,choice.previousMembers) && !same(ids,choice.roster) && !same(ids.filter(id=>id!==choice.memberId),choice.previousMembers.filter(id=>id!==choice.memberId))))throw new Error('A equipe mudou em outro aparelho. Atualize a escala antes de escolher.');
  const additions=choice.roster.filter(id=>!ids.includes(id));
  if(additions.length){const result=await supabase.from('event_members').insert(additions.map(member_id=>({event_id:choice.eventId,member_id,confirmed:null})));if(result.error)throw result.error;}
  const preferences={...eventPreferences(current.event),instrument_assignments:{...current.event.instrument_assignments,[choice.instrumentId]:choice.memberId}};
  const note_text=encodeEventPreferences(preferences);
  const saved=current.internal
    ? await supabase.from('event_songs').update({note_text}).eq('event_id',choice.eventId).eq('id',current.internal.id).eq('note_text',current.internal.note_text).select('id')
    : await supabase.from('event_songs').insert([{event_id:choice.eventId,item_type:'note',song_id:null,note_text,order_index:Math.max(0,...current.rows.map(row=>row.order_index || 0))+1,singer_member_id:null,sequence:null}]).select('id');
  if(saved.error)throw saved.error;
  if(!saved.data?.length)throw new Error('O evento mudou durante o salvamento. Atualize a escala.');
  const obsolete=ids.filter(id=>!choice.roster.includes(id));
  if(obsolete.length){const result=await supabase.from('event_members').delete().eq('event_id',choice.eventId).in('member_id',obsolete);if(result.error)throw result.error;}
  const verified=await supabase.from('event_members').select('member_id').eq('event_id',choice.eventId);
  if(verified.error)throw verified.error;
  if(!same((verified.data || []).map(row=>row.member_id),choice.roster))throw new Error('Não foi possível confirmar a equipe salva. Atualize a escala.');
  const readback=await supabase.from('event_songs').select('id,item_type,song_id,note_text,order_index').eq('event_id',choice.eventId);
  if(readback.error)throw readback.error;
  const stored=(readback.data || []).filter(decodeEventPreferences).sort((a,b)=>(a.order_index || 0)-(b.order_index || 0) || String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).at(-1);
  if(decodeEventPreferences(stored)?.instrument_assignments?.[choice.instrumentId]!==choice.memberId)throw new Error('A escolha do instrumento mudou durante o salvamento. Atualize a escala.');
  return preferences.instrument_assignments;
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
      ...(Object.hasOwn(it, 'singer_id') ? singerRecord(it.singer_id, old?.sequence) : { singer_member_id: old?.singer_member_id || null, sequence: old?.sequence || null }),
    };
  });
  if (preferences !== undefined) {
    const previous = internal.at(-1);
    if (previous) retained.add(previous.id);
    rows.push({
      ...(previous ? { id: previous.id } : {}), event_id: eventId,
      song_id: null, item_type: 'note', note_text: encodeEventPreferences({ ...preferences, instrument_assignments: Object.fromEntries(Object.entries(preferences.instrument_assignments || {}).map(([slot,id])=>[slot,(memberIds || []).includes(id)?id:null])) }),
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

