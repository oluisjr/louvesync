import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createActivityHandler, activityPayload } from '../server/activity.js';
import { createViewRecorder, activityRequest } from '../src/lib/activity-client.js';

const sessionId = '11111111-1111-4111-8111-111111111111';
const credentials = { memberId: 'member-test', pin: 'fixture-private-pin' };
const view = { action: 'view', targetType: 'event', targetId: 'event-test', viewId: sessionId, viewedAt: '2026-11-08T12:00:00Z' };
const connection = { url: 'https://app-project.supabase.co', anonKey: 'fixture-public-key' };
const acknowledgement = { ok: true, serverTime: '2026-11-13T12:00:00Z' };
const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
class Storage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index]; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('activity payload validates observation/session IDs and strips client-side privilege flags', () => {
  assert.deepEqual(activityPayload({ ...credentials, action: 'online', is_admin: true }), { ...credentials, action: 'online' });
  assert.equal(activityPayload({ ...credentials, ...view, viewedAt: 'yesterday' }), null);
  assert.equal(activityPayload({ ...credentials, ...view, targetType: 'members' }), null);
  assert.equal(activityPayload({ ...credentials, action: 'heartbeat', sessionId }), null);
  assert.deepEqual(activityPayload({ ...credentials, action: 'heartbeat', sessionId, version: 2 }), { ...credentials, action: 'heartbeat', sessionId, version: 2 });
});

test('activity API delegates existing-PIN authorization to the database and reports setup/failure without leaking credentials', async () => {
  const before = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'; process.env.SUPABASE_ANON_KEY = 'fixture-anon';
  try {
    let received, result = { data: { viewers: [], serverTime: '2026-11-08T12:00:00Z' }, error: null };
    const handler = createActivityHandler(() => ({ rpc: (name, args) => { received = { name, args }; return { abortSignal: async () => result }; } }));
    const request = { method: 'POST', headers: { host: 'louvesync.vercel.app', origin: 'https://louvesync.vercel.app' }, body: { ...credentials, action: 'viewers', targetType: 'event', targetId: 'event-test', is_admin: true } };
    const valid = response(); await handler(request, valid);
    assert.equal(valid.code, 200); assert.equal(received.name, 'louvesync_activity');
    assert.equal(Object.hasOwn(received.args.p_payload, 'is_admin'), false);
    assert.match(valid.headers['Cache-Control'], /no-store/);
    for (const [code, status] of [['28000', 401], ['42501', 403], ['PGRST202', 503], ['42P01', 503], ['P0002', 404], ['22P02', 400]]) {
      result = { data: null, error: { code, message: credentials.pin } };
      const res = response(); await handler(request, res);
      assert.equal(res.code, status); assert.ok(!JSON.stringify(res.body).includes(credentials.pin));
    }
    const external = response(); await handler({ ...request, headers: { ...request.headers, origin: 'https://other.test' } }, external); assert.equal(external.code, 403);
    const get = response(); await handler({ ...request, method: 'GET' }, get); assert.equal(get.code, 405);
  } finally {
    for (const [name, value] of [['SUPABASE_URL', before.url], ['SUPABASE_ANON_KEY', before.key]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('activity distinguishes Supabase gateway credentials from PIN authorization and SQL failures without returning secret details', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fixture-public-key';
  try {
    for (const [status, upstreamCode, expectedStatus, expectedCode] of [
      [401, null, 503, 'ACTIVITY_SUPABASE_AUTH'],
      [403, null, 503, 'ACTIVITY_SUPABASE_AUTH'],
      [401, 'PGRST301', 503, 'ACTIVITY_SUPABASE_AUTH'],
      [404, 'PGRST125', 503, 'ACTIVITY_URL_INVALID'],
      [401, '28000', 401, null],
      [403, '42501', 403, null],
      [400, '42703', 503, 'ACTIVITY_DATABASE_ERROR'],
      [500, '42702', 503, 'ACTIVITY_DATABASE_ERROR'],
      [500, 'invalid-secret-diagnostic', 503, 'ACTIVITY_DATABASE_ERROR'],
    ]) {
      const handler = createActivityHandler((url, key, options) => createClient(url, key, {
        ...options,
        global: { fetch: async () => new Response(JSON.stringify({ code: upstreamCode, message: credentials.pin, details: 'fixture-private-key', hint: 'fixture-sensitive-sql' }), { status, headers: { 'Content-Type': 'application/json' } }) },
      }));
      const res = response();
      await handler({ method: 'POST', headers: {}, body: { ...credentials, action: 'online' } }, res);
      assert.equal(res.code, expectedStatus);
      if (expectedCode) assert.equal(res.body.code, expectedCode);
      if (expectedCode === 'ACTIVITY_DATABASE_ERROR') {
        assert.equal(res.body.databaseCode, /^[A-Z0-9]{5}$/.test(upstreamCode) ? upstreamCode : null);
        assert.equal(res.body.upstreamStatus, status);
      }
      for (const secret of [credentials.pin, 'fixture-public-key', 'fixture-private-key', 'fixture-sensitive-sql', 'invalid-secret-diagnostic']) assert.ok(!JSON.stringify(res.body).includes(secret));
    }
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test('activity configuration names missing production settings and accepts trimmed public-key aliases', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const request = { method: 'POST', headers: {}, body: { ...credentials, action: 'online' } };
  try {
    for (const [settings, missing] of [
      [{}, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']],
      [{ SUPABASE_URL: 'https://fixture.supabase.co' }, ['SUPABASE_ANON_KEY']],
      [{ VITE_SUPABASE_ANON_KEY: 'fixture-public-key' }, ['SUPABASE_URL']],
      [{ SUPABASE_URL: ' ', SUPABASE_ANON_KEY: '\n' }, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']],
      [{ SUPABASE_URL: ' ', SUPABASE_ANON_KEY: '\n', VITE_SUPABASE_URL: ' https://fixture.supabase.co ', VITE_SUPABASE_ANON_KEY: ' fixture-public-key ' }, []],
    ]) {
      for (const name of names) delete process.env[name];
      Object.assign(process.env, settings);
      let clientCalls = 0;
      const handler = createActivityHandler((url, key) => {
        clientCalls++;
        assert.equal(url, 'https://fixture.supabase.co');
        assert.equal(key, 'fixture-public-key');
        return { rpc: () => ({ abortSignal: async () => ({ data: { members: [], serverTime: '2026-11-13T12:00:00Z' }, error: null }) }) };
      });
      const res = response();
      await handler(request, res);
      assert.equal(res.code, missing.length ? 503 : 200);
      assert.equal(clientCalls, missing.length ? 0 : 1);
      if (missing.length) {
        assert.deepEqual(res.body.missing, missing);
        assert.match(res.body.error, /Production.*Redeploy/);
        for (const name of missing) assert.ok(res.body.error.includes(name));
        assert.ok(!JSON.stringify(res.body).includes('fixture-public-key'));
      }
    }
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test('offline views survive reopening, keep their original time, and retry with the same ID without storing PINs', async () => {
  const storage = new Storage(), calls = [];
  const offline = createViewRecorder({ storage, send: async () => { throw new Error('Offline'); } });
  const item = offline.add(credentials.memberId, 'event', 'event-test', view.viewedAt);
  await offline.flush(credentials);
  assert.equal(storage.length, 1); assert.ok(!JSON.stringify([...storage.values.values()]).includes(credentials.pin));
  const reopened = createViewRecorder({ storage, send: async (auth, body) => calls.push({ auth, body }) });
  await reopened.flush(credentials);
  assert.equal(storage.length, 0); assert.equal(calls.length, 1);
  assert.equal(calls[0].body.viewId, item.viewId); assert.equal(calls[0].body.viewedAt, view.viewedAt);
});

test('two tabs keep separate receipts, failed writes remain queued, and one member never sends another member’s views', async () => {
  const storage = new Storage(), sent = [];
  const first = createViewRecorder({ storage, send: async (auth, body) => sent.push(body) });
  const second = createViewRecorder({ storage, send: async () => { throw new Error('Server unavailable'); } });
  first.add('member-test', 'event', 'one'); second.add('another-member', 'announcement', 'two');
  assert.equal(storage.length, 2);
  await first.flush(credentials);
  assert.equal(sent.length, 1); assert.equal(sent[0].targetId, 'one'); assert.equal(storage.length, 1);
  await second.flush({ memberId: 'another-member', pin: 'fixture-other-pin' }); assert.equal(storage.length, 1);
  second.add('another-member', 'announcement', 'three'); assert.equal(storage.length, 2);
});

test('activity transport keeps credentials out of the URL and cannot override the signed-in identity', async () => {
  const original = global.fetch;
  let call;
  global.fetch = async (url, options) => { call = { url, options }; return { ok: true, json: async () => acknowledgement }; };
  try {
    await activityRequest(credentials, { ...view, memberId: 'someone-else', pin: 'wrong' });
    assert.equal(call.url, '/api/activity'); assert.equal(call.options.cache, 'no-store');
    const body = JSON.parse(call.options.body); assert.equal(body.memberId, credentials.memberId); assert.equal(body.pin, credentials.pin);
  } finally { global.fetch = original; }
});

test('activity uses the app public connection even when the Vercel API is misconfigured', async () => {
  const calls = [];
  await activityRequest(credentials, { ...view, memberId: 'forged', pin: 'wrong' }, {
    connection, keepalive: true,
    fetcher: async (url, options) => { calls.push({ url, options }); return Response.json(acknowledgement); },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, connection.url + '/rest/v1/rpc/louvesync_activity');
  assert.ok(!calls[0].url.includes(credentials.pin));
  assert.equal(calls[0].options.headers.apikey, connection.anonKey);
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_payload: { ...view, ...credentials } });
});

test('REST endpoint URLs do not produce PGRST125 in direct activity calls or the Vercel SDK', async () => {
  const configured = connection.url + '/rest/v1/';
  const expected = connection.url + '/rest/v1/rpc/louvesync_activity';
  const calls = [];
  const fetcher = async url => {
    calls.push(String(url));
    return String(url) === expected ? Response.json(acknowledgement) : Response.json({ code: 'PGRST125', message: 'Invalid path specified in request URL' }, { status: 404 });
  };
  const data = await activityRequest(credentials, view, { connection: { ...connection, url: configured }, fetcher });
  assert.equal(data.ok, true);
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = configured; process.env.SUPABASE_ANON_KEY = connection.anonKey;
  try {
    const handler = createActivityHandler((url, key, options) => createClient(url, key, { ...options, global: { fetch: fetcher } }));
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { ...credentials, ...view } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(calls, [expected, expected]);
  } finally {
    for (const [name, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_ANON_KEY', previous.key]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('a failed RPC response falls back to the API with the same receipt identity', async () => {
  const storage = new Storage(), calls = [], stored = new Set();
  const recorder = createViewRecorder({ storage, send: (actor, payload) => activityRequest(actor, payload, {
    connection,
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body), payload = body.p_payload || body;
      calls.push({ url, payload }); stored.add(payload.viewId);
      return url === '/api/activity' ? Response.json(acknowledgement) : Response.json({ message: 'Response lost after commit' }, { status: 503 });
    },
  }) });
  const receipt = recorder.add(credentials.memberId, 'event', 'event-test');
  await recorder.flush(credentials);
  assert.deepEqual(calls.map(call => call.url), [connection.url + '/rest/v1/rpc/louvesync_activity', '/api/activity']);
  assert.deepEqual(calls.map(call => call.payload.viewId), [receipt.viewId, receipt.viewId]);
  assert.equal(stored.size, 1); assert.equal(storage.length, 0);
});

test('direct RPC keeps PIN and admin denials authoritative and sanitizes upstream errors', async () => {
  for (const [code, status] of [['28000', 401], ['42501', 403]]) {
    let calls = 0;
    await assert.rejects(activityRequest(credentials, { action: 'viewers', targetType: 'event', targetId: 'event-test' }, {
      connection, fetcher: async () => { calls++; return Response.json({ code, message: credentials.pin }, { status }); },
    }), error => error.status === status && !error.message.includes(credentials.pin));
    assert.equal(calls, 1);
  }
});

test('malformed successes never remove queued views and a later valid response recovers them', async () => {
  const storage = new Storage(); let healthy = false;
  const recorder = createViewRecorder({ storage, send: (actor, payload) => activityRequest(actor, payload, {
    connection, fetcher: async () => Response.json(healthy ? acknowledgement : { ok: true }),
  }) });
  recorder.add(credentials.memberId, 'announcement', 'post-test');
  await recorder.flush(credentials); assert.equal(storage.length, 1);
  healthy = true;
  await recorder.flush(credentials); assert.equal(storage.length, 0);
});

test('views arriving during an in-flight flush are sent without waiting for the next heartbeat', async () => {
  const storage = new Storage(), sent = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const recorder = createViewRecorder({ storage, send: async (_auth, body) => { sent.push(body); if (sent.length === 1) await gate; } });
  recorder.add(credentials.memberId, 'event', 'first');
  const pending = recorder.flush(credentials);
  recorder.add(credentials.memberId, 'announcement', 'second');
  release(); await pending;
  assert.deepEqual(sent.map(row => row.targetId), ['first', 'second']); assert.equal(storage.length, 0);
});

test('closing an activity query cancels its network request', async () => {
  const original = global.fetch, controller = new AbortController();
  global.fetch = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  try {
    const request = activityRequest(credentials, { action: 'online' }, { signal: controller.signal });
    controller.abort(); await assert.rejects(request, /Não foi possível conectar/);
  } finally { global.fetch = original; }
});
