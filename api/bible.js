import { bibleReference, normalizeBibleVerses } from '../src/lib/bible-client.js';

const MAX_CACHE = 300;
const FRESH_MS = 24*60*60*1000;

function providerVerses(data, reference, source) {
  if (source==='getbible') {
    if (Number(data?.book_nr)!==reference.number || Number(data?.chapter)!==reference.chapter || data?.abbreviation!=='almeida' || (data.lang && data.lang!=='pt')) throw new Error('Capítulo inválido.');
  } else if (data?.translation_id && data.translation_id!=='almeida') throw new Error('Tradução inválida.');
  for (const verse of data?.verses || []) {
    if ((verse.chapter && Number(verse.chapter)!==reference.chapter) || (verse.book_id && verse.book_id!==reference.usfm)) throw new Error('Capítulo inválido.');
  }
  return normalizeBibleVerses(data?.verses);
}

async function providerChapter(fetchImpl, source, url, reference, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer=setTimeout(() => { controller.abort(); reject(new Error('Leitura indisponível.')); }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(url, { signal:controller.signal, headers:{ Accept:'application/json' } });
      if (!response.ok) throw new Error('Leitura indisponível.');
      return providerVerses(await response.json(), reference, source);
    })(),timeout]);
  } finally { clearTimeout(timer); }
}

export function createBibleHandler({ fetchImpl=fetch, cache=new Map(), now=Date.now, timeoutMs=5000 }={}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
    if (req.method!=='GET') { res.setHeader('Allow','GET'); return res.status(405).json({ error:'Método não permitido.' }); }
    let reference;
    try { reference=bibleReference(req.query?.book, req.query?.chapter); }
    catch { return res.status(400).json({ error:'Livro ou capítulo inválido.' }); }
    const key=reference.id+':'+reference.chapter;
    const cached=cache.get(key);
    const reply=(verses, source, stale=false) => res.status(200).json({ book:reference.id, chapter:reference.chapter, translation:'almeida', source, stale, verses });
    if (cached && now()-cached.at<FRESH_MS) return reply(cached.verses,cached.source);
    const providers=[
      ['getbible',`https://api.getbible.net/v2/almeida/${reference.number}/${reference.chapter}.json`],
      ['bible-api',`https://bible-api.com/data/almeida/${reference.usfm}/${reference.chapter}`],
    ];
    for (const [source, url] of providers) {
      try {
        const verses=await providerChapter(fetchImpl,source,url,reference,timeoutMs);
        cache.delete(key);
        cache.set(key,{ verses, source, at:now() });
        if (cache.size>MAX_CACHE) cache.delete(cache.keys().next().value);
        return reply(verses,source);
      } catch { /* The independent provider or a previously read chapter can still serve the request. */ }
    }
    if (cached) return reply(cached.verses,cached.source,true);
    res.setHeader('Cache-Control','no-store');
    return res.status(503).json({ error:'Não foi possível carregar este capítulo. Tente novamente.' });
  };
}

export default createBibleHandler();
