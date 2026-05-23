import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('[LouveSync] Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes. Operando em modo local.');
}

export const supabase = url && anon ? createClient(url, anon) : null;

/* ── helpers ──────────────────────────────────────────────── */

export async function fetchMembers() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchSongs() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('title');
  if (error) throw error;
  return data;
}

export async function fetchEvents() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      event_songs ( song_id, order_index, singer_member_id, sequence ),
      event_members ( member_id, confirmed )
    `)
    .order('date');
  if (error) throw error;
  return data;
}

export async function upsertSong(song) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('songs')
    .upsert(song)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSong(id) {
  if (!supabase) return null;
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw error;
}

export async function setPresence(eventId, memberId, confirmed) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('event_members')
    .update({ confirmed })
    .eq('event_id', eventId)
    .eq('member_id', memberId);
  if (error) throw error;
}

export async function upsertEvent(event) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('events')
    .upsert(event)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setEventSongs(eventId, songIds) {
  if (!supabase) return null;
  // Fetch existing to preserve sequence and singer
  const { data: existing } = await supabase.from('event_songs').select('*').eq('event_id', eventId);
  const existingMap = {};
  if (existing) {
    existing.forEach(e => { existingMap[e.song_id] = e; });
  }

  // remove tudo e reinsere na ordem correta
  await supabase.from('event_songs').delete().eq('event_id', eventId);
  if (songIds.length === 0) return;
  
  const rows = songIds.map((song_id, i) => ({
    event_id: eventId,
    song_id,
    order_index: i + 1,
    singer_member_id: existingMap[song_id]?.singer_member_id || null,
    sequence: existingMap[song_id]?.sequence || null
  }));
  const { error } = await supabase.from('event_songs').insert(rows);
  if (error) throw error;
}

export async function setSingerForSong(eventId, songId, singerMemberId) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('event_songs')
    .update({ singer_member_id: singerMemberId })
    .eq('event_id', eventId)
    .eq('song_id', songId);
  if (error) throw error;
}

export async function setSequenceForSong(eventId, songId, sequence) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('event_songs')
    .update({ sequence })
    .eq('event_id', eventId)
    .eq('song_id', songId);
  if (error) throw error;
}
