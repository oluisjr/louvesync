import test from 'node:test';
import assert from 'node:assert/strict';
import { homeMonthDates, homeView, homeVocalCategories } from '../src/lib/home-view.js';

const member={id:'user',status:'ativo'},other={id:'other',status:'ativo'},inactive={id:'inactive',status:'inativo'};
const songs=[{id:'a',title:'A'},{id:'b',title:'B',featured_week:true}];
const event=(id,date='2026-11-15',overrides={})=>({id,date,time:'18:00',type:'culto',songs:['b','a'],members:['user','inactive'],confirmations:{user:null},...overrides});
const view=(events,extra={})=>homeView({events,songs,members:[member,other,inactive],profileId:'user',today:'2026-11-15',...extra});

test('Home defaults to the first upcoming event and keeps an explicitly selected empty day empty',()=>{
  const events=[event('late','2026-11-16',{time:'20:00'}),event('past','2026-11-14'),event('early','2026-11-16',{time:'09:00'})];
  const result=view(events);assert.equal(result.primary.id,'early');assert.equal(result.date,'2026-11-16');assert.equal(result.stats.services,2);
  const empty=view(events,{selectedDate:'2026-11-17'});assert.equal(empty.primary,null);assert.equal(empty.date,'2026-11-17');
  assert.equal(view([]).primary,null);assert.equal(view([]).date,'2026-11-15');
  assert.deepEqual(events.map(event=>event.id),['late','past','early']);
});

test('null confirmations are pending, and visible events never get duplicated in the extra pending list',()=>{
  const events=[event('main'),event('same-day','2026-11-15',{time:'20:00',confirmations:{}}),event('other-day','2026-11-17'),event('outside','2026-11-19'),event('not-assigned','2026-11-16',{members:['other']}),event('declined','2026-11-16',{confirmations:{user:false}})];
  const result=view(events);assert.deepEqual(result.pending.map(event=>event.id),['main','same-day','other-day']);
  assert.deepEqual(result.otherPending.map(event=>event.id),['other-day']);assert.deepEqual(result.additional.map(event=>event.id),['same-day']);
  assert.deepEqual(result.assigned.map(member=>member.id),['user','inactive']);assert.deepEqual(result.activeMembers.map(member=>member.id),['user','other']);
});

test('Home song order, rehearsal policy and actual statistics follow the saved data',()=>{
  const result=view([event('main','2026-11-15',{songs:['b','missing','a'],confirmations:{user:true}})]);
  assert.deepEqual(result.eventSongs.map(song=>song.id),['b','a']);assert.equal(result.featured.id,'b');
  assert.deepEqual(result.stats,{songs:2,members:2,services:1,confirmed:1});
  assert.deepEqual(view([event('practice','2026-11-15',{type:'ensaio'})]).eventSongs,[]);
});

test('the month strip covers full local weeks, leap day and year boundaries',()=>{
  const leap=homeMonthDates('2028-02-29');assert.ok(leap.includes('2028-02-29'));assert.equal(leap.length%7,0);assert.equal(new Set(leap).size,leap.length);
  assert.equal(new Date(leap[0]+'T12:00:00').getDay(),1);assert.equal(new Date(leap.at(-1)+'T12:00:00').getDay(),0);
  const december=homeMonthDates('2026-12-15');assert.equal(december[0],'2026-11-30');assert.equal(december.at(-1),'2027-01-03');
});

test('vocal reminders preserve assigned categories and only appear for vocal roles',()=>{
  assert.deepEqual(homeVocalCategories({name:'Cleide',instrument:'Vocal'}),['adoração','oferta','santa ceia']);
  assert.deepEqual(homeVocalCategories({name:'Maria',role:'Vocal',vocal_category:'jubilo'}),['júbilo','oferta','santa ceia']);
  assert.deepEqual(homeVocalCategories({name:'Junior',instrument:'Teclado'}),[]);
});
