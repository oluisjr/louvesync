// Rehearsals use the repertoire of services and other scheduled events.
// They keep their own team and attendance, without a duplicate setlist.
export function withoutRehearsalSongs(event) {
  if (event?.type !== 'ensaio') return event;
  return {
    ...event,
    songs: [],
    items: (event.items || []).filter(item => item.type !== 'song' && !item.song_id),
    singerBySong: {},
    sequenceBySong: {},
    keyBySong: {},
    requested_songs: [],
    santa_ceia_song: null,
  };
}

export function rehearsalEvents(events) {
  return events.filter(event => event.type !== 'ensaio' && (event.type === 'culto' || event.songs?.length > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
}

export function defaultRehearsalEvent(events, today) {
  const upcoming = events.filter(event => event.date >= today);
  return upcoming.find(event => event.songs?.length) || upcoming[0]
    || events.findLast(event => event.songs?.length) || events.at(-1);
}
