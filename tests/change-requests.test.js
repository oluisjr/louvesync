import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { actorHeaders, authenticatedFetch, memberColumns, publicMember, setMutationActor } from '../src/lib/member-session.js';
import { canManageMinistry, canRequestOwnKey, changesPayload, changesRequest, songProposal, validChangesResponse } from '../src/lib/change-requests.js';
import { createChangesHandler } from '../api/changes.js';
import { saveMemberRecord } from '../src/lib/member-storage.js';

const auth = { memberId: 'junior', pin: 'SYNTHETIC_MEMBER_PIN' };
const requestId = '00000000-0000-4000-8000-000000000001';
const input = { action: 'request', kind: 'key', eventId: 'event', songId: 'song', requestId, proposal: { key: 'D' }, reason: 'Extensão vocal' };
const row = { id: requestId, actor_id: auth.memberId, actor_name: 'Júnior', kind: 'key', source_song_id: 'song', status: 'pending', created_at: '2026-11-15T10:00:00Z' };
const packet = { ok: true, request: row };
const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('member key requests require their assigned vocal and actual event roster', () => {
  const event = { type: 'culto', members: ['junior'], singerBySong: { song: 'junior', other: 'other' } };
  assert.equal(canRequestOwnKey({ id: 'junior' }, event, 'song'), true);
  for (const candidate of [{ ...event, members: [] }, { ...event, singerBySong: {} }, { ...event, type: 'ensaio' }]) assert.equal(canRequestOwnKey({ id: 'junior' }, candidate, 'song'), false);
  assert.equal(canRequestOwnKey({ id: 'junior' }, event, 'other'), false);
  assert.equal(canManageMinistry({ is_admin: false, role: 'Líder de Louvor', status: 'ativo' }), true);
  assert.equal(canManageMinistry({ is_admin: true, status: 'inativo' }), false);
});

test('proposal validation strips forged permissions, singers, keys of other vocals and caller identity', () => {
  assert.deepEqual(changesPayload({ ...auth, ...input, is_admin: true, actor_id: 'leader', proposal: { key: 'D', vocal_keys: { other: 'E' } } }), { ...auth, ...input });
  for (const patch of [{ reason: '' }, { reason: 'x'.repeat(501) }, { requestId: '../id' }, { proposal: { key: 'H' } }, { eventId: '' }, { pin: '' }]) assert.equal(changesPayload({ ...auth, ...input, ...patch }), null);
  assert.deepEqual(songProposal({ title: 'Música', key: 'E', vocal_keys: { other: 'G' }, created_by: 'leader', featured_week: true }), { title: 'Música' });
  assert.deepEqual(songProposal({ title: 'Nova', key: 'E' }, true), { title: 'Nova', key: 'E' });
});

test('requests require a matching server acknowledgement and do not report a different request as saved', async () => {
  let observed;
  const fetcher = async (url, options) => { observed = { url, options }; return { ok: true, json: async () => packet }; };
  assert.equal((await changesRequest(auth, input, { fetcher })).request.id, requestId);
  assert.equal(observed.url, '/api/changes'); assert.equal(observed.options.method, 'POST'); assert.equal(observed.options.cache, 'no-store');
  assert.equal(observed.options.headers['x-louvesync-member'], auth.memberId);
  assert.equal(JSON.parse(observed.options.body).pin, auth.pin);
  for (const request of [{ ...row, id: '00000000-0000-4000-8000-000000000002' }, { ...row, actor_id: 'other' }, { ...row, kind: 'song' }]) await assert.rejects(changesRequest(auth, input, { fetcher: async () => ({ ok: true, json: async () => ({ ok: true, request }) }) }), /não confirmou/);
  assert.equal(validChangesResponse({ ok: true, request: { ...row, status: 'approved', decided_by: 'other' } }, { action: 'decide', requestId, memberId: 'leader', decision: 'approved' }), false);
});

test('native approval transport does not fall back after permission, stale-edit or session failures', async () => {
  for (const [code, status] of [['42501', 403], ['40001', 409], ['28000', 401]]) {
    const calls = [];
    await assert.rejects(changesRequest(auth, input, { connection: { url: 'https://fixture.supabase.co/rest/v1', anonKey: 'public-test-key' }, fetcher: async (url, options) => { calls.push([url, options]); return { ok: false, status: 400, json: async () => ({ code }) }; } }), error => error.status === status);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'https://fixture.supabase.co/rest/v1/rpc/louvesync_changes');
    assert.equal(JSON.parse(calls[0][1].body).p_payload.pin, auth.pin);
  }
});

test('API uses public credentials, validates input and forwards only canonical request data', async () => {
  const calls = [], res = response();
  const handler = createChangesHandler((_url, key, options) => {
    assert.equal(key, 'public-key'); assert.deepEqual(options.global.headers, actorHeaders(auth));
    return { rpc(name, args) { calls.push({ name, args }); return { abortSignal: async () => ({ data: packet, error: null }) }; } };
  }, { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public-key' });
  await handler({ method: 'POST', headers: { host: 'app.test', origin: 'https://app.test' }, body: { ...auth, ...input, is_admin: true, actor_name: 'forged' } }, res);
  assert.equal(res.code, 200); assert.deepEqual(calls, [{ name: 'louvesync_changes', args: { p_payload: { ...auth, ...input } } }]);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  const other = response(); await handler({ method: 'POST', headers: { host: 'app.test', origin: 'https://other.test' }, body: { ...auth, ...input } }, other); assert.equal(other.code, 403); assert.equal(calls.length, 1);
});

test('mutation credentials reach the real Supabase SDK only for its REST origin and disappear on logout', async () => {
  const calls = [], fetcher = async (input, options) => { calls.push({ url: String(input), headers: options.headers }); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const scopedFetch = authenticatedFetch('https://fixture.supabase.co', fetcher);
  const client = createClient('https://fixture.supabase.co', 'public-test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: scopedFetch } });
  try {
    setMutationActor(auth);
    await client.from('songs').update({ title: 'Changed' }).eq('id', 'song');
    assert.equal(calls[0].headers.get('x-louvesync-member'), auth.memberId); assert.equal(calls[0].headers.get('x-louvesync-pin'), auth.pin);
    await scopedFetch('https://fixture.supabase.co/storage/v1/object/public/asset'); await scopedFetch('https://third.test/rest/v1/songs');
    for (const call of calls.slice(1)) assert.equal(call.headers.get('x-louvesync-pin'), null);
    setMutationActor(null); await client.from('songs').select('id'); assert.equal(calls.at(-1).headers.get('x-louvesync-pin'), null);
    assert.equal(memberColumns.includes('pin'), false); assert.deepEqual(publicMember({ id: 'junior', name: 'Júnior', pin: 'PRIVATE' }), { id: 'junior', name: 'Júnior' });
  } finally { setMutationActor(null); }
});

test('member creation and PIN resets use explicit writes and never request SELECT on PIN', async () => {
  for (const exists of [true, false]) {
    const calls = [], safe = { id: 'member', name: 'Membro', is_admin: false };
    const client = createClient('https://fixture.supabase.co', 'public-test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(input), method = init.method || 'GET'; calls.push({ url, method, body: init.body });
      return new Response(JSON.stringify(method === 'GET' ? exists ? [{ id: safe.id }] : [] : safe), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } } });
    assert.deepEqual(await saveMemberRecord(client, { ...safe, pin: 'NEW_SYNTHETIC_PIN' }), safe);
    assert.equal(calls.length, 2); assert.equal(calls[0].method, 'GET'); assert.equal(calls[1].method, exists ? 'PATCH' : 'POST');
    assert.equal(calls[1].url.searchParams.get('on_conflict'), null);
    assert.equal(JSON.parse(calls[1].body).pin, 'NEW_SYNTHETIC_PIN');
    for (const call of calls) assert.doesNotMatch(call.url.searchParams.get('select'), /pin|\*/);
  }
});
