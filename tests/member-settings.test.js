import test from 'node:test';
import assert from 'node:assert/strict';
import { accountActive, availableMembers, availabilityReason, canSeeScreen, effectiveScreens, memberPayload, normalizeMember, rosterConflicts } from '../src/lib/member-settings.js';
const person = { id: 'person', name: 'Pessoa', is_admin: false, role: 'Vocal', status: 'ativo', instrument: 'Vocal' };

test('legacy access defaults are explicit, empty permissions restrict all screens and roles cannot be forged by screen selection', () => {
  assert.ok(canSeeScreen(person, 'ia')); assert.ok(canSeeScreen(person, 'biblia'));
  assert.deepEqual(effectiveScreens({ ...person, permissions: [] }), []);
  for (const screen of ['admin', 'membros', 'presencas']) assert.equal(canSeeScreen({ ...person, permissions: [screen] }, screen), false);
  assert.deepEqual(effectiveScreens({ ...person, permissions: ['repertorio'] }), ['repertorio']);
  assert.deepEqual(effectiveScreens({ ...person, is_admin: true, permissions: [] }), ['admin']);
  assert.equal(canSeeScreen({ ...person, role: 'Líder de Louvor', permissions: ['presencas'] }, 'presencas'), true);
  assert.deepEqual(effectiveScreens({ ...person, status: 'inativo', is_admin: true }), []);
});

test('member preferences roundtrip between the real columns and an edited form without losing weekday or screen changes', () => {
  const stored = { ...person, permissions: ['home', 'ia'], unavailable_days: [6, 0, 6], schedule_enabled: false };
  const form = normalizeMember(stored);
  assert.deepEqual(form.unavailableDays, [0, 6]); assert.equal(form.scheduleEnabled, false);
  assert.equal(Object.hasOwn(form, 'unavailable_days'), false);
  form.unavailableDays = [1, 4]; form.scheduleEnabled = true; form.permissions = ['home'];
  const payload = memberPayload({ ...form, confirmRate: 100, uiOnly: true });
  assert.deepEqual(payload.unavailable_days, [1, 4]); assert.deepEqual(payload.permissions, ['home']); assert.equal(payload.schedule_enabled, true);
  assert.equal(Object.hasOwn(payload, 'unavailableDays'), false); assert.equal(Object.hasOwn(payload, 'confirmRate'), false);
  assert.equal(normalizeMember(payload).scheduleEnabled, true); assert.equal(accountActive({ ...person, schedule_enabled: false }), true);
});

test('availability applies equally to instruments and vocals and distinguishes app access from scheduling', () => {
  const rows = [{ ...person, id: 'vocal', unavailableDays: [0] }, { ...person, id: 'bass', instrument: 'Baixo', unavailableDays: [0] }, { ...person, id: 'disabled', scheduleEnabled: false }, { ...person, id: 'inactive', status: 'inativo' }, { ...person, id: 'available' }];
  assert.deepEqual(availableMembers(rows, '2026-11-22').map(member => member.id), ['available']);
  assert.deepEqual(availableMembers(rows, '2026-11-23').map(member => member.id), ['vocal', 'bass', 'available']);
  assert.match(availabilityReason(rows[0], '2026-11-22'), /domingo/);
  assert.match(availabilityReason(rows[2], '2026-11-23'), /Fora da escala/);
  assert.equal(canSeeScreen(rows[2], 'biblia'), true);
});

test('new assignments and date changes are checked while unchanged historical rosters are preserved', () => {
  const rows = [{ ...person, unavailableDays: [0] }], event = { date: '2026-11-22', members: ['person'] };
  assert.equal(rosterConflicts(event, rows).length, 1);
  assert.equal(rosterConflicts(event, rows, event).length, 0);
  assert.equal(rosterConflicts(event, rows, { ...event, date: '2026-11-21' }).length, 1);
  assert.equal(rosterConflicts({ ...event, members: ['missing'] }, rows).length, 1);
});
