import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { setlistExportRows, setlistWhatsAppText, setlistWorkbook } from '../src/lib/setlist-export.js';

const songs = [
  { id: 'praise', title: 'Grande é o Senhor', cat: 'jubilo', artist: 'Artista da gravação', key: 'G', vocal_keys: { ana: 'A' } },
  { id: 'worship', title: 'Bondade de Deus', cat: 'adoracao', artist: 'Outro artista', key: 'D' },
  { id: 'offering', title: 'Minha Oferta', cat: 'oferta', artist: 'Terceiro artista', key: 'C' },
];
const members = [{ id: 'ana', name: 'Ana Martins' }];
const event = {
  label: 'Culto de Domingo', date: '2026-10-25', time: '18:00:00', theme: 'Gratidão',
  songs: ['praise', 'worship', 'offering'],
  items: [{ type: 'song', song_id: 'offering', singer_id: 'ana' }, { type: 'note', text: 'Oração' }, { type: 'song', song_id: 'praise' }, { type: 'song', song_id: 'worship' }, { type: 'song', song_id: 'deleted' }],
  singerBySong: { offering: null, praise: 'ana', worship: 'deleted-member' }, keyBySong: { praise: 'Bb' },
};

test('exports preserve the event sequence and use assigned vocalists and event keys', () => {
  const rows = setlistExportRows(event, songs, members);
  assert.deepEqual(rows, [
    { category: 'Ofertas', title: 'Minha Oferta', vocalist: 'Vocalista não definido', key: 'C' },
    { category: 'Júbilo', title: 'Grande é o Senhor', vocalist: 'Ana Martins', key: 'Bb' },
    { category: 'Adoração', title: 'Bondade de Deus', vocalist: 'Vocalista não definido', key: 'D' },
  ]);
  const fallback = setlistExportRows({ songs: ['praise'], singerBySong: { praise: 'ana' } }, songs, members);
  assert.equal(fallback[0].key, 'A');
  assert.equal(setlistExportRows({ items: [{ type: 'song', song_id: 'praise', singer_id: 'ana' }] }, songs, members)[0].vocalist, 'Ana Martins');
});

test('WhatsApp uses category prefixes and ministry vocalists instead of numbering and recording artists', () => {
  const text = setlistWhatsAppText(event, songs, members);
  assert.ok(text.includes('*Ofertas:* Minha Oferta — Vocalista não definido · Tom: C'));
  assert.ok(text.includes('*Júbilo:* Grande é o Senhor — Ana Martins · Tom: Bb'));
  assert.ok(text.includes('25/10/2026 · 18:00'));
  assert.ok(text.indexOf('*Ofertas:*') < text.indexOf('*Júbilo:*'));
  assert.doesNotMatch(text, /Artista da gravação|Outro artista|Terceiro artista|^\d+\./m);
});

test('Excel is an OOXML ZIP with text cells, accented categories and no formulas', () => {
  const unsafe = { ...songs[0], title: '=HYPERLINK("https://example.com","á & <teste>")\u0001' };
  const bytes = setlistWorkbook(event, [unsafe, ...songs.slice(1)], members);
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
  const parts = unzipSync(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(parts[name], name);
  const worksheet = strFromU8(parts['xl/worksheets/sheet1.xml']);
  assert.match(worksheet, /Categoria/);assert.match(worksheet, /Música/);assert.match(worksheet, /Vocalista/);
  assert.match(worksheet, /Ofertas:/);assert.match(worksheet, /Júbilo:/);assert.match(worksheet, /Adoração:/);
  assert.match(worksheet, /Ana Martins/);assert.match(worksheet, /&amp; &lt;teste&gt;/);
  assert.doesNotMatch(worksheet, /<f[ >]|Artista da gravação|Outro artista|Terceiro artista/);
  assert.ok(!worksheet.includes(String.fromCharCode(1)));
  assert.match(worksheet, /t="inlineStr"[^>]*><is><t[^>]*>=HYPERLINK/);
});
