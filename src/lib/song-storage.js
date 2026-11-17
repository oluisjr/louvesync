import { cleanSong } from './offline-conflicts.js';
export async function saveSongRecord(client, song) {
  song=cleanSong(song);
  let result = await client.from('songs').upsert(song).select().single();
  if (result.error?.message?.includes('created_at')) {
    const { created_at: _created, ...sanitized } = song;
    result = await client.from('songs').upsert(sanitized).select().single();
  }
  if (result.error) throw result.error;
  if (!result.data?.id) throw new Error('A música não foi confirmada pelo servidor.');
  return result.data;
}
