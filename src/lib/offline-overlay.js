const put = (list, row) => list.some(item => item.id === row.id) ? list.map(item => item.id === row.id ? { ...item, ...row, _pendingOffline: true } : item) : [...list, { ...row, _pendingOffline: true }];
export function overlayWorkspace(songs, events, jobs) {
  let catalog = songs, agenda = events;
  for (const job of jobs) {
    const data = job.data;
    if (job.type === 'save_song') catalog = put(catalog, data);
    if (job.type === 'create_event') for (const event of Array.isArray(data) ? data : [data]) agenda = put(agenda, event);
    if (job.type === 'confirm') agenda = agenda.map(event => event.id === data.eventId ? { ...event, confirmations: { ...event.confirmations, [data.memberId]: data.confirmed }, _pendingOffline: true } : event);
    if (job.type === 'delete_content') { if (data.targetType === 'song') catalog = catalog.filter(song => song.id !== data.targetId); else agenda = agenda.filter(event => event.id !== data.targetId); }
    if (['singer', 'sequence', 'song_options', 'setlist'].includes(job.type)) agenda = agenda.map(event => event.id !== data.eventId ? event : { ...event, _pendingOffline: true,
      ...(job.type === 'singer' ? { singerBySong: { ...event.singerBySong, [data.songId]: data.memberId } } : {}),
      ...(job.type === 'sequence' ? { sequenceBySong: { ...event.sequenceBySong, [data.songId]: data.text } } : {}),
      ...(job.type === 'song_options' ? { keyBySong: { ...event.keyBySong, [data.songId]: data.key } } : {}),
      ...(job.type === 'setlist' ? { _pendingSetlist: true } : {}),
    });
    if (job.type === 'vocal_key' || (job.type === 'song_options' && data.updateOfficial)) catalog = catalog.map(song => song.id === data.songId ? { ...song, vocal_keys: { ...song.vocal_keys, [data.singerId]: data.key }, _pendingOffline: true } : song);
    if (job.type === 'song_options') catalog = catalog.map(song => song.id === data.songId ? { ...song, ...(data.bpm ? { bpm: data.bpm } : {}), ...(data.time_signature ? { time_signature: data.time_signature } : {}) } : song);
  }
  return { songs: catalog, events: agenda };
}
export function overlayMural(data, jobs) {
  let { posts = [], comments = [], reactions = [], saves = [] } = data;
  for (const job of jobs) {
    const row = job.data;
    if (job.type === 'create_post') posts = put(posts, { ...row, pendingSync: true, _publication: 'pending' });
    if (job.type === 'create_comment') comments = put(comments, row);
    if (job.type === 'toggle_reaction') {
      const matches = value => Object.entries(row.row).every(([key, entry]) => value[key] === entry);
      reactions = reactions.filter(value => !matches(value));
      if (row.action === 'insert') reactions = [...reactions, row.row];
    }
    if (job.type === 'toggle_save') { saves = saves.filter(id => id !== row.row.post_id); if (row.action === 'insert') saves = [...saves, row.row.post_id]; }
  }
  return { posts, comments, reactions, saves };
}
