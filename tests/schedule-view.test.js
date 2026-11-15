import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleAttendance, scheduleEventState, scheduleHistoryCsv, scheduleView, scheduleWeekDates, scheduleWeekStart, shiftScheduleWeek } from '../src/lib/schedule-view.js';

const now=new Date('2026-10-24T12:00:00').getTime();
const event=(id,date,time='18:00',extra={})=>({id,date,time,label:id,type:'culto',members:['me','other'],confirmations:{me:null,other:true},...extra});

test('weekly navigation always covers Monday through Sunday across month, year and leap-day boundaries',()=>{
  assert.equal(scheduleWeekStart('2026-10-25'),'2026-10-19');assert.equal(scheduleWeekStart('2026-10-19'),'2026-10-19');
  assert.deepEqual(scheduleWeekDates('2026-12-28'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(shiftScheduleWeek('2026-12-28',1),'2027-01-04');assert.equal(shiftScheduleWeek('2027-01-04',-1),'2026-12-28');
  assert.ok(scheduleWeekDates(scheduleWeekStart('2028-02-29')).includes('2028-02-29'));
});

test('the complete week groups every event by day and time while the personal filter stays inside the same week',()=>{
  const events=[event('late','2026-10-25','20:00'),event('other-team','2026-10-20','09:00',{members:['other']}),event('early','2026-10-25','08:00'),event('practice','2026-10-24','15:00',{type:'ensaio'}),event('next','2026-10-26'),event('previous','2026-10-18')];
  const input={events,profileId:'me',today:'2026-10-24',now};
  const view=scheduleView(input);assert.equal(view.start,'2026-10-19');assert.deepEqual(view.visible.map(item=>item.id),['other-team','practice','early','late']);assert.equal(view.groups.length,7);
  assert.deepEqual(view.groups[6].events.map(item=>item.id),['early','late']);assert.equal(view.pending,3);
  assert.deepEqual(scheduleView({...input,scope:'mine'}).visible.map(item=>item.id),['practice','early','late']);
  assert.deepEqual(events.map(item=>item.id),['late','other-team','early','practice','next','previous']);
});

test('history preserves scope and chronological order, and empty weeks do not borrow upcoming events',()=>{
  const events=[event('old','2026-10-01'),event('recent','2026-10-23'),event('other','2026-10-22','19:00',{members:['other']}),event('today','2026-10-24')];
  const input={events,profileId:'me',today:'2026-10-24',now,history:true};
  assert.deepEqual(scheduleView(input).visible.map(item=>item.id),['recent','other','old']);assert.deepEqual(scheduleView({...input,scope:'mine'}).visible.map(item=>item.id),['recent','old']);
  assert.equal(scheduleView({...input,history:false,week:'2026-11-16'}).visible.length,0);
});

test('attendance only counts assigned people and live status does not invent a time for events without one',()=>{
  assert.deepEqual(scheduleAttendance({members:['a','a','b','c'],confirmations:{a:true,b:false,unknown:true}}),{total:3,confirmed:1,declined:1,pending:1});
  assert.equal(scheduleEventState(event('up','2026-10-24','15:00'),now),'upcoming');
  assert.equal(scheduleEventState(event('on','2026-10-24','11:00'),now),'ongoing');
  assert.equal(scheduleEventState(event('past','2026-10-24','09:00'),now),'past');
  assert.equal(scheduleEventState(event('missing','2026-10-24',''),now),'upcoming');
});

test('history CSV escapes quotes and formulas while preserving accurate attendance and event times',()=>{
  const csv=scheduleHistoryCsv([event('csv','2026-10-20','19:00',{label:'Culto "Especial", noite'}),event('formula','2026-10-21','20:00',{label:'=SUM(1,2)'})]);
  assert.ok(csv.startsWith('\uFEFFData,Horário'));assert.ok(csv.includes('"Culto ""Especial"", noite"'));assert.ok(csv.includes('"19:00"'));assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"1","0","1"'));
});
