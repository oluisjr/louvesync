export function generateSetlist(dateStr, allEvents, allSongs, allMembers) {
  const dateObj = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 4 = Thursday

  if (dayOfWeek !== 0 && dayOfWeek !== 4) return []; // Only Thursday and Sunday

  // Identify 1st or 2nd Sunday
  const isSunday = dayOfWeek === 0;
  const isFirstSunday = isSunday && dateObj.getUTCDate() <= 7;
  const isSecondSunday = isSunday && dateObj.getUTCDate() >= 8 && dateObj.getUTCDate() <= 14;

  let layout = [];
  if (dayOfWeek === 4) { // Thursday
    layout = ['jubilo', 'hinario', 'adoracao', 'oferta'];
  } else { // Sunday
    layout = ['jubilo', 'hinario', 'hinario', 'adoracao', 'oferta'];
  }

  if (isFirstSunday) {
    layout.unshift('corinho');
  }
  if (isSecondSunday) {
    layout.push('ceia');
  }

  // Find recently sung songs to avoid repeats (last 7 days approx = last 2 cultos)
  const recentEvents = allEvents
    .filter(e => e.date < dateStr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3); // Check last 3 events
  
  const recentSongIds = new Set();
  for (const ev of recentEvents) {
    if (!ev.items) continue;
    for (const it of ev.items) {
      if (it.type === 'song' && it.song_id) recentSongIds.add(it.song_id);
    }
  }

  // Vocais disponíveis
  const vocals = allMembers.filter(m => m.instrument && m.instrument.toLowerCase().includes('vocal'));
  const availableVocals = vocals.filter(v => {
    if (dayOfWeek === 4) {
      const name = v.name.toLowerCase();
      // Kassya e Lidia só no domingo
      if (name.includes('kassya') || name.includes('kássya') || name.includes('lidia') || name.includes('lídia')) {
        return false;
      }
    }
    return true;
  });

  const setlist = [];

  // Helper to pick a random song and singer
  const pickSong = (category) => {
    let candidates = allSongs.filter(s => s.category === category);
    
    // Try to avoid recent songs
    let freshCandidates = candidates.filter(s => !recentSongIds.has(s.id));
    if (freshCandidates.length > 0) {
      candidates = freshCandidates;
    }

    if (candidates.length === 0) return null;

    // Pick random song
    const song = candidates[Math.floor(Math.random() * candidates.length)];
    // Add to recent so we don't pick it again in the same setlist
    recentSongIds.add(song.id);

    // Pick random singer
    let singerId = null;
    if (availableVocals.length > 0) {
      const singer = availableVocals[Math.floor(Math.random() * availableVocals.length)];
      singerId = singer.id;
    }

    return {
      id: Math.random().toString(36).substring(2, 9),
      type: 'song',
      song_id: song.id,
      singer_id: singerId,
      text: ''
    };
  };

  for (const cat of layout) {
    const item = pickSong(cat);
    if (item) setlist.push(item);
    
    // Insert "Pedidos" right after "oferta"
    if (cat === 'oferta') {
      setlist.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'text',
        song_id: null,
        singer_id: null,
        text: 'Pedidos de Oração / Avisos'
      });
    }
  }

  return setlist;
}
