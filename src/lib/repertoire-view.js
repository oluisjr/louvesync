const categoryId = song => song.cat || 'uncategorized';
const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export function repertoireView(songs, definitions, { category = 'all', key = '', search = '', favorites = [] } = {}) {
  const favoriteIds = new Set(favorites);
  const counts = new Map();
  for (const song of songs) counts.set(categoryId(song), (counts.get(categoryId(song)) || 0) + 1);
  const categories = [...new Set([...Object.keys(definitions), ...counts.keys()])].map(id => ({
    id,
    label: definitions[id]?.label || (id === 'uncategorized' ? 'Sem categoria' : id),
    color: definitions[id]?.color || '#64748b',
    count: counts.get(id) || 0,
  }));
  const query = searchText(search);
  const filtered = songs.filter(song =>
    (category === 'all' || (category === 'fav' ? favoriteIds.has(song.id) : categoryId(song) === category))
    && (!key || String(song.key || '').trim() === key)
    && (!query || searchText(song.title).includes(query) || searchText(song.artist).includes(query)));

  return {
    total: songs.length,
    favoriteCount: songs.filter(song => favoriteIds.has(song.id)).length,
    categoryCount: counts.size,
    categories,
    keys: [...new Set(songs.map(song => String(song.key || '').trim()).filter(Boolean))].sort(),
    resultCount: filtered.length,
    hasFilters: category !== 'all' || !!key || !!query,
    groups: categories.map(item => ({ ...item, songs: filtered.filter(song => categoryId(song) === item.id)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR', { sensitivity: 'base', numeric: true })) }))
      .filter(group => group.songs.length),
  };
}
