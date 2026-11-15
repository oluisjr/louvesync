import test from 'node:test';
import assert from 'node:assert/strict';
import { repertoireView } from '../src/lib/repertoire-view.js';

const definitions = { jubilo:{label:'Júbilo',color:'#00c9a7'}, adoracao:{label:'Adoração',color:'#7b3ff2'} };
const songs = [
  {id:'first',title:'Canção 10',artist:'João',cat:'adoracao',key:'D'},
  {id:'second',title:'Canção 2',artist:'João',cat:'adoracao',key:'C'},
  {id:'third',title:'Celebração',artist:'Equipe',cat:'jubilo',key:'D'},
];

test('favorite songs remain visible across categories and combine with artist, title and key filters', () => {
  const favorites = ['first','third','deleted-song'];
  const view = repertoireView(songs, definitions, {category:'fav',favorites});
  assert.equal(view.favoriteCount, 2);
  assert.equal(view.resultCount, 2);
  assert.deepEqual(view.groups.map(group=>group.id), ['jubilo','adoracao']);
  assert.deepEqual(view.groups.flatMap(group=>group.songs.map(song=>song.id)), ['third','first']);
  const artist = repertoireView(songs, definitions, {category:'fav',favorites,search:' JOAO ',key:'D'});
  assert.deepEqual(artist.groups[0].songs.map(song=>song.id), ['first']);
  assert.equal(repertoireView(songs, definitions, {search:'celebracao'}).resultCount, 1);
  assert.equal(repertoireView(songs, definitions, {category:'fav',favorites:[]}).resultCount, 0);
});

test('custom and uncategorized music stays reachable and titles sort without mutating the catalog', () => {
  const extra = [...songs,{id:'custom',title:'Especial',cat:'Acústico'},{id:'missing',artist:null,cat:null}];
  const before = structuredClone(extra);
  const view = repertoireView(extra, definitions);
  assert.equal(view.resultCount, 5);
  assert.equal(view.groups.flatMap(group=>group.songs).length, 5);
  assert.deepEqual(view.groups.find(group=>group.id==='adoracao').songs.map(song=>song.id), ['second','first']);
  assert.equal(view.categories.find(category=>category.id==='uncategorized').label, 'Sem categoria');
  assert.equal(repertoireView(extra, definitions, {category:'Acústico'}).groups[0].songs[0].id, 'custom');
  assert.deepEqual(extra, before);
});

test('summary and available keys describe the entire catalog even when the results are empty', () => {
  const view = repertoireView(songs, definitions, {category:'jubilo',key:'C',favorites:['first']});
  assert.equal(view.total, 3);
  assert.equal(view.favoriteCount, 1);
  assert.equal(view.categoryCount, 2);
  assert.deepEqual(view.keys, ['C','D']);
  assert.equal(view.resultCount, 0);
  assert.equal(view.hasFilters, true);
  assert.deepEqual(view.groups, []);
  const empty = repertoireView([], definitions);
  assert.equal(empty.total, 0);
  assert.equal(empty.categoryCount, 0);
  assert.equal(empty.hasFilters, false);
  assert.deepEqual(empty.keys, []);
});
