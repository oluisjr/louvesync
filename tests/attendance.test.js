import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceByMember, attendanceCounts, attendanceCsv, attendancePayload, canManageAttendance, validAttendanceSheet } from '../src/lib/attendance.js';
import { attendanceRequest } from '../src/lib/attendance-client.js';
import { createAttendanceHandler } from '../api/attendance.js';

const auth = { memberId: 'leader', pin: 'SYNTHETIC_LEADER_PIN' };
const sheet = { eventId: 'event', date: '2026-11-15', label: 'Culto', time: '18:00', version: 1, finalized: true, roster: [{ memberId: 'a', name: 'Ana', instrument: 'Vocal', status: 'present', note: '' }, { memberId: 'b', name: 'Bia', instrument: 'Teclado', status: 'absent', note: '' }], recordedBy: { memberId: auth.memberId, name: 'Líder' }, updatedAt: '2026-11-15T21:00:00Z' };
const packet = value => ({ ok: true, sheet: value, today: '2026-11-15', serverTime: '2026-11-15T21:00:00Z', canRecord: true });
const request = body => ({ method: 'POST', headers: { host: 'fixture.test', origin: 'https://fixture.test' }, body });
const response = () => ({ code: 200, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });

test('only active ministry leadership is eligible, independent of instrument, admin spoofing or screen grants', () => {
  for (const member of [{ is_admin: true, status: 'ativo' }, { role: 'Líder de Louvor', status: 'ativo' }, { role: 'Lider de Louvor' }]) assert.equal(canManageAttendance(member), true);
  for (const member of [null, {}, { role: 'Vocal', instrument: 'Líder de Louvor' }, { role: 'Vocal', permissions: ['presencas'] }, { role: 'Líder de Louvor', status: 'inativo' }]) assert.equal(canManageAttendance(member), false);
});

test('attendance payload strips privilege claims and validates complete rosters, statuses, notes and version', () => {
  const input = { ...auth, action: 'save', eventId: 'event', version: 0, finalize: false, entries: sheet.roster, is_admin: true, role: 'Líder', recordedBy: 'forged' };
  const clean = attendancePayload(input);
  assert.deepEqual(Object.keys(clean).sort(), ['action', 'memberId', 'pin', 'eventId', 'version', 'finalize', 'entries'].sort());
  assert.equal(clean.entries[0].name, undefined);
  for (const patch of [{ version: -1 }, { version: 0.5 }, { finalize: 'true' }, { entries: [] }, { entries: [...sheet.roster, sheet.roster[0]] }, { entries: [{ ...sheet.roster[0], status: 'yes' }] }, { entries: [{ ...sheet.roster[0], note: 'x'.repeat(501) }] }, { entries: [null] }]) assert.equal(attendancePayload({ ...input, ...patch }), null);
  assert.ok(attendancePayload({ ...input, entries: [{ memberId: 'a', status: null, note: '' }] }));
});

test('attendance reports require a valid bounded period and partial calls do not affect member percentages', () => {
  assert.ok(attendancePayload({ ...auth, action: 'list', from: '2026-11-01', to: '2026-11-30' }));
  for (const [from, to] of [['2026-11-30', '2026-11-01'], ['2026-02-30', '2026-03-01'], ['2020-01-01', '2026-01-01']]) assert.equal(attendancePayload({ ...auth, action: 'list', from, to }), null);
  const partial = { ...sheet, eventId: 'partial', finalized: false, roster: [{ ...sheet.roster[0], status: 'absent' }] };
  assert.deepEqual(attendanceByMember([sheet, partial]).map(member => [member.memberId, member.total, member.rate]), [['a', 1, 100], ['b', 1, 0]]);
  assert.deepEqual(attendanceCounts([...sheet.roster, { status: null }, { status: 'excused' }]), { total: 4, present: 1, absent: 1, excused: 1, pending: 1, rate: 25 });
});

test('attendance CSV includes evidence and recorder, omits incomplete calls and escapes spreadsheet formulas', () => {
  const value = { ...sheet, roster: [{ ...sheet.roster[0], name: '=FORMULA()', note: 'linha 1\n"linha 2"' }] };
  const csv = attendanceCsv([value, { ...sheet, label: 'PARTIAL', finalized: false }]);
  assert.match(csv, /'=FORMULA\(\)/); assert.match(csv, /Registrado por/); assert.match(csv, /Líder/); assert.match(csv, /linha 1\n""linha 2""/); assert.doesNotMatch(csv, /PARTIAL/);
});

test('attendance responses cannot declare an incomplete roster finalized', () => {
  assert.equal(validAttendanceSheet(sheet), true);
  assert.equal(validAttendanceSheet({ ...sheet, roster: [{ ...sheet.roster[0], status: null }] }), false);
  assert.equal(validAttendanceSheet({ ...sheet, finalized: false, roster: [{ ...sheet.roster[0], status: null }] }), true);
  assert.equal(validAttendanceSheet({ ...sheet, roster: [...sheet.roster, sheet.roster[0]] }), false);
});

test('attendance client waits for matching server acknowledgement and sends credentials only in POST', async () => {
  let observed;
  const result = await attendanceRequest(auth, { action: 'get', eventId: 'event' }, { fetcher: async (url, options) => { observed = { url, options }; return { ok: true, json: async () => packet(sheet) }; } });
  assert.equal(result.sheet.eventId, 'event'); assert.equal(observed.url, '/api/attendance'); assert.equal(observed.options.method, 'POST'); assert.equal(observed.options.cache, 'no-store'); assert.equal(JSON.parse(observed.options.body).pin, auth.pin);
  await assert.rejects(attendanceRequest(auth, { action: 'get', eventId: 'other' }, { fetcher: async () => ({ ok: true, json: async () => packet(sheet) }) }), /não confirmou/);
  await assert.rejects(attendanceRequest(auth, { action: 'save', eventId: 'event', version: 1, finalize: true, entries: sheet.roster }, { fetcher: async () => ({ ok: true, json: async () => packet(sheet) }) }), /não confirmou/);
});

test('native attendance uses the project RPC and never falls back around a permission or conflict error', async () => {
  for (const [code, status] of [['42501', 403], ['40001', 409], ['28000', 401]]) {
    const calls = [];
    await assert.rejects(attendanceRequest(auth, { action: 'get', eventId: 'event' }, { connection: { url: 'https://fixture.supabase.co/rest/v1/', anonKey: 'public-key' }, fetcher: async (url, options) => { calls.push({ url, options }); return { ok: false, status: 400, json: async () => ({ code }) }; } }), error => error.status === status);
    assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://fixture.supabase.co/rest/v1/rpc/louvesync_attendance'); assert.equal(JSON.parse(calls[0].options.body).p_payload.pin, auth.pin);
  }
});

test('attendance API uses persisted authorization and strips forged leaders, names and event dates', async () => {
  const calls = [], res = response();
  const handler = createAttendanceHandler(() => ({ rpc(name, args) { calls.push({ name, args }); return { abortSignal: async () => ({ data: packet(sheet), error: null }) }; } }), { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public-key' });
  await handler(request({ ...auth, action: 'get', eventId: 'event', is_admin: true, name: 'forged', date: '2099-01-01' }), res);
  assert.equal(res.code, 200); assert.deepEqual(calls, [{ name: 'louvesync_attendance', args: { p_payload: { ...auth, action: 'get', eventId: 'event' } } }]); assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('attendance API rejects malformed requests and foreign origins before contacting the database', async () => {
  let called = false;
  const handler = createAttendanceHandler(() => { called = true; });
  for (const [req, code] of [[{ ...request({}), method: 'GET' }, 405], [request({ action: 'get', eventId: 'event' }), 400], [{ ...request({ ...auth, action: 'get', eventId: 'event' }), headers: { host: 'fixture.test', origin: 'https://attacker.test' } }, 403]]) { const res = response(); await handler(req, res); assert.equal(res.code, code); }
  assert.equal(called, false);
});

test('attendance API fails closed on wrong PINs, unauthorized leaders, conflicts and missing installation', async () => {
  for (const [code, status] of [['42501', 403], ['28000', 401], ['40001', 409], ['PGRST202', 503], ['P0002', 404]]) {
    const res = response();
    const handler = createAttendanceHandler(() => ({ rpc: () => ({ abortSignal: async () => ({ data: null, error: { code, message: auth.pin + ' private details' } }) }) }), { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public-key' });
    await handler(request({ ...auth, action: 'get', eventId: 'event' }), res); assert.equal(res.code, status); assert.ok(!JSON.stringify(res.body).includes(auth.pin));
  }
});
