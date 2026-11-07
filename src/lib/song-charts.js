import charts from '../data/pdf-charts.js';
import { isChordSymbol } from './chords.js';

export function normalizeSongTitle(title) {
  return String(title || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const byTitle = new Map(charts.flatMap(chart => [chart.title, ...chart.aliases].map(title => [normalizeSongTitle(title), chart])));
export function findSongChart(song) {
  return byTitle.get(normalizeSongTitle(song?.title)) || null;
}

export function withSongChart(song) {
  // Keep authored charts, IDs, categories, media and each vocalist's keys.
  // Only empty/plain lyrics receive the supplied arrangement. No database
  // columns or synthetic songs are created; refreshing cannot erase this pack.
  if (!song || [...String(song.lyrics || '').matchAll(/\[([^\]]+)\]/g)].some(match => isChordSymbol(match[1]))) return song;
  const chart = findSongChart(song);
  if (!chart) return song;
  const preferred = chart.versions[0];
  return { ...song, key: /^[A-G][#b]?m?$/.test(song.key) ? song.key : preferred.referenceKey || 'C', lyrics: preferred.lyrics };
}
