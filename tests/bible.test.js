import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBibleHandler } from '../api/bible.js';
import { BIBLE_BOOK_IDS, bibleReference, fetchBibleChapter, normalizeBiblePosition, normalizeBibleVerses } from '../src/lib/bible-client.js';

const verses=[{ verse:1, text:'No princípio era o Verbo, e o Verbo estava com Deus, e o Verbo era Deus.' },{ verse:2, text:'Ele estava no princípio com Deus.' }];
const getBible={ abbreviation:'almeida', lang:'pt', book_nr:43, chapter:1, verses };
const json=data=>({ ok:true, async json(){ return structuredClone(data); } });
function response(){ return { code:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;} }; }
async function request(handler, query={book:'john',chapter:'1'}, method='GET'){ const res=response();await handler({method,query},res);return res; }

test('all 66 existing Bible book IDs map to the correct canonical book, chapter range and USFM identity',()=>{
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const original=[...app.slice(app.indexOf('const BIBLE_BOOKS = ['),app.indexOf('];',app.indexOf('const BIBLE_BOOKS = ['))).matchAll(/\{a:'([^']+)',n:'[^']+',c:(\d+)\}/g)].map(match=>({id:match[1],chapters:Number(match[2])}));
  assert.equal(original.length,66);assert.equal(BIBLE_BOOK_IDS.length,66);
  original.forEach((book,index)=>{ const result=bibleReference(book.id,book.chapters);assert.equal(result.number,index+1);assert.equal(result.chapters,book.chapters);assert.match(result.usfm,/^[1-3A-Z][A-Z0-9]{2}$/);assert.throws(()=>bibleReference(book.id,book.chapters+1)); });
  assert.equal(bibleReference('1 john',1).number,62);assert.equal(bibleReference('song of solomon',8).number,22);
});

test('Bible API rejects malformed book/chapter input and methods before contacting any provider',async()=>{
  let calls=0;const handler=createBibleHandler({fetchImpl:async()=>{calls++;return json(getBible);}});
  for(const query of [{},{book:'john',chapter:'0'},{book:'john',chapter:'22'},{book:'john',chapter:'1.5'},{book:'john',chapter:'01'},{book:'https://localhost',chapter:'1'},{book:['john'],chapter:'1'},{book:'john',chapter:['1']},{book:'revelation',chapter:'Infinity'}])assert.equal((await request(handler,query)).code,400);
  const method=await request(handler,undefined,'POST');assert.equal(method.code,405);assert.equal(method.headers.Allow,'GET');assert.equal(calls,0);
});

test('Bible API uses GetBible numeric identities, normalizes Portuguese text, and reuses cached chapters',async()=>{
  const urls=[];const handler=createBibleHandler({fetchImpl:async(url,options)=>{urls.push(url);assert.equal(options.headers.Accept,'application/json');return json(getBible);}});
  const first=await request(handler);assert.equal(first.code,200);assert.equal(first.body.book,'john');assert.equal(first.body.chapter,1);assert.equal(first.body.source,'getbible');assert.deepEqual(first.body.verses,verses.map(row=>({number:row.verse,text:row.text})));
  assert.equal(urls[0],'https://api.getbible.net/v2/almeida/43/1.json');await request(handler);assert.equal(urls.length,1);
});

test('wrong chapter, corrupt Unicode, invalid JSON or unavailable GetBible fall back to the independent Almeida provider',async()=>{
  const failures=[json({...getBible,book_nr:1}),json({...getBible,chapter:2}),json({...getBible,lang:'en'}),json({...getBible,verses:[{verse:1,text:'Palavra corrompida �'}]}),{ok:true,json:async()=>{throw new SyntaxError('not JSON');}},{ok:false}];
  for(const failure of failures){
    const urls=[];const handler=createBibleHandler({fetchImpl:async url=>{urls.push(url);return urls.length===1?failure:json({translation_id:'almeida',verses:verses.map(row=>({...row,chapter:1,book_id:'JHN'}))});}});
    const res=await request(handler);assert.equal(res.code,200);assert.equal(res.body.source,'bible-api');assert.equal(urls[1],'https://bible-api.com/data/almeida/JHN/1');
  }
});

test('provider timeout aborts the stalled request and fallback validates book identity',async()=>{
  let signal;let calls=0;
  const handler=createBibleHandler({timeoutMs:5,fetchImpl:async(_url,options)=>{calls++;if(calls===1){signal=options.signal;return new Promise(()=>{});}return json({translation_id:'almeida',verses});}});
  assert.equal((await request(handler)).code,200);assert.equal(signal.aborted,true);assert.equal(calls,2);
  const wrong=createBibleHandler({fetchImpl:async()=>json({translation_id:'almeida',verses:[{verse:1,chapter:2,book_id:'GEN',text:'Outro livro.'}]})});
  assert.equal((await request(wrong)).code,503);
});

test('a previously fetched chapter remains available when both providers fail; unseen failures are not cached',async()=>{
  let current=0,fail=false,calls=0;const handler=createBibleHandler({now:()=>current,fetchImpl:async()=>{calls++;if(fail)throw new Error('offline');return json(getBible);}});
  const first=await request(handler);current=25*60*60*1000;fail=true;
  const stale=await request(handler);assert.equal(stale.code,200);assert.equal(stale.body.stale,true);assert.deepEqual(stale.body.verses,first.body.verses);
  const error=await request(handler,{book:'psalms',chapter:'95'});assert.equal(error.code,503);assert.equal(error.headers['Cache-Control'],'no-store');
  const previous=calls;await request(handler,{book:'psalms',chapter:'95'});assert.equal(calls,previous+2);
});

test('Bible client fetches same origin, rejects mismatched responses and preserves valid offline rows',async()=>{
  let seen;
  const rows=await fetchBibleChapter('1 john',1,{fetchImpl:async url=>{seen=url;return json({book:'1 john',chapter:1,verses});}});
  assert.equal(seen,'/api/bible?book=1%20john&chapter=1');assert.deepEqual(normalizeBibleVerses(rows),rows);
  await assert.rejects(fetchBibleChapter('john',1,{fetchImpl:async()=>json({book:'genesis',chapter:1,verses})}));
  await assert.rejects(fetchBibleChapter('john',1,{fetchImpl:async()=>json({book:'john',chapter:2,verses})}));
  for(const bad of [[],null,[{number:1,text:''}],[{number:2,text:'missing first verse'}],[{number:1,text:'x'},{number:1,text:'duplicate'}]])assert.throws(()=>normalizeBibleVerses(bad));
});

test('Bible client cancellation wins even while parsing and timeout aborts a nonresponsive transport',async()=>{
  const cancel=new AbortController();let finish;
  const promise=fetchBibleChapter('john',1,{signal:cancel.signal,fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})})});
  await Promise.resolve();cancel.abort();await assert.rejects(promise,{name:'AbortError'});finish({book:'john',chapter:1,verses});
  let signal;await assert.rejects(fetchBibleChapter('john',1,{timeoutMs:5,fetchImpl:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),/demorou/);assert.equal(signal.aborted,true);
  const already=new AbortController();already.abort();let calls=0;await assert.rejects(fetchBibleChapter('john',1,{signal:already.signal,fetchImpl:async()=>{calls++;return json({verses});}}),{name:'AbortError'});assert.equal(calls,0);
});

test('malformed stored positions recover to João 1 without changing the Bible interface',()=>{
  const books=[{a:'john',c:21},{a:'psalms',c:150}];
  assert.deepEqual(normalizeBiblePosition({book:'psalms',chapter:95},books),{book:'psalms',chapter:95});
  for(const value of [null,'bad',{book:'invalid',chapter:0},{book:'john',chapter:999}])assert.deepEqual(normalizeBiblePosition(value,books),{book:'john',chapter:1});
});
