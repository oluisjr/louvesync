// src/lib/scraper.js
// Multi-source chord/lyric search via allorigins CORS proxy.
// Sources: CifraClub (chords) → Vagalume (lyrics) → Letras.mus.br (lyrics)

const PROXIES = [
  url => `/api/proxy?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`
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

      if (pUrl.includes('allorigins.win/get')) {
        const j = await r.json();
        if (j.contents && !j.contents.includes('520 Web Server') && !j.contents.includes('503 Service')) return j.contents;
      } else {
        const text = await r.text();
        if (text && !text.includes('520 Web Server') && !text.includes('503 Service')) return text;
      }
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

function htmlToChordText(html = '') {
  return html
    .replace(/<span[^>]*data-chord=[^>]*>([^<]+)<\/span>/gi, (_, c) => `[${c.trim()}]`)
    .replace(/<b>([A-G][^<\s]{0,10})<\/b>/gi, (_, c) => `[${c.trim()}]`)
    .replace(/<strong>([A-G][^<\s]{0,10})<\/strong>/gi, (_, c) => `[${c.trim()}]`)
    .replace(/<a[^>]*>([A-G][^<]{0,8})<\/a>/gi, (_, c) => /^[A-G]/.test(c.trim()) ? `[${c.trim()}]` : c)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function titleCase(s = '') {
  return s.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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



/* ─── CifraClub (Advanced Search via Vagalume/Google fallback) ─────────────── */
async function searchCifraClub(title, artist) {
  const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = [];
    const seen = new Set();
    
    for (const r of (data.results || [])) {
      const aSlug = slugify(r.artistName);
      const tSlug = slugify(r.trackName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, ''));
      const url = `https://www.cifraclub.com.br/${aSlug}/${tSlug}/`;
      if (!seen.has(url)) {
        seen.add(url);
        results.push({
          id: `cifraclub_${results.length}`,
          source: 'CifraClub',
          title: r.trackName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim(),
          artist: r.artistName,
          url,
          hasCifra: true,
          icon: '🎸'
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchSongCandidates(title, artist) {
  const [vag, let_, lrc, cifraclub] = await Promise.allSettled([
    searchVagalumeCandidates(title, artist),
    searchLetrasCandidates(title, artist),
    searchLRCLibCandidates(title, artist),
    searchCifraClub(title, artist)
  ]);

  return [
    ...(cifraclub.status === 'fulfilled' ? cifraclub.value : []),
    ...(lrc.status   === 'fulfilled' ? lrc.value   : []),
    ...(vag.status   === 'fulfilled' ? vag.value   : []),
    ...(let_.status  === 'fulfilled' ? let_.value  : []),
  ];
}

/* ─── Fetch CifraClub chord content from URL ──────────── */
export async function fetchCifraClubContent(url) {
  const html = await proxyGet(url);
  if (!html) return null;
  
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pre = doc.querySelector('pre');
  if (!pre) return null;

  let key = 'C';
  const keyEl = doc.querySelector('#cifra_tom a');
  if (keyEl) key = keyEl.textContent.trim();

  // Converter CifraClub: eles usam <b>A</b> para acordes
  // Substituímos os <b> por [A], e então extraímos o texto mantendo os espaços exatos
  let rawHtml = pre.innerHTML;
  rawHtml = rawHtml.replace(/<b>([^<]+)<\/b>/gi, (_, c) => `[${c.trim()}]`);
  
  // Limpar span extras (como as de tablatura ou formatação)
  rawHtml = rawHtml.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
  rawHtml = rawHtml.replace(/<[^>]+>/g, '');
  rawHtml = rawHtml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  
  let rawText = rawHtml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Não usar mergeChords complicado, apenas retornar o texto pré-formatado (que o App.jsx vai renderizar em fonte monoespaçada)
  if (rawText.length < 50) return null;

  return { text: rawText, key, hasCifra: /\[[A-G]/.test(rawText) };
}

/* ─── Backward compat: find first match (used by old genCifra) */
export async function findSongData(title, artist, onStatus) {
  onStatus?.('iniciando');
  const candidates = await searchSongCandidates(title, artist);

  for (const c of candidates.filter(c => c.source.includes('Cifra'))) {
    onStatus?.(c.source);
    const fetchFn = c.source === 'Cifras.com.br' ? fetchCifrasComBrContent : fetchCifraClubContent;
    const full = await fetchFn(c.url);
    if (full) { onStatus?.('found:' + c.source); return { ...c, ...full }; }
  }

  const fallback = candidates.find(c => c.text);
  if (fallback) { onStatus?.('found:' + fallback.source); return fallback; }

  onStatus?.('notfound');
  return null;
}
