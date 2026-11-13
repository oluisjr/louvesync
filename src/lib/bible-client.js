// Stable canonical order: GetBible uses book numbers, Bible API uses USFM IDs.
const ids = ['genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth','1 samuel','2 samuel','1 kings','2 kings','1 chronicles','2 chronicles','ezra','nehemiah','esther','job','psalms','proverbs','ecclesiastes','song of solomon','isaiah','jeremiah','lamentations','ezekiel','daniel','hosea','joel','amos','obadiah','jonah','micah','nahum','habakkuk','zephaniah','haggai','zechariah','malachi','matthew','mark','luke','john','acts','romans','1 corinthians','2 corinthians','galatians','ephesians','philippians','colossians','1 thessalonians','2 thessalonians','1 timothy','2 timothy','titus','philemon','hebrews','james','1 peter','2 peter','1 john','2 john','3 john','jude','revelation'];
const chapters = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
const usfm = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];

export const BIBLE_BOOK_IDS = Object.freeze(ids.map((id, index) => Object.freeze({ id, number:index+1, chapters:chapters[index], usfm:usfm[index] })));

export function bibleReference(book, chapter) {
  if (typeof book !== 'string' || !/^[1-3]?[a-z ]+$/i.test(book)) throw new Error('Livro inválido.');
  if (typeof chapter!=='string' && typeof chapter!=='number') throw new Error('Capítulo inválido.');
  const id = book.trim().toLowerCase().replace(/\s+/g,' ');
  const found = BIBLE_BOOK_IDS.find(item => item.id === id);
  if (!found || !/^[1-9]\d{0,2}$/.test(String(chapter)) || !Number.isSafeInteger(Number(chapter)) || Number(chapter)>found.chapters) throw new Error('Capítulo inválido.');
  return { ...found, chapter:Number(chapter) };
}

export function normalizeBibleVerses(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length>200) throw new Error('Capítulo indisponível.');
  let previous = 0;
  return rows.map(item => {
    const number = Number(item?.number ?? item?.verse);
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    const invalidText = text.includes('\ufffd') || [...text].some(char => { const code=char.charCodeAt(0); return code<32 && ![9,10,13].includes(code); });
    if (!Number.isSafeInteger(number) || number<=previous || number>200 || (!previous && number!==1) || !text || text.length>20000 || invalidText) throw new Error('Capítulo indisponível.');
    previous = number;
    return { number, text };
  });
}

export function normalizeBiblePosition(value, books) {
  const book = books.find(item => item.a === value?.book) || books.find(item => item.a === 'john') || books[0];
  const chapter = Number(value?.chapter);
  return { book:book.a, chapter:Number.isSafeInteger(chapter) && chapter>=1 && chapter<=book.c ? chapter : 1 };
}

export async function fetchBibleChapter(book, chapter, { signal, fetchImpl = fetch, timeoutMs = 14000 } = {}) {
  const reference = bibleReference(book, chapter);
  if (signal?.aborted) throw new DOMException('Leitura cancelada.','AbortError');
  const controller = new AbortController();
  let timer;
  let rejectCancelled;
  const cancelled = new Promise((_, reject) => { rejectCancelled=reject; });
  const abort = () => { controller.abort(); rejectCancelled(new DOMException('Leitura cancelada.','AbortError')); };
  signal?.addEventListener('abort', abort, { once:true });
  timer = setTimeout(() => { controller.abort(); rejectCancelled(new Error('O carregamento demorou demais. Tente novamente.')); }, timeoutMs);
  try {
    const request = (async () => {
      const response = await fetchImpl(`/api/bible?book=${encodeURIComponent(reference.id)}&chapter=${reference.chapter}`, { signal:controller.signal });
      if (!response.ok) throw new Error('Não foi possível carregar este capítulo.');
      const data = await response.json();
      // Identity is present on the app API; rejecting mismatches avoids caching
      // a stale response under a different book/chapter during rapid selection.
      if ((data.book && data.book!==reference.id) || (data.chapter && Number(data.chapter)!==reference.chapter)) throw new Error('Capítulo inválido.');
      return normalizeBibleVerses(data.verses);
    })();
    return await Promise.race([request, cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
