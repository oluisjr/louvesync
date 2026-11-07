import test from 'node:test';
import assert from 'node:assert/strict';
import charts from '../src/data/pdf-charts.js';
import { degreeChord, performanceKey, renderChordText, transposeChord } from '../src/lib/chords.js';
import { findSongChart, withSongChart } from '../src/lib/song-charts.js';

test('the same numeric chart follows vocalists in B and A, including inversions', () => {
  const lyrics = '[1]Um [6m7]novo [4/6]cântico [5/7]a Ti';
  const song = { id: 'song', key: 'C', lyrics, vocal_keys: { first: 'B', second: 'A' } };
  const event = { singerBySong: { song: 'first' } };
  const original = structuredClone(song);
  assert.equal(renderChordText(lyrics, performanceKey(song,event)), '[B]Um [G#m7]novo [E/G#]cântico [F#/A#]a Ti');
  event.singerBySong.song = 'second';
  assert.equal(renderChordText(lyrics, performanceKey(song,event)), '[A]Um [F#m7]novo [D/F#]cântico [E/G#]a Ti');
  assert.deepEqual(song, original);
  assert.equal(performanceKey(song,{...event,keyBySong:{song:'Bb'}}),'Bb');
});

test('degrees preserve alterations, chord quality, bass, and enharmonic notes', () => {
  assert.equal(degreeChord('b7/2','A'), 'G/B');
  assert.equal(degreeChord('7b','A'), 'G');
  assert.equal(degreeChord('#4º','C'), 'F#º');
  assert.equal(degreeChord('5#°','G'), 'D#°');
  assert.equal(degreeChord('6m(7M)','C'), 'Am(7M)');
  assert.equal(degreeChord('4M7','B'), 'EM7');
  assert.equal(degreeChord('7','F#'), 'E#');
  assert.equal(renderChordText('[7]Final','F#',3), '[G#]Final');
  assert.equal(transposeChord('Bb7M/D',2), 'C7M/E');
  assert.equal(renderChordText('[Bridge]\n[C6/9]Uma ponte','C',2), '[Bridge]\n[D6/9]Uma ponte');
  assert.equal(renderChordText('{key: G}\n[1] [4/6] [5/7]','Bb'), '[Bb] [Eb/G] [F/A]');
});

test('source modulations follow the selected vocalist and do not leak key directives into display/PDF', () => {
  const chart = findSongChart({title:'Eu Te Louvarei'}).versions[0];
  const rendered = renderChordText(chart.lyrics, 'B');
  assert.match(rendered, /INTRO - EM B\n\[B\] \[F#\] \[G#m7\] \[E\]/);
  assert.match(rendered, /REFRÃO - MODULA PARA C#\n\[C#\]/);
  assert.match(rendered, /PONTE - VOLTA PARA B\n\[B\]/);
  assert.match(rendered, /REFRÃO FINAL - MODULA PARA D#\n\[D#\]/);
  assert.doesNotMatch(rendered, /\{key:|\[[#b]?[1-7]/);
  const sete = findSongChart({title:'Sete vezes mais'}).versions[0];
  assert.match(renderChordText(sete.lyrics,'A'), /REFRÃO\n\[C7M\]/);
});

test('21 complete songs and 24 arrangements retain all supplied sources, verses and continuations', () => {
  assert.equal(charts.length,21);
  assert.equal(charts.reduce((sum,chart)=>sum+chart.versions.length,0),24);
  assert.equal(new Set(charts.flatMap(chart=>chart.versions.map(version=>version.source))).size,5);
  for(const chart of charts)for(const version of chart.versions){
    assert.ok(version.lyrics.length>80 && (version.lyrics.match(/\[/g)||[]).length>=5,chart.title);
    assert.ok(version.pages.length>0,chart.title);
    const rendered=renderChordText(version.lyrics,'B');
    assert.doesNotMatch(rendered,/\[[#b]?[1-7]/,chart.title);
    assert.doesNotMatch(rendered,/undefined|NaN|\{key:/,chart.title);
  }
  const text=title=>findSongChart({title}).versions[0].lyrics.replace(/\[[^\]]+\]/g,'');
  assert.match(text('Se Cristo comigo vai'), /Será a minha sorte a dura cruz levar/);
  assert.match(text('A Face Adorada'), /Se entre as ondas estou sem luz, quase a perecer/);
  assert.match(text('Vim para adorar-Te'), /Tão maravilhoso para mim/);
  assert.match(text('Celebrai com júbilo ao Senhor'), /Amém!/);
});

test('chart matching handles known catalog spellings and preserves authored charts and all record identities', () => {
  assert.equal(findSongChart({title:' A TUA GLÓRIA '}).title,'Tua Glória');
  assert.equal(findSongChart({title:'Autoridade de Poder'}).title,'Autoridade e Poder');
  assert.equal(findSongChart({title:'Celebrarei'}),null);
  const song={id:'original',title:'Tua Unção',key:'A',lyrics:'Letra sem acordes',cat:'adoracao',vocal_keys:{vocal:'B'}};
  const prepared=withSongChart(song);
  assert.equal(prepared.id,song.id);
  assert.equal(prepared.key,'A');
  assert.equal(prepared.vocal_keys,song.vocal_keys);
  assert.match(prepared.lyrics,/\[6m\]/);
  assert.equal(song.lyrics,'Letra sem acordes');
  const edited={...song,lyrics:'[1]Minha versão [5]manual'};
  assert.equal(withSongChart(edited),edited);
  assert.match(withSongChart({...song,lyrics:'[Coro]\nLetra anterior'}).lyrics,/\[6m\]/);
  const unrelated={...song,title:'Outra música'};
  assert.equal(withSongChart(unrelated),unrelated);
});
