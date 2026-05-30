import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPA_URL = process.env.VITE_SUPABASE_URL;
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Supabase env vars missing');
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_KEY);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

(async function main() {
  try {
    console.log('Fetching all songs from Supabase...');
    const { data: songs, error } = await supabase.from('songs').select('*');
    if (error) throw error;
    if (!Array.isArray(songs)) {
      throw new Error('Unexpected songs response');
    }
    console.log(`Loaded ${songs.length} songs`);

    const groups = {};
    songs.forEach(song => {
      const key = `${normalizeText(song.title)}||${normalizeText(song.artist)}`;
      groups[key] = groups[key] || [];
      groups[key].push(song);
    });

    const toDelete = [];
    for (const [groupKey, items] of Object.entries(groups)) {
      if (items.length < 2) continue;
      const withKey = items.filter(s => s.key && String(s.key).trim() !== '');
      const withoutKey = items.filter(s => !s.key || String(s.key).trim() === '');
      if (withKey.length > 0 && withoutKey.length > 0) {
        toDelete.push(...withoutKey);
      } else if (withKey.length === 0 && withoutKey.length > 1) {
        // Keep one record, delete other duplicates
        toDelete.push(...withoutKey.slice(1));
      }
    }

    if (toDelete.length === 0) {
      console.log('No duplicate songs found that match the cleanup criteria.');
      process.exit(0);
    }

    console.log(`Found ${toDelete.length} duplicate songs to delete:`);
    toDelete.forEach(s => console.log(`- ${s.id} | ${s.title} | ${s.artist} | key='${s.key || ''}'`));

    const idsToDelete = toDelete.map(s => s.id);
    const { error: delError } = await supabase.from('songs').delete().in('id', idsToDelete);
    if (delError) throw delError;

    console.log(`Successfully deleted ${idsToDelete.length} duplicate song record(s).`);
    process.exit(0);
  } catch (e) {
    console.error('Fatal error:', e.message || e);
    process.exit(1);
  }
})();
