import { bibleReference } from './bible-client.js';
import { BIBLE_EDITION } from './bible-edition.js';

export const BIBLE_HIGHLIGHTS = Object.freeze([{id:'yellow',label:'Amarelo'},{id:'purple',label:'Lilás'},{id:'green',label:'Verde'}]);
export const bibleLibraryKey = profileId => `ls_bible_library_v1_${profileId || 'local'}`;
export const bibleVerseKey = item => `${item.edition}:${item.book}:${item.chapter}:${item.verse}`;
export const bibleVerseLabel = item => `${item.bookName} ${item.chapter}:${item.verse}`;

export function normalizeBibleLibrary(value) {
  const unique = new Map();
  for (const row of Array.isArray(value?.items) ? value.items : []) {
    try {
      const reference=bibleReference(row.book,row.chapter);
      const highlight=BIBLE_HIGHLIGHTS.some(color=>color.id===row.highlight)?row.highlight:null;
      const saved=row.saved===true;
      if (row.edition!==BIBLE_EDITION.id || !Number.isSafeInteger(row.verse) || row.verse<1 || row.verse>200 || typeof row.text!=='string' || !row.text.trim() || row.text.length>20000 || (!saved&&!highlight)) continue;
      const item={book:reference.id,chapter:reference.chapter,verse:row.verse,bookName:typeof row.bookName==='string'?row.bookName:reference.id,text:row.text,edition:row.edition,saved,highlight,updatedAt:Number.isFinite(row.updatedAt)?row.updatedAt:0};
      const key=bibleVerseKey(item);
      if (!unique.has(key) || unique.get(key).updatedAt<=item.updatedAt) unique.set(key,item);
    } catch { /* Ignore invalid entries without losing the remaining collection. */ }
  }
  return {version:1,items:[...unique.values()].sort((a,b)=>b.updatedAt-a.updatedAt)};
}

export function updateBibleLibrary(library, verse, patch, now=Date.now()) {
  const previous=normalizeBibleLibrary(library);
  const key=bibleVerseKey(verse);
  const current=previous.items.find(item=>bibleVerseKey(item)===key);
  const next={...verse,saved:current?.saved || false,highlight:current?.highlight || null,...patch,updatedAt:now};
  return normalizeBibleLibrary({items:[...previous.items.filter(item=>bibleVerseKey(item)!==key),next]});
}

export function bibleVerseShareText(item) {
  const reference=bibleReference(item.book,item.chapter);
  const chapter=String(reference.chapter).padStart(Math.max(2,String(reference.chapters).length),'0');
  return `${item.text}\n\n${bibleVerseLabel(item)} · ${BIBLE_EDITION.title}\n${BIBLE_EDITION.credits} · ${BIBLE_EDITION.license}\n${BIBLE_EDITION.sourceUrl}${reference.usfm}${chapter}.htm`;
}

export async function shareBibleVerse(item,{share,copy}) {
  const text=bibleVerseShareText(item);
  if (share) {
    try { await share({title:bibleVerseLabel(item),text});return 'shared'; }
    catch (error) { if (error.name==='AbortError') return 'cancelled'; }
  }
  try { if (await copy(text)) return 'copied'; } catch { /* The manual copy field remains available. */ }
  return 'manual';
}
