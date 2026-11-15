import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRehearsalEvent, rehearsalEvents, withoutRehearsalSongs } from '../src/lib/rehearsal-events.js';
import { normalizeEvent } from '../src/lib/domain.js';
import { updateEventItems } from '../src/lib/event-storage.js';

test('the studio uses services and other events with songs, never a duplicated rehearsal setlist', () => {
  const events = [
    { id: 'rehearsal', date: '2026-10-24', type: 'ensaio', songs: ['legacy-copy'] },
    { id: 'custom', date: '2026-10-25', time: '20:00', type: 'outro', songs: ['song'] },
    { id: 'empty-custom', date: '2026-10-25', type: 'outro', songs: [] },
    { id: 'service', date: '2026-10-25', time: '18:00', type: 'culto', songs: ['song'] },
    { id: 'empty-service', date: '2026-10-24', type: 'culto', songs: [] },
    { id: 'ebd', date: '2026-10-26', type: 'ebd', songs: ['song'] },
  ];
  const choices = rehearsalEvents(events);
  assert.deepEqual(choices.map(event => event.id), ['empty-service', 'service', 'custom', 'ebd']);
  assert.equal(defaultRehearsalEvent(choices, '2026-10-24').id, 'service');
  assert.equal(defaultRehearsalEvent(choices, '2026-10-27').id, 'ebd');
  assert.equal(defaultRehearsalEvent(choices.slice(0, 1), '2026-10-24').id, 'empty-service');
  assert.equal(defaultRehearsalEvent([], '2026-10-24'), undefined);
  assert.equal(events[0].id, 'rehearsal');
});

test('legacy rehearsal music is hidden while notes, assigned members and confirmations survive', () => {
  const raw = { id: 'rehearsal', type: 'ensaio', requested_songs: ['song'], santa_ceia_song: 'song',
    event_songs: [{ id: 1, song_id: 'song', item_type: 'song', singer_member_id: 'member', sequence: 'Intro' }, { id: 2, item_type: 'note', note_text: 'Chegar às 15h' }],
    event_members: [{ member_id: 'member', confirmed: true }] };
  const event = normalizeEvent(raw);
  assert.deepEqual(event.songs, []);
  assert.deepEqual(event.items.map(item => item.text), ['Chegar às 15h']);
  assert.deepEqual(event.members, ['member']);
  assert.deepEqual(event.confirmations, { member: true });
  for (const key of ['singerBySong', 'sequenceBySong', 'keyBySong']) assert.deepEqual(event[key], {});
  assert.deepEqual(event.requested_songs, []);
  assert.equal(event.santa_ceia_song, null);
  assert.equal(raw.event_songs[0].song_id, 'song');
  assert.deepEqual(withoutRehearsalSongs({ ...event, songs: ['queued-song'], items: [{ type: 'song', song_id: 'queued-song' }] }).items, []);
});

test('saving a legacy rehearsal removes only its song relationships and preserves confirmed participants', async () => {
  const calls = [];
  const client = { from(table) {
    const query = { table, op: 'select' };
    return { select() { return this; }, eq() { return this; }, in(key, values) { query.ids = values; return this; },
      upsert(rows) { query.op = 'upsert'; query.rows = rows; return this; }, insert(rows) { query.op = 'insert'; query.rows = rows; return this; }, delete() { query.op = 'delete'; return this; },
      then(resolve) { calls.push(query); return Promise.resolve({ error: null, data: table === 'event_songs' ? [{ id: 1, song_id: 'song' }, { id: 2, item_type: 'note', note_text: 'Chegar às 15h' }] : [{ member_id: 'member', confirmed: true }] }).then(resolve); } };
  } };
  const event = withoutRehearsalSongs({ type: 'ensaio', items: [{ id: 1, type: 'song', song_id: 'song' }, { id: 2, type: 'note', text: 'Chegar às 15h' }], members: ['member'] });
  await updateEventItems(client, 'rehearsal', event.items, event.members, event);
  assert.deepEqual(calls.filter(call => call.op === 'delete'), [{ table: 'event_songs', op: 'delete', ids: [1] }]);
  assert.equal(calls.some(call => call.table === 'event_members' && call.op !== 'select'), false);
});
