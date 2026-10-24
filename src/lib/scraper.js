// src/lib/scraper.js
// Multi-source chord/lyric search via allorigins CORS proxy.
// Sources: CifraClub (chords) → Vagalume (lyrics) → Letras.mus.br (lyrics)

const PROXIES = [
  url => `/api/proxy?url=${encodeURIComponent(url)}`
];

async function proxyGet(url, timeout = 7000) {
  for (const proxyFn of PROXIES) {
    const pUrl = proxyFn(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(pUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;

      const text = await r.text();
      if (text && !text.includes('520 Web Server') && !text.includes('503 Service')) return text;
    } catch {
      clearTimeout(t);
    }
  }
  return '';
}

function slugify(s = '') {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').trim()
    .replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 65);
}





/* ─── Vagalume API candidates ──────────────────────────────── */
async function searchVagalumeCandidates(title, artist) {
  const q = encodeURIComponent(title);
  const art = encodeURIComponent((artist || '').replace(/\(.*?\)/g, '').trim());
  const raw = await proxyGet(`https://api.vagalume.com.br/search.php?q=${q}&art=${art}`);
  if (!raw) return [];

  try {
    const data = JSON.parse(raw);
    const artName = data.art?.name || artist || '';
    const musArr = Array.isArray(data.mus) ? data.mus : (data.mus ? [data.mus] : []);
    const candidates = [];

    musArr.slice(0, 3).forEach((mus, i) => {
      if (!mus.text) return;
      candidates.push({
        id: `vag_${i}`,
        source: 'Vagalume',
        title: mus.name || title,
        artist: artName,
        text: mus.text,
        onlyLyrics: true,
        hasCifra: false,
        icon: '🎵',
      });
    });

    return candidates;
  } catch { return []; }
}

/* ─── Letras.mus.br candidates ─────────────────────────────── */
async function searchLetrasCandidates(title, artist) {
  const cleanArtist = (artist || '').replace(/\(.*?\)/g, '').trim();
  const aSlug = slugify(cleanArtist.split(/\s+/).slice(0, 3).join(' '));
  const tSlug = slugify(title);
  const html = await proxyGet(`https://www.letras.mus.br/${aSlug}/${tSlug}/`);
  if (!html || html.length < 300) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  if ((doc.title || '').toLowerCase().includes('404')) return [];

  const el = doc.querySelector('.lyric-original, .cnt-letra');
  const text = (el?.textContent || '').trim();
  if (!text || text.length < 50) return [];

  const titleEl = doc.querySelector('h1');
  const artistEl = doc.querySelector('h2');

  return [{
    id: 'let_0',
    source: 'Letras.mus.br',
    title: titleEl?.textContent?.trim() || title,
    artist: artistEl?.textContent?.trim() || cleanArtist || artist,
    text,
    onlyLyrics: true,
    hasCifra: false,
    icon: '📝',
  }];
}

/* ─── LRCLIB API candidates (100% free, no CORS proxy needed) ────────── */
async function searchLRCLibCandidates(title, artist) {
  const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
  try {
    const r = await fetch(`https://lrclib.net/api/search?q=${q}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];

    const candidates = [];
    data.slice(0, 3).forEach((item, i) => {
      if (!item.plainLyrics) return;
      candidates.push({
        id: `lrc_${i}`,
        source: 'LRCLIB (Letra Original)',
        title: item.trackName || title,
        artist: item.artistName || artist,
        text: item.plainLyrics,
        onlyLyrics: true,
        hasCifra: false,
        icon: '🎤',
      });
    });
    return candidates;
  } catch { return []; }
}

/* 🎸 CifraClub — Gera candidatos via slug direto (URL previsível)
   O CifraClub é uma SPA React: a página de busca não tem HTML server-side útil.
   A abordagem correta é construir a URL a partir dos slugs de artista/título. */


export async function searchSongCandidates(title, artist) {
  const [vag, let_, lrc] = await Promise.allSettled([
    searchVagalumeCandidates(title, artist),
    searchLetrasCandidates(title, artist),
    searchLRCLibCandidates(title, artist)
  ]);

  const cifra = artist?.trim() ? [{id:'cifraclub',source:'CifraClub',title,artist,url:`https://www.cifraclub.com.br/${slugify(artist)}/${slugify(title)}/`,hasCifra:true,icon:'🎸'}] : [];
  return [
    ...cifra,
    ...(lrc.status === 'fulfilled' ? lrc.value : []),
    ...(vag.status === 'fulfilled' ? vag.value : []),
    ...(let_.status === 'fulfilled' ? let_.value : []),
  ];
}

/* 🎸 Fetch CifraClub chord content from URL 🎸 */
export async function fetchCifraClubContent(url) {
  try {
    const res = await fetch(`/api/cifra?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      console.error('Failed to fetch from backend', res.status);
      return null;
    }
    const data = await res.json();
    if (!data.text) return null;
    return data;
  } catch (err) {
    console.error('Error in fetchCifraClubContent frontend:', err);
    return null;
  }
}


/* ─── Backward compat: find first match (used by old genCifra) */
export async function findSongData(title, artist, onStatus) {
  onStatus?.('iniciando');
  const candidates = await searchSongCandidates(title, artist);

  const fallback = candidates.find(c => c.text);
  if (fallback) { onStatus?.('found:' + fallback.source); return fallback; }

  onStatus?.('notfound');
  return null;
}
