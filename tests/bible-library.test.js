import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleLibraryKey, bibleVerseKey, bibleVerseShareText, normalizeBibleLibrary, updateBibleLibrary, shareBibleVerse } from '../src/lib/bible-library.js';
import { adjacentBibleChapter } from '../src/lib/bible-navigation.js';

const verse={book:'john',bookName:'João',chapter:3,verse:16,text:'Porque Deus amou ao mundo de tal maneira…',edition:'blivre'};

test('saving and highlighting are independent and removing both clears an entry',()=>{
  let state=updateBibleLibrary(null,verse,{saved:true},1);assert.equal(state.items[0].saved,true);assert.equal(state.items[0].highlight,null);
  state=updateBibleLibrary(state,verse,{highlight:'yellow'},2);assert.equal(state.items[0].saved,true);
  state=updateBibleLibrary(state,verse,{saved:false},3);assert.equal(state.items.length,1);assert.equal(state.items[0].highlight,'yellow');
  state=updateBibleLibrary(state,verse,{highlight:null},4);assert.deepEqual(state.items,[]);
});

test('the collection isolates users, keeps newest duplicates and rejects invalid references and colors',()=>{
  assert.notEqual(bibleLibraryKey('first'),bibleLibraryKey('second'));
  const good={...verse,saved:true,updatedAt:1};
  const data=normalizeBibleLibrary({items:[good,{...good,highlight:'green',updatedAt:2},{...good,chapter:99},{...good,edition:'almeida'},{...good,verse:0},{...good,saved:false,highlight:'invalid'}]});
  assert.equal(data.items.length,1);assert.equal(data.items[0].highlight,'green');assert.equal(bibleVerseKey(data.items[0]),'blivre:john:3:16');
  assert.deepEqual(normalizeBibleLibrary('bad'),{version:1,items:[]});
});

test('share preserves the verse and includes reference, edition, authors and the exact source chapter',async()=>{
  const text=bibleVerseShareText(verse);assert.ok(text.startsWith(verse.text+'\n'));assert.match(text,/João 3:16 · Bíblia Livre \(2018\)/);assert.match(text,/Diego Santos/);assert.match(text,/CC BY 4.0/);assert.ok(text.endsWith('/JHN03.htm'));
  assert.ok(bibleVerseShareText({...verse,book:'psalms',chapter:23}).endsWith('/PSA023.htm'));
  let request,copied=false;
  assert.equal(await shareBibleVerse(verse,{share:async data=>{request=data;},copy:async()=>{copied=true;return true;}}),'shared');
  assert.equal(request.text,text);assert.equal(request.title,'João 3:16');assert.equal(copied,false);
});

test('share cancellation is silent while unavailable or failed sharing offers copy and then manual text',async()=>{
  let copies=0;const copy=async()=>{copies++;return true;};
  assert.equal(await shareBibleVerse(verse,{share:async()=>{throw new DOMException('Cancelled','AbortError');},copy}),'cancelled');assert.equal(copies,0);
  assert.equal(await shareBibleVerse(verse,{copy}),'copied');assert.equal(copies,1);
  assert.equal(await shareBibleVerse(verse,{share:async()=>{throw new Error('denied');},copy}),'copied');
  assert.equal(await shareBibleVerse(verse,{copy:async()=>false}),'manual');
});

test('the chapter center crosses book boundaries and stops at the beginning and end of the Bible',()=>{
  const books=[{a:'genesis',c:50},{a:'exodus',c:40},{a:'revelation',c:22}];
  assert.deepEqual(adjacentBibleChapter(books,'genesis',49,1),{book:'genesis',chapter:50});
  assert.deepEqual(adjacentBibleChapter(books,'genesis',50,1),{book:'exodus',chapter:1});
  assert.deepEqual(adjacentBibleChapter(books,'exodus',1,-1),{book:'genesis',chapter:50});
  assert.equal(adjacentBibleChapter(books,'genesis',1,-1),null);assert.equal(adjacentBibleChapter(books,'revelation',22,1),null);
});
