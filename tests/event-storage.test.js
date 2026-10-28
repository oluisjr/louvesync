import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { encodeSequence, normalizeEvent } from '../src/lib/domain.js';
import { decodeEventPreferences, encodeEventPreferences } from '../src/lib/event-preferences.js';
import { upsertEventRecord, updateEventItems } from '../src/lib/event-storage.js';

test('real PostgREST client saves an event against a schema without optional UI columns', async () => {
  const allowed = new Set(['id', 'date', 'time', 'type', 'label', 'theme']);
  const requests = [];
  const client = createClient('https://fixture.supabase.co', 'fixture-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      assert.equal(new URL(url).pathname, '/rest/v1/events');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      requests.push(body);
      const unknown = Object.keys(body).find(key => !allowed.has(key));
      const result = unknown ? { code: 'PGRST204', message: `Could not find the '${unknown}' column of 'events' in the schema cache` } : body;
      return new Response(JSON.stringify(result), { status: unknown ? 400 : 201, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const event = { id: 'event', date: '2026-10-25', time: '18:00', type: 'culto', label: 'Domingo', theme: null, requested_songs: ['song'], santa_ceia_song: 'song', items: [], songs: ['song'], members: ['member'], confirmations: { member: true }, extra_ui_field: 'not a column' };
  const rejected = await client.from('events').upsert(event).select().single();
  assert.equal(rejected.error.code, 'PGRST204');
  assert.match(rejected.error.message, /requested_songs.*schema cache/);
  const saved = await upsertEventRecord(client, event);
  assert.equal(saved.id, 'event');
  assert.deepEqual(requests[1], { id: 'event', date: '2026-10-25', time: '18:00', type: 'culto', label: 'Domingo', theme: null });
});

function database() {
  const calls = [];
  const tables = {
    event_songs: [
      { id: 101, event_id: 'event', song_id: 'song-a', item_type: 'song', order_index: 1, singer_member_id: 'member', sequence: encodeSequence('Intro, refrão', 'Eb') },
      { id: 102, event_id: 'event', song_id: null, item_type: 'note', note_text: 'Oração inicial', order_index: 2 },
      { id: 103, event_id: 'event', song_id: 'song-b', item_type: 'song', order_index: 3, sequence: 'Verso 2x' },
    ],
    event_members: [{ event_id: 'event', member_id: 'member', confirmed: true }],
  };
  let fail = false;
  let nextId = 104;
  const client = { from(table) {
    const query = { table, operation: 'select', filters: [] };
    return {
      select() { return this; },
      eq(key, value) { query.filters.push(row => row[key] === value); return this; },
      in(key, values) { query.filters.push(row => values.includes(row[key])); return this; },
      upsert(rows) { query.operation = 'upsert'; query.rows = rows; return this; },
      insert(rows) { query.operation = 'insert'; query.rows = rows; return this; },
      delete() { query.operation = 'delete'; return this; },
      then(resolve, reject) {
        calls.push(query);
        const writing = ['upsert', 'insert'].includes(query.operation);
        if (writing && (fail === true || fail === query.operation)) return Promise.resolve({ data: null, error: new Error('write failed') }).then(resolve, reject);
        if (table === 'event_songs' && writing) {
          const invalid = query.rows.find(row => Object.hasOwn(row, 'id') && !Number.isSafeInteger(row.id));
          if (invalid) return Promise.resolve({ data: null, error: new Error(`invalid input syntax for type bigint: "${invalid.id}"`) }).then(resolve, reject);
        }
        if (query.operation === 'upsert') for (const row of query.rows) {
          const index = tables[table].findIndex(existing => existing.id === row.id);
          if (index < 0) tables[table].push(structuredClone(row));
          else tables[table][index] = { ...tables[table][index], ...structuredClone(row) };
        }
        if (query.operation === 'insert') tables[table].push(...query.rows.map(row => table === 'event_songs' ? { id: nextId++, ...structuredClone(row) } : structuredClone(row)));
        if (query.operation === 'delete') tables[table] = tables[table].filter(row => !query.filters.every(filter => filter(row)));
        return Promise.resolve({ data: structuredClone(tables[table].filter(row => query.filters.every(filter => filter(row)))), error: null }).then(resolve, reject);
      },
    };
  } };
  return { client, calls, tables, failWrites(operation = true) { fail = operation; } };
}

test('requested and Communion selections survive a database reload without optional events columns', async () => {
  const db = database();
  const before = normalizeEvent({ event_songs: db.tables.event_songs, event_members: db.tables.event_members });
  await updateEventItems(db.client, 'event', before.items, before.members, { requested_songs: ['song-b'], santa_ceia_song: 'song-a' });
  const internal = db.tables.event_songs.filter(row => decodeEventPreferences(row));
  assert.equal(internal.length, 1);
  const loaded = normalizeEvent({ event_songs: db.tables.event_songs, event_members: db.tables.event_members });
  assert.deepEqual(loaded.requested_songs, ['song-b']); assert.equal(loaded.santa_ceia_song, 'song-a');
  assert.deepEqual(loaded.songs, ['song-a', 'song-b']);
  assert.deepEqual(loaded.items.map(item => item.id), [101, 102, 103]);
  assert.equal(loaded.items[1].text, 'Oração inicial');
  assert.equal(loaded.confirmations.member, true);
  assert.equal(loaded.singerBySong['song-a'], 'member');
  assert.equal(loaded.keyBySong['song-a'], 'Eb');
  assert.equal(loaded.sequenceBySong['song-a'], 'Intro, refrão');
  // Explicitly clearing both preferences also overrides any stale legacy column.
  await updateEventItems(db.client, 'event', loaded.items, loaded.members, { requested_songs: [], santa_ceia_song: null });
  assert.equal(db.tables.event_songs.find(row => decodeEventPreferences(row)).id, internal[0].id);
  const cleared = normalizeEvent({ requested_songs: ['old-value'], santa_ceia_song: 'old-value', event_songs: db.tables.event_songs });
  assert.deepEqual(cleared.requested_songs, []); assert.equal(cleared.santa_ceia_song, null);
});

test('the PostgREST wire contract lets the database allocate bigint IDs for all new items', async () => {
  const db = database();
  const posts = [];
  const client = createClient('https://fixture.supabase.co', 'fixture-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      const endpoint = new URL(url);
      const table = endpoint.pathname.split('/').at(-1);
      const operation = options.method === 'GET' ? 'select' : options.method === 'DELETE' ? 'delete' : new Headers(options.headers).get('Prefer')?.includes('resolution=merge-duplicates') ? 'upsert' : 'insert';
      let query = db.client.from(table);
      if (operation === 'select') query = query.select('*');
      else if (operation === 'delete') query = query.delete();
      else {
        const body = JSON.parse(options.body);
        posts.push({ table, operation, body, columns: endpoint.searchParams.get('columns') });
        query = query[operation](body);
      }
      for (const [key, value] of endpoint.searchParams) {
        if (value.startsWith('eq.')) query = query.eq(key, value.slice(3));
        if (key === 'id' && value.startsWith('in.')) query = query.in(key, value.slice(4, -1).split(',').map(Number));
      }
      const { data, error } = await query;
      return new Response(JSON.stringify(error ? { code: '22P02', message: error.message } : data), { status: error ? 400 : 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const before = normalizeEvent({ event_songs: db.tables.event_songs, event_members: db.tables.event_members });
  // UI/offline IDs must never be reused as database primary keys.
  const localNoteId = 'e4b0e327-a19e-4a52-98ac-7df4bb7294dc';
  const items = [before.items[2], before.items[0], before.items[1], { id: localNoteId, type: 'note', text: 'Avisos finais' }, { id: 'song_song-c_4', type: 'song', song_id: 'song-c' }];
  const preferences = { requested_songs: ['song-c'], santa_ceia_song: 'song-a' };
  await updateEventItems(client, 'event', items, ['member', 'new-member'], preferences);
  const loaded = normalizeEvent({ event_songs: db.tables.event_songs, event_members: db.tables.event_members });
  assert.deepEqual(loaded.items.map(item => item.id), [103, 101, 102, 104, 105]);
  assert.deepEqual(loaded.songs, ['song-b', 'song-a', 'song-c']);
  assert.equal(loaded.items[3].text, 'Avisos finais');
  assert.equal(loaded.confirmations.member, true);
  assert.equal(loaded.confirmations['new-member'], null);
  assert.equal(loaded.singerBySong['song-a'], 'member');
  assert.equal(loaded.keyBySong['song-a'], 'Eb');
  assert.equal(loaded.sequenceBySong['song-a'], 'Intro, refrão');
  assert.deepEqual(loaded.requested_songs, ['song-c']);
  assert.equal(loaded.santa_ceia_song, 'song-a');
  const insert = posts.find(request => request.table === 'event_songs' && request.operation === 'insert');
  assert.equal(insert.body.length, 3);
  assert.equal(insert.body.every(row => !Object.hasOwn(row, 'id')), true);
  assert.equal(insert.columns.includes('"id"'), false);
  assert.equal(db.tables.event_songs.every(row => Number.isSafeInteger(row.id)), true);
  const ids = db.tables.event_songs.map(row => row.id);
  await updateEventItems(client, 'event', loaded.items.slice(1), loaded.members, { requested_songs: [], santa_ceia_song: null });
  assert.deepEqual(db.tables.event_songs.map(row => row.id), ids.filter(id => id !== 103));
  assert.equal(db.tables.event_songs.filter(row => decodeEventPreferences(row)).length, 1);
  assert.deepEqual(normalizeEvent({ event_songs: db.tables.event_songs }).requested_songs, []);
});

test('an older caller preserves internal preferences, and a failed write leaves the old setlist untouched', async () => {
  const db = database();
  const initial = normalizeEvent({ event_songs: db.tables.event_songs, event_members: db.tables.event_members });
  await updateEventItems(db.client, 'event', initial.items, initial.members, { requested_songs: ['song-a'], santa_ceia_song: 'song-b' });
  await updateEventItems(db.client, 'event', [...initial.items].reverse(), initial.members);
  const old = structuredClone(db.tables);
  db.failWrites();
  const start = db.calls.length;
  await assert.rejects(updateEventItems(db.client, 'event', [], [], { requested_songs: [], santa_ceia_song: null }), /write failed/);
  assert.deepEqual(db.tables, old);
  assert.equal(db.calls.slice(start).some(call => call.operation === 'delete'), false);
  assert.deepEqual(normalizeEvent({ event_songs: db.tables.event_songs }).requested_songs, ['song-a']);
});

test('a new event and an offline-style replay use generated keys without duplicating songs or preferences', async () => {
  const db = database();
  db.tables.event_songs = [];
  db.tables.event_members = [];
  const items = [{ id: 'song_song-a_0', type: 'song', song_id: 'song-a', singer_id: 'member' }];
  const preferences = { requested_songs: ['song-a'], santa_ceia_song: null };
  await updateEventItems(db.client, 'event', items, ['member'], preferences);
  const ids = db.tables.event_songs.map(row => row.id);
  assert.equal(ids.length, 2);
  assert.equal(ids.every(Number.isSafeInteger), true);
  assert.equal(db.calls.some(call => call.operation === 'upsert'), false);
  assert.equal(normalizeEvent({ event_members: db.tables.event_members }).confirmations.member, null);
  await updateEventItems(db.client, 'event', items, ['member'], preferences);
  assert.deepEqual(db.tables.event_songs.map(row => row.id), ids);
  assert.equal(db.tables.event_members.length, 1);
});

test('a failed insert never deletes existing songs, notes or participants', async () => {
  const db = database();
  const before = structuredClone(db.tables);
  db.failWrites('insert');
  await assert.rejects(updateEventItems(db.client, 'event', [{ type: 'song', song_id: 'song-c' }], [], {}), /write failed/);
  assert.deepEqual(db.tables, before);
  assert.equal(db.calls.some(call => call.operation === 'delete'), false);
});

test('legacy preferences and ordinary notes remain readable; malformed metadata is not hidden', () => {
  const legacy = normalizeEvent({ requested_songs: ['song-a'], santa_ceia_song: 'song-b', event_songs: [
    { id: 'note', item_type: 'note', note_text: 'louvesync:event-preferences:v1:invalid-json', order_index: 1 },
  ] });
  assert.deepEqual(legacy.requested_songs, ['song-a']); assert.equal(legacy.santa_ceia_song, 'song-b');
  assert.equal(legacy.items[0].text, 'louvesync:event-preferences:v1:invalid-json');
  const empty = normalizeEvent({ event_songs: [{ id: 'meta', item_type: 'note', note_text: encodeEventPreferences({ requested_songs: [], santa_ceia_song: null }) }] });
  assert.deepEqual(empty.items, []); assert.deepEqual(empty.songs, []);
});
