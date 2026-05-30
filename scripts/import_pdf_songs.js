import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
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

// Mapping from PDF category names to app category IDs
const catMap = {
  'adoração': 'adoracao',
  'adoraçao': 'adoracao',
  'adoração': 'adoracao',
  'hinário': 'hinario',
  'hinario': 'hinario',
  'júbilo': 'jubilo',
  'jubilo': 'jubilo',
  'oferta': 'oferta',
  'santa ceia': 'ceia',
  'ceia': 'ceia',
  'corinhos': 'corinho',
  'corinho': 'corinho',
};

function extractCategory(str) {
  const normalized = str.toLowerCase().trim();
  for (const [key, val] of Object.entries(catMap)) {
    if (normalized.includes(key)) return val;
  }
  return 'adoracao'; // default
}

function parseLine(line) {
  if (!line.trim() || line.includes('LOUVOR') || line.includes('STATUS') || line.includes('LINK')) {
    return null; // Skip header/footer
  }
  
  // Try to extract YouTube URL
  const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
  const mediaUrl = urlMatch ? urlMatch[1] : null;
  
  // Remove URL from line for parsing
  let workLine = urlMatch ? line.replace(urlMatch[1], '') : line;
  
  // Find category keywords
  let category = 'adoracao';
  for (const [key, val] of Object.entries(catMap)) {
    if (workLine.toLowerCase().includes(key)) {
      category = val;
      // Remove category from line
      const regex = new RegExp(key, 'i');
      workLine = workLine.replace(regex, ' ');
      break;
    }
  }
  
  // Parse "Título - Artista" pattern
  let title, artist;
  if (workLine.includes(' - ')) {
    const parts = workLine.split(' - ');
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
  } else {
    title = workLine.trim();
    artist = 'Desconhecido';
  }
  
  // Clean up artist (remove stray URLs/text)
  artist = artist.replace(/https?:\/\/.*/i, '').trim();
  if (!artist) artist = 'Desconhecido';
  
  if (!title || title.length < 2) return null;
  
  return { title: title.slice(0, 180), artist: artist.slice(0, 120), category, mediaUrl };
}

async function fetchLyricsFromLRCLib(title, artist) {
  const query = encodeURIComponent(`${title} ${artist || ''}`.trim());
  const url = `https://lrclib.net/api/search?q=${query}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LouveSync/1.0' } });
    if (!res.ok) return '';
    const data = await res.json();
    if (!Array.isArray(data)) return '';
    for (const item of data) {
      if (item?.plainLyrics && item.plainLyrics.trim().length > 60) {
        return item.plainLyrics.trim();
      }
    }
  } catch (e) {
    console.warn(`LRCLib fetch failed for ${title} - ${artist}:`, e?.message || e);
  }
  return '';
}

(async function main() {
  try {
    // Step 1: Delete the incorrectly merged entry
    console.log('Deleting incorrectly merged entry (LOUVORESSTATUSCANTORESLINK)...');
    const { error: delErr } = await supabase
      .from('songs')
      .delete()
      .ilike('title', '%LOUVOR%');
    if (delErr) console.warn('Delete warning:', delErr);
    else console.log('✓ Deleted');

    // Step 2: Extract PDF
    const publicDir = path.resolve(process.cwd(), 'public');
    const files = fs.readdirSync(publicDir).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) throw new Error('No PDF found');
    
    const filePath = path.join(publicDir, files[0]);
    console.log(`\nParsing PDF: ${files[0]}`);
    
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    const lines = String(data.text || '').split('\n').filter(l => l.trim());
    
    console.log(`Total lines: ${lines.length}`);
    
    // Step 3: Parse and filter
    const songs = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) songs.push(parsed);
    }
    console.log(`Parsed ${songs.length} valid songs\n`);
    
    // Step 4: Insert into Supabase
    let importedCount = 0;
    for (const s of songs) {
      try {
        const lyrics = await fetchLyricsFromLRCLib(s.title, s.artist);
        const payload = {
          title: s.title,
          artist: s.artist,
          cat: s.category,
          bpm: 80,
          time_signature: '4/4',
          key: 'C',
          lyrics: lyrics || '',
          media_url: s.mediaUrl || null,
        };
        
        const { data: inserted, error: insertErr } = await supabase
          .from('songs')
          .insert(payload)
          .select()
          .single();
        
        if (insertErr) {
          // Try upsert
          const { data: upserted, error: upErr } = await supabase
            .from('songs')
            .upsert(payload)
            .select()
            .single();
          
          if (upErr) {
            console.error(`✗ ${s.title}: ${upErr.message}`);
          } else {
            console.log(`✓ ${s.category.padEnd(10)} | ${s.title} | ${s.artist} | lyrics:${lyrics ? 'yes' : 'no'}`);
            importedCount++;
          }
        } else {
          console.log(`✓ ${s.category.padEnd(10)} | ${s.title} | ${s.artist} | lyrics:${lyrics ? 'yes' : 'no'}`);
          importedCount++;
        }
      } catch (e) {
        console.error(`✗ Exception: ${s.title} - ${e.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    
    console.log(`\n=== Import Summary ===`);
    console.log(`Total imported: ${importedCount}/${songs.length}`);
    process.exit(importedCount === songs.length ? 0 : 1);
  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
})();
