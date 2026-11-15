import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { BIBLE_BOOK_IDS, normalizeBibleVerses } from '../src/lib/bible-client.js';
import { BIBLE_EDITION } from '../src/lib/bible-edition.js';

const vplAliases = {SOL:'SNG',EZE:'EZK',JOE:'JOL',NAH:'NAM',MAR:'MRK',JOH:'JHN',PHI:'PHP',JAM:'JAS','1JO':'1JN','2JO':'2JN','3JO':'3JN'};

export function importBibleSource(bytes) {
  const files = unzipSync(bytes);
  if (!files['porbr2018_vpl.txt']) throw new Error('Arquivo VPL da Bíblia Livre não encontrado.');
  const books = Object.fromEntries(BIBLE_BOOK_IDS.map(book => [book.usfm, Array.from({length:book.chapters}, () => [])]));
  const text = strFromU8(files['porbr2018_vpl.txt']);
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([A-Z0-9]{3}) (\d+):(\d+) (.+)$/.exec(line);
    if (!match) throw new Error('Linha VPL inválida.');
    const [,book,chapter,verse,content] = match;
    const rows = books[vplAliases[book] || book]?.[Number(chapter)-1];
    if (!rows || Number(verse)!==rows.length+1) throw new Error(`Referência VPL inválida: ${book} ${chapter}:${verse}`);
    rows.push(content);
  }
  let verses = 0;
  for (const chapters of Object.values(books)) for (const rows of chapters) {
    normalizeBibleVerses(rows.map((text,index) => ({number:index+1,text})));
    verses += rows.length;
  }
  if (verses!==31102) throw new Error('A edição deve conter os 31.102 versículos, sem lacunas.');
  return {books, verses, about:strFromU8(files['porbr2018_about.htm'])};
}

async function main() {
  if (!process.argv[2]) throw new Error('Uso: node scripts/import_bible.js caminho/porbr2018_vpl.zip');
  const bytes = await readFile(process.argv[2]);
  const imported = importBibleSource(bytes);
  const directory = new URL('../data/bible/', import.meta.url);
  await mkdir(directory, {recursive:true});
  // Preserve the source wording, accents and punctuation verbatim. Only the
  // reference prefixes become JSON indexes; no translation or rewriting occurs.
  const json = '{\n'+Object.entries(imported.books).map(([id,chapters]) => `  "${id}": [\n${chapters.map(rows=>'    '+JSON.stringify(rows)).join(',\n')}\n  ]`).join(',\n')+'\n}\n';
  await writeFile(new URL('blivre.json',directory), json);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const manifest = {...BIBLE_EDITION, archiveUrl:'https://ebible.org/Scriptures/porbr2018_vpl.zip', archiveSha256:hash(bytes), dataSha256:hash(json), books:66, chapters:1189, verses:imported.verses, conversion:'Exact VPL text, grouped by canonical book/chapter/verse. No wording changes.'};
  await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(new URL('source-about.htm',directory),imported.about);
  console.log(`Bíblia Livre importada: 66 livros, 1.189 capítulos, ${imported.verses} versículos. SHA-256 ${manifest.dataSha256}`);
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
