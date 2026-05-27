const fs = require('fs');

async function getSongs() {
  const env = fs.readFileSync('.env', 'utf-8').split('\n');
  const get = k => { const l = env.find(x => x.startsWith(k+'=')); return l ? l.split('=').slice(1).join('=').trim() : ''; };
  const url = get('VITE_SUPABASE_URL');
  const key = get('VITE_SUPABASE_ANON_KEY');
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };
  const r = await fetch(`${url}/rest/v1/songs?select=id,title,artist,key,lyrics&order=title`, { headers });
  const songs = await r.json();
  console.log('Total songs:', songs.length);
  songs.forEach((s, i) => {
    const hasLyrics = s.lyrics && s.lyrics.trim().length > 10;
    console.log(`${i+1}. [${hasLyrics ? '✅' : '❌'}] ${s.title} — ${s.artist} (key: ${s.key})`);
  });
  fs.writeFileSync('songs_list.json', JSON.stringify(songs, null, 2));
  console.log('\nSaved to songs_list.json');
}
getSongs().catch(console.error);
