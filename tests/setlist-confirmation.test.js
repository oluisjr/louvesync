import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../src/lib/domain.js';
import { decodeEventPreferences, encodeEventPreferences } from '../src/lib/event-preferences.js';
import { isSetlistConfirmed, setlistSnapshot } from '../src/lib/setlist-confirmation.js';
import { withSongChart } from '../src/lib/song-charts.js';

const songs = [{ id: 'a', key: 'C', vocal_keys: { ana: 'D' }, bpm: 80, time_signature: '4/4' }, { id: 'b', key: 'G' }];
const event = { id: 'service', type: 'culto', songs: ['a', 'b'], items: [{ type: 'song', song_id: 'a' }, { type: 'note', text: 'Oração' }, { type: 'song', song_id: 'b' }], singerBySong: { a: 'ana' }, keyBySong: {}, sequenceBySong: { a: 'Intro' } };
const approved = () => ({ ...structuredClone(event), setlist_confirmation: { version: 1, snapshot: setlistSnapshot(event, songs), confirmed_by: 'admin', confirmed_at: '2026-11-15T12:00:00Z' } });

test('legacy and automatic repertoires stay unconfirmed until a valid explicit approval', () => {
  assert.equal(isSetlistConfirmed(event, songs), false);
  const old = { item_type: 'note', note_text: 'louvesync:event-preferences:v1:{"requested_songs":[],"santa_ceia_song":null}' };
  assert.equal(decodeEventPreferences(old).setlist_confirmation, null);
  for (const value of [true, {}, { ...approved().setlist_confirmation, confirmed_at: 'bad' }, { ...approved().setlist_confirmation, confirmed_by: '' }]) assert.equal(isSetlistConfirmed({ ...event, setlist_confirmation: value }, songs), false);
  assert.equal(isSetlistConfirmed(approved(), songs), true);
  assert.equal(isSetlistConfirmed(approved(), new Map(songs.map(song => [song.id, song]))), true);
});

test('the approved version includes song order, notes, vocalist, effective key and arrangement', () => {
  const mutations = [
    value => value.items.reverse(),
    value => value.items.pop(),
    value => { value.items[1].text = 'Outra oração'; },
    value => { value.singerBySong.a = 'bia'; },
    value => { value.keyBySong.a = 'Eb'; },
    value => { value.sequenceBySong.a = 'Refrão 2x'; },
    value => { value.id = 'copied-event'; },
  ];
  for (const change of mutations) { const changed = approved(); change(changed); assert.equal(isSetlistConfirmed(changed, songs), false); }
  for (const patch of [{ vocal_keys: { ana: 'E' } }, { bpm: 90 }, { time_signature: '6/8' }]) assert.equal(isSetlistConfirmed(approved(), [{ ...songs[0], ...patch }, songs[1]]), false);
  assert.equal(isSetlistConfirmed({ ...approved(), date: '2026-11-20', members: ['new-member'], confirmations: { ana: true }, theme: 'Novo tema' }, songs), true);
});

test('missing music, empty sets and rehearsals cannot acquire a confirmed status', () => {
  assert.equal(isSetlistConfirmed(approved(), songs.slice(1)), false);
  assert.equal(setlistSnapshot({ ...event, songs: [], items: [{ type: 'note', text: 'Só oração' }] }, songs), null);
  assert.equal(setlistSnapshot({ ...event, type: 'ensaio' }, songs), null);
  assert.equal(isSetlistConfirmed({ ...approved(), type: 'ensaio' }, songs), false);
});

test('catalog records and the supplied chart enrichment produce the same approval version', () => {
  const raw = { id: 'chart-song', title: 'Deus que sara', lyrics: '', key: null };
  const selected = { id: 'service', type: 'culto', songs: [raw.id] };
  assert.notEqual(withSongChart(raw).key, raw.key);
  assert.equal(setlistSnapshot(selected, [raw]), setlistSnapshot(selected, [withSongChart(raw)]));
});

test('confirmation metadata round-trips without leaking into the public repertoire or attendance', () => {
  const value = approved();
  const encoded = encodeEventPreferences({ ...value, requested_songs: ['a'], santa_ceia_song: 'b' });
  const loaded = normalizeEvent({ id: event.id, type: 'culto', event_songs: [
    { id: 2, item_type: 'note', song_id: null, note_text: encoded, order_index: 4 },
    { id: 1, song_id: 'a', item_type: 'song', singer_member_id: 'ana', order_index: 1, sequence: 'Intro' },
    { id: 3, item_type: 'note', note_text: 'Oração', order_index: 2 },
    { id: 4, song_id: 'b', item_type: 'song', order_index: 3 },
  ], event_members: [{ member_id: 'ana', confirmed: false }] });
  assert.equal(isSetlistConfirmed(loaded, songs), true);
  assert.deepEqual(loaded.songs, ['a', 'b']); assert.equal(loaded.items.length, 3);
  assert.deepEqual(loaded.requested_songs, ['a']); assert.equal(loaded.santa_ceia_song, 'b');
  assert.equal(loaded.confirmations.ana, false);
});
