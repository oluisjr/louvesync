import chapters from '../data/bible/blivre.json' with { type:'json' };
import { bibleReference, normalizeBibleVerses } from '../src/lib/bible-client.js';
import { BIBLE_EDITION } from '../src/lib/bible-edition.js';

export function createBibleHandler({ data=chapters }={}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    if (req.method!=='GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'Método não permitido.'}); }
    let reference;
    try { reference=bibleReference(req.query?.book,req.query?.chapter); }
    catch { return res.status(400).json({error:'Livro ou capítulo inválido.'}); }
    if (req.query?.edition && req.query.edition!==BIBLE_EDITION.revision) return res.status(409).json({error:'Atualize o aplicativo para ler a edição atual.'});
    try {
      const rows=data[reference.usfm]?.[reference.chapter-1];
      const verses=normalizeBibleVerses(rows?.map((text,index)=>({number:index+1,text})));
      return res.status(200).json({book:reference.id,chapter:reference.chapter,translation:BIBLE_EDITION.id,edition:BIBLE_EDITION.revision,translationName:BIBLE_EDITION.title,language:BIBLE_EDITION.language,source:BIBLE_EDITION.source,sourceUrl:BIBLE_EDITION.sourceUrl,credits:BIBLE_EDITION.credits,license:BIBLE_EDITION.license,verses});
    } catch { return res.status(503).json({error:'Não foi possível carregar este capítulo. Tente novamente.'}); }
  };
}

export default createBibleHandler();
