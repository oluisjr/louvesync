import { updateEventItems, upsertEventRecord } from './event-storage.js';
import { createClient } from '@supabase/supabase-js';
import { decodeSequence, encodeSequence } from './domain.js';

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

async function fetchAll(table, selection, order) {
  if (!supabase) return null;
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(selection).order(order).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
export async function fetchSongs() { return fetchAll('songs', '*', 'title'); }
export async function fetchEvents() {
  return fetchAll('events', '*, event_songs (id, song_id, item_type, note_text, order_index, singer_member_id, sequence), event_members (member_id, confirmed)', 'date');
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
  const { data, error } = await supabase
    .from('event_members')
    .update({ confirmed })
    .eq('event_id', eventId)
    .eq('member_id', memberId).select('member_id');
  if (!error && !data?.length) throw new Error('Você não está escalado neste evento.');
  if (error) throw error;
}

export async function upsertEvent(event) {
  return upsertEventRecord(supabase, event);
}

export async function deleteEvent(id) {
  if (!supabase) return null;
  const { error: songsError } = await supabase.from('event_songs').delete().eq('event_id', id);
  if (songsError) throw songsError;
  const { error: membersError } = await supabase.from('event_members').delete().eq('event_id', id);
  if (membersError) throw membersError;
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

export async function setEventItems(eventId, items, memberIds, preferences) {
  return updateEventItems(supabase,eventId,items,memberIds,preferences);
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

export async function setSequenceForSong(eventId, songId, text, key) {
  if (!supabase) return null;
  const { data, error: readError } = await supabase.from('event_songs').select('sequence').eq('event_id', eventId).eq('song_id', songId).maybeSingle();
  if (readError) throw readError;
  const previous = decodeSequence(data?.sequence);
  const { error } = await supabase.from('event_songs').update({ sequence: encodeSequence(text ?? previous.text, key === undefined ? previous.key : key) }).eq('event_id', eventId).eq('song_id', songId);
  if (error) throw error;
}

export async function saveVocalKey(songId, singerId, key) {
  if (!supabase) return null;
  const { data, error: readError } = await supabase.from('songs').select('vocal_keys').eq('id', songId).single();
  if (readError) throw readError;
  const vocal_keys = { ...(data?.vocal_keys || {}), [singerId]: key };
  const { error } = await supabase.from('songs').update({ vocal_keys }).eq('id', songId);
  if (error) throw error;
  return vocal_keys;
}
