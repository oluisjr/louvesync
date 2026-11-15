import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import chapters from '../data/bible/blivre.json' with {type:'json'};
import manifest from '../data/bible/manifest.json' with {type:'json'};
import { createBibleHandler } from '../api/bible.js';
import { BIBLE_EDITION, bibleCacheKey } from '../src/lib/bible-edition.js';
import { BIBLE_BOOK_IDS, bibleReference, fetchBibleChapter, normalizeBiblePosition, normalizeBibleVerses } from '../src/lib/bible-client.js';

const json=data=>({ok:true,async json(){return structuredClone(data);}});
const rows=chapters.JHN[0].map((text,index)=>({number:index+1,text}));
const payload=(overrides={})=>({book:'john',chapter:1,translation:BIBLE_EDITION.id,edition:BIBLE_EDITION.revision,language:'pt-BR',verses:rows,...overrides});
function response(){return {code:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
async function request(handler,query={book:'john',chapter:'1'},method='GET'){const res=response();await handler({method,query},res);return res;}

test('all 66 Bible book IDs retain their canonical book, chapter range and USFM identity',()=>{
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const original=[...app.slice(app.indexOf('const BIBLE_BOOKS = ['),app.indexOf('];',app.indexOf('const BIBLE_BOOKS = ['))).matchAll(/\{a:'([^']+)',n:'[^']+',c:(\d+)\}/g)].map(match=>({id:match[1],chapters:Number(match[2])}));
  assert.equal(original.length,66);assert.equal(BIBLE_BOOK_IDS.length,66);
  original.forEach((book,index)=>{const result=bibleReference(book.id,book.chapters);assert.equal(result.number,index+1);assert.equal(result.chapters,book.chapters);assert.throws(()=>bibleReference(book.id,book.chapters+1));});
  assert.equal(bibleReference('1 john',1).usfm,'1JN');assert.equal(bibleReference('song of solomon',8).usfm,'SNG');
});

test('the pinned Brazilian Portuguese edition contains every chapter and 31,102 consecutive verses with its recorded hash',()=>{
  assert.equal(Object.keys(chapters).length,66);let chapterCount=0,verseCount=0;
  for(const book of BIBLE_BOOK_IDS){
    assert.equal(chapters[book.usfm].length,book.chapters,book.id);
    for(const chapter of chapters[book.usfm]){chapterCount++;verseCount+=chapter.length;normalizeBibleVerses(chapter.map((text,index)=>({number:index+1,text})));}
  }
  assert.equal(chapterCount,1189);assert.equal(verseCount,31102);
  const bytes=fs.readFileSync(new URL('../data/bible/blivre.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.dataSha256);
  assert.equal(chapters.GEN[0][0],'No princípio criou Deus os céus e a terra.');
  assert.equal(chapters.JHN[2][15],'Porque Deus amou ao mundo de tal maneira, que deu o seu Filho unigênito; para que todo aquele que nele crê não pereça, mas tenha a vida eterna.');
  assert.equal(chapters.PSA[22][0],'Salmo de Davi: O SENHOR é meu pastor, nada me faltará.');
  assert.equal(manifest.revision,BIBLE_EDITION.revision);
});

test('Bible API rejects invalid references, methods and stale edition URLs',async()=>{
  const handler=createBibleHandler();
  for(const query of [{},{book:'john',chapter:'0'},{book:'john',chapter:'22'},{book:'john',chapter:'1.5'},{book:'john',chapter:'01'},{book:'https://localhost',chapter:'1'},{book:['john'],chapter:'1'},{book:'john',chapter:['1']}])assert.equal((await request(handler,query)).code,400);
  const method=await request(handler,undefined,'POST');assert.equal(method.code,405);assert.equal(method.headers.Allow,'GET');
  assert.equal((await request(handler,{book:'john',chapter:'1',edition:'almeida'})).code,409);
});

test('Bible API serves the exact bundled chapter with edition, language and credits without an upstream provider',async()=>{
  const res=await request(createBibleHandler());assert.equal(res.code,200);assert.equal(res.body.book,'john');assert.equal(res.body.chapter,1);
  assert.equal(res.body.translation,'blivre');assert.equal(res.body.edition,BIBLE_EDITION.revision);assert.equal(res.body.language,'pt-BR');
  assert.equal(res.body.source,'eBible.org');assert.match(res.body.credits,/Diego Santos/);assert.deepEqual(res.body.verses,rows);
  assert.equal((await request(createBibleHandler({data:{}}))).code,503);
});

test('Bible client requires matching edition, language and reference and isolates previous cached translations',async()=>{
  let seen;assert.deepEqual(await fetchBibleChapter('john',1,{fetchImpl:async url=>{seen=url;return json(payload());}}),rows);
  assert.equal(seen,`/api/bible?book=john&chapter=1&edition=${BIBLE_EDITION.revision}`);
  for(const overrides of [{book:'genesis'},{chapter:2},{translation:'almeida'},{edition:'old'},{language:'en'},{book:undefined}])await assert.rejects(fetchBibleChapter('john',1,{fetchImpl:async()=>json(payload(overrides))}));
  assert.notEqual(bibleCacheKey('john',1),'ls_bible_john_1');assert.notEqual(bibleCacheKey('john',1),bibleCacheKey('john',2));
  for(const bad of [[],null,[{number:1,text:''}],[{number:2,text:'missing first'}],[{number:1,text:'ok'},{number:3,text:'missing second'}],[{number:1,text:'corrompido �'}]])assert.throws(()=>normalizeBibleVerses(bad));
});

test('Bible client cancellation wins while parsing and timeout aborts a stalled request',async()=>{
  const cancel=new AbortController();let finish;
  const promise=fetchBibleChapter('john',1,{signal:cancel.signal,fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})})});
  await Promise.resolve();cancel.abort();await assert.rejects(promise,{name:'AbortError'});finish(payload());
  let signal;await assert.rejects(fetchBibleChapter('john',1,{timeoutMs:5,fetchImpl:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),/demorou/);assert.equal(signal.aborted,true);
  const already=new AbortController();already.abort();let calls=0;await assert.rejects(fetchBibleChapter('john',1,{signal:already.signal,fetchImpl:async()=>{calls++;return json(payload());}}),{name:'AbortError'});assert.equal(calls,0);
});

test('malformed stored positions recover to João 1 while valid reading progress remains',()=>{
  const books=[{a:'john',c:21},{a:'psalms',c:150}];assert.deepEqual(normalizeBiblePosition({book:'psalms',chapter:95},books),{book:'psalms',chapter:95});
  for(const value of [null,'bad',{book:'invalid',chapter:0},{book:'john',chapter:999}])assert.deepEqual(normalizeBiblePosition(value,books),{book:'john',chapter:1});
});
