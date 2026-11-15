import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentArtwork, equipmentStatusTone, equipmentSummary } from '../src/lib/equipment-view.js';

test('inventory summary reflects saved status changes and empty inventories', () => {
  const equipment = [{status:'Disponível'}, {status:'Disponível'}, {status:'Em uso'}, {status:'Manutenção'}];
  assert.deepEqual(equipmentSummary(equipment), {total:4,available:2,inUse:1,maintenance:1});
  equipment[0] = {...equipment[0],status:'Manutenção'};
  assert.deepEqual(equipmentSummary(equipment), {total:4,available:1,inUse:1,maintenance:2});
  assert.deepEqual(equipmentSummary([]), {total:0,available:0,inUse:0,maintenance:0});
  assert.equal(equipmentStatusTone('Disponível'),'available');
  assert.equal(equipmentStatusTone('Em uso'),'in-use');
  assert.equal(equipmentStatusTone('Manutenção'),'maintenance');
  assert.equal(equipmentStatusTone('Desconhecido'),'unknown');
});

test('equipment artwork recognizes instruments without inventing a photo for accessories or unknown items', () => {
  for (const name of ['Microfone sem fio','SHURE SM58']) assert.equal(equipmentArtwork({name}),'/images/equipment/microphone.webp');
  for (const name of ['Teclado de palco','Piano digital']) assert.equal(equipmentArtwork({name}),'/images/equipment/keyboard.webp');
  assert.equal(equipmentArtwork({name:'VIOLÃO eletroacústico'}),'/images/equipment/guitar.webp');
  for(const [asset,names] of Object.entries({bass:['Baixo elétrico','Contrabaixo','Jazz Bass'],saxophone:['Sax tenor','Saxofone alto'],flute:['Flauta transversal','Concert flute'],cavaquinho:['Cavaquinho','Cavaco'],ukulele:['Ukulele','Ukelele']}))for(const name of names)assert.equal(equipmentArtwork({name}),`/images/equipment/${asset}.webp`);
  for (const name of ['Cabo de microfone','Suporte de violão','Capa de ukulele','Case de saxofone','Flauta doce','Mesa de som UI24R','']) assert.equal(equipmentArtwork({name}),'/images/more/equipment.webp');
});
