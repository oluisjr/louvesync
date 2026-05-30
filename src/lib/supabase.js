import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('[LouveSync] Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes. Operando em modo local.');
}

let client = null;
if (url && anon) {
  try {
    let cleanUrl = String(url).trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    client = createClient(cleanUrl, String(anon).trim());
  } catch (err) {
    console.error('[LouveSync] Erro crítico ao inicializar o cliente Supabase. Verifique suas variáveis de ambiente no Vercel:', err);
  }
}

export const supabase = client;

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
      event_songs ( id, song_id, item_type, note_text, order_index, singer_member_id, sequence ),
      event_members ( member_id, confirmed )
    `)
    .order('date');
  if (error) throw error;
  return data;
}

export async function upsertSong(song) {
  if (!supabase) return null;
  // Try upsert; if the DB schema doesn't contain `created_at` (some setups), retry without it.
  try {
    const { data, error } = await supabase.from('songs').upsert(song).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    // Detect PostgREST schema errors referencing created_at and retry without that field
    try {
      const msg = err?.message || '';
      if (msg.includes("created_at") || msg.includes("Could not find the 'created_at'")) {
        const { created_at, ...sanitized } = song || {};
        const { data: d2, error: e2 } = await supabase.from('songs').upsert(sanitized).select().single();
        if (e2) throw e2;
        return d2;
      }
    } catch (err2) {
      console.error('[supabase] upsertSong retry failed:', err2);
      throw err2;
    }
    console.error('[supabase] upsertSong failed:', err);
    throw err;
  }
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
  // Basic validation / sanitization to avoid incomplete event records
  if (!event || typeof event !== 'object') throw new Error('Invalid event payload');
  if (!event.date) throw new Error('Event must have a `date` (YYYY-MM-DD)');
  // Ensure arrays are well-formed or removed to avoid PostgREST partial failures
  const sanitized = { ...event };
  if (sanitized.event_songs && !Array.isArray(sanitized.event_songs)) delete sanitized.event_songs;
  if (sanitized.event_members && !Array.isArray(sanitized.event_members)) delete sanitized.event_members;

  const { data, error } = await supabase
    .from('events')
    .upsert(sanitized)
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
