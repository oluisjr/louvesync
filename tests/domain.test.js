import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, transposeKey, keyDistance, encodeSequence, decodeSequence, normalizeEvent, eventPayload, timerSeconds, escapeHtml } from '../src/lib/domain.js';
import { updateEventItems } from '../src/lib/event-storage.js';
import { sourceUrl } from '../server/source-url.js';

test('today follows local calendar instead of the UTC day', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/Sao_Paulo';
  assert.equal(localDate(new Date('2026-10-25T01:00:00Z')), '2026-10-24');
  if (previous) process.env.TZ = previous; else delete process.env.TZ;
});
test('key transposition preserves flats and minor qualities', () => {
  assert.equal(transposeKey('Bbm', 2), 'Cm'); assert.equal(transposeKey('F#m', -2), 'Em');
  assert.equal(keyDistance('Bb', 'C'), 2); assert.equal(keyDistance('Am', 'Cm'), 3);
});
test('event keys and sequence roundtrip using the existing text column', () => {
  const value = encodeSequence('Intro, coro 2x', 'Eb');
  assert.deepEqual(decodeSequence(value), { text: 'Intro, coro 2x', key: 'Eb' });
  assert.deepEqual(decodeSequence('Intro'), { text: 'Intro', key: null });
  const event = normalizeEvent({ id: 'event', requested_songs: ['song'], event_songs: [{ id: 'item', song_id: 'song', sequence: value, order_index: 1 }], event_members: [{ member_id: 'user', confirmed: true }] });
  assert.equal(event.keyBySong.song, 'Eb'); assert.equal(event.confirmations.user, true);
  assert.deepEqual(eventPayload(event).requested_songs, ['song']); assert.equal(eventPayload(event).items, undefined);
});
test('shared timer accounts for joining late and tab suspension', () => {
  assert.equal(timerSeconds({ active: true, seconds: 15, startedAt: 1000 }, 61000), 75);
  assert.equal(timerSeconds({ active: false, seconds: 15 }, 61000), 15);
});
test('public HTML escapes text and proxy rejects private destinations', () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  for (const url of ['http://www.cifraclub.com.br/song', 'https://127.0.0.1/', 'https://www.cifraclub.com.br.evil.test/', 'https://user:pass@www.cifraclub.com.br/']) assert.throws(() => sourceUrl(url));
  assert.equal(sourceUrl('https://www.cifraclub.com.br/song/'), 'https://www.cifraclub.com.br/song/');
});
function database({ fail = false } = {}) {
  const calls = [];
  const tables = { event_songs: [{ id: 'existing-song-row', song_id: 'song', sequence: 'Intro', singer_member_id: 'singer' }], event_members: [{ member_id: 'member', confirmed: true }] };
  const client = { from(table) {
    const query = { operation: 'select', table };
    const chain = { select() { return this; }, eq() { return this; }, in() { return this; }, upsert(rows) { query.operation = 'upsert'; query.rows = rows; return this; }, insert(rows) { query.operation = 'insert'; query.rows = rows; return this; }, delete() { query.operation = 'delete'; return this; }, then(resolve, reject) { calls.push(query); return Promise.resolve({ data: tables[table], error: fail && query.operation === 'upsert' ? new Error('write failed') : null }).then(resolve, reject); } };
    return chain;
  } };
  return { client, calls };
}
test('editing an event preserves participant confirmations and stable song rows', async () => {
  const { client, calls } = database();
  await updateEventItems(client, 'event', [{ type: 'song', song_id: 'song', singer_id: null }], ['member', 'new-member']);
  assert.equal(calls.find(call => call.operation === 'upsert').rows[0].id, 'existing-song-row');
  assert.equal(calls.find(call => call.operation === 'upsert').rows[0].sequence, 'Intro');
  assert.equal(calls.find(call => call.operation === 'upsert').rows[0].singer_member_id, null);
  assert.deepEqual(calls.find(call => call.operation === 'insert').rows, [{ event_id: 'event', member_id: 'new-member', confirmed: null }]);
  assert.equal(calls.some(call => call.operation === 'delete'), false);
});
test('a failed write never starts deleting the previous setlist or participants', async () => {
  const { client, calls } = database({ fail: true });
  await assert.rejects(updateEventItems(client, 'event', [{ type: 'song', song_id: 'other' }], []), /write failed/);
  assert.equal(calls.some(call => call.operation === 'delete'), false);
});
