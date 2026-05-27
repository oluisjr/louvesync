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

export async function upsertMember(member) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('members')
    .upsert(member)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  if (!supabase) return null;
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw error;
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

export async function requestDeleteSong(songId, userId) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('songs')
    .update({ delete_requested_by: userId })
    .eq('id', songId);
  if (error) throw error;
}

export async function rejectDeleteSong(songId) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('songs')
    .update({ delete_requested_by: null })
    .eq('id', songId);
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

export async function deleteEvent(id) {
  if (!supabase) return null;
  await supabase.from('event_songs').delete().eq('event_id', id);
  await supabase.from('event_members').delete().eq('event_id', id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function requestDeleteEvent(eventId, userId) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('events')
    .update({ delete_requested_by: userId })
    .eq('id', eventId);
  if (error) throw error;
}

export async function rejectDeleteEvent(eventId) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('events')
    .update({ delete_requested_by: null })
    .eq('id', eventId);
  if (error) throw error;
}

export async function setEventItems(eventId, items, memberIds) {
  if (!supabase) return null;
  // Fetch existing to preserve sequence and singer
  const { data: existing } = await supabase.from('event_songs').select('*').eq('event_id', eventId);
  const existingMap = {};
  if (existing) {
    existing.forEach(e => { if(e.song_id) existingMap[e.song_id] = e; });
  }

  // Remove existing
  await supabase.from('event_songs').delete().eq('event_id', eventId);
  await supabase.from('event_members').delete().eq('event_id', eventId);
  
  if (items && items.length > 0) {
    const rows = items.map((it, i) => ({
      event_id: eventId,
      song_id: it.type === 'song' ? it.song_id : null,
      item_type: it.type || 'song',
      note_text: it.text || null,
      order_index: i + 1,
      singer_member_id: it.singer_id || ((it.type === 'song' && existingMap[it.song_id]) ? existingMap[it.song_id].singer_member_id : null),
      sequence: (it.type === 'song' && existingMap[it.song_id]) ? existingMap[it.song_id].sequence : null
    }));
    const { error } = await supabase.from('event_songs').insert(rows);
    if (error) throw error;
  }

  if (memberIds && memberIds.length > 0) {
    const mrows = memberIds.map(mId => ({
      event_id: eventId,
      member_id: mId,
      confirmed: null
    }));
    const { error: errM } = await supabase.from('event_members').insert(mrows);
    if (errM) throw errM;
  }
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
