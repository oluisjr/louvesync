export async function updateEventItems(supabase, eventId, items, memberIds) {
  if (!supabase) return null;
  const [{ data: existing, error: songError }, { data: existingMembers, error: memberError }] = await Promise.all([
    supabase.from('event_songs').select('*').eq('event_id', eventId),
    supabase.from('event_members').select('*').eq('event_id', eventId),
  ]);
  if (songError || memberError) throw songError || memberError;
  // Write additions/updates before removing obsolete rows. Keep stable IDs and
  // never rewrite confirmations for members who remain in the event.
  const available = [...(existing || [])];
  const retained = new Set();
  const rows = (items || []).map((it, i) => {
    const index = available.findIndex(row => it.type === 'song' ? row.song_id === it.song_id : row.id === it.id);
    const old = index >= 0 ? available.splice(index, 1)[0] : null;
    if (old) retained.add(old.id);
    return {
      id: old?.id || crypto.randomUUID(), event_id: eventId,
      song_id: it.type === 'song' ? it.song_id : null, item_type: it.type || 'song',
      note_text: it.text || null, order_index: i + 1,
      singer_member_id: Object.hasOwn(it, 'singer_id') ? it.singer_id : old?.singer_member_id || null,
      sequence: old?.sequence || null,
    };
  });
  if (rows.length) {
    const { error } = await supabase.from('event_songs').upsert(rows);
    if (error) throw error;
  }
  const additions = [...new Set(memberIds || [])].filter(id => !(existingMembers || []).some(row => row.member_id === id));
  if (additions.length) {
    const { error } = await supabase.from('event_members').insert(additions.map(member_id => ({ event_id: eventId, member_id, confirmed: null })));
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

