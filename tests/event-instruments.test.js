import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentGroups, assignedInstrument, chooseInstrument } from '../src/lib/event-instruments.js';
import { eventFingerprint } from '../src/lib/offline-conflicts.js';

const members=[
  {id:'a',name:'Aragão',instrument:'Violão',status:'ativo'},
  {id:'d',name:'Darci',instrument:'Violão',status:'ativo'},
  {id:'j',name:'Junior',instrument:'Teclado / Vocal',status:'ativo'},
  {id:'k',name:'Tecladista',instrument:'Piano',status:'ativo'},
  {id:'b',name:'Baterista',instrument:'Bateria',status:'ativo',unavailableDays:[0]},
  {id:'s',name:'Samuel',instrument:'Bateria',status:'ativo'},
];
const event={id:'event',date:'2026-11-22',members:['a','d','j','b'],singerBySong:{song:'j'}};

test('duplicate instrument choices retain legacy rosters until leadership explicitly picks a musician',()=>{
  const group=instrumentGroups(members).find(group=>group.id==='guitar');
  assert.equal(assignedInstrument(event,group),'__multiple__');
  const choice=chooseInstrument(event,members,'guitar','d');
  assert.deepEqual(choice.roster,['d','j','b']);
  assert.deepEqual(choice.assignments,{guitar:'d'});
  assert.equal(assignedInstrument({...event,members:choice.roster,instrument_assignments:choice.assignments},group),'d');
  assert.deepEqual(event.members,['a','d','j','b']);
});

test('changing an instrumental seat preserves a lead vocal and rejects unavailable new musicians',()=>{
  const keyboard=chooseInstrument(event,members,'keys','k');
  assert.deepEqual(keyboard.roster,['a','d','j','b','k']);
  assert.throws(()=>chooseInstrument({...event,members:['a','j','s']},members,'drums','b'),/Indisponível/);
  assert.throws(()=>chooseInstrument(event,members,'guitar','j'),/integrante deste instrumento/);
  assert.equal(instrumentGroups([...members,{id:'visitor',access_type:'church_member',instrument:'Violão'}]).find(group=>group.id==='guitar').members.length,2);
});

test('offline conflict checks detect changed instrumental seats even when a multi-role roster is unchanged',()=>{
  const first={...event,instrument_assignments:{keys:'j',guitar:'d'}};
  const ordered={...event,instrument_assignments:{guitar:'d',keys:'j'}};
  assert.equal(eventFingerprint(first),eventFingerprint(ordered));
  assert.notEqual(eventFingerprint(first),eventFingerprint({...first,instrument_assignments:{keys:'k',guitar:'d'}}));
  assert.equal(eventFingerprint(event),eventFingerprint({...event,instrument_assignments:{}}));
});
