import test from 'node:test';
import assert from 'node:assert/strict';
import { isNotificationLeader, notificationRecipients, validPushEndpoint, validatePushSubscription } from '../src/lib/notification-policy.js';

const members = [
  { id: 'vocal', name: 'Vocal', status: 'ativo' },
  { id: 'removed', name: 'Músico removido', status: 'ativo' },
  { id: 'other', name: 'Outra pessoa', status: 'ativo' },
  { id: 'admin', is_admin: true, status: 'ativo' },
  { id: 'leader', role: 'LÍDER DE LOUVOR', status: 'ativo' },
  { id: 'inactive', status: 'inativo' },
];
const point = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const auth = Buffer.alloc(16, 2).toString('base64url');
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture-token', keys: { p256dh: point, auth } };

test('only actual leaders and admins receive attendance refusals from assigned people', () => {
  assert.equal(isNotificationLeader({ role: 'Líder de Louvor' }), true);
  assert.equal(isNotificationLeader({ role: 'Líder de patrimônio' }), false);
  assert.equal(isNotificationLeader({ is_admin: 'true' }), false);
  assert.deepEqual(notificationRecipients('attendance_declined', { members, eventMemberIds: ['vocal'], decliningMemberId: 'vocal' }), ['admin', 'leader']);
  assert.deepEqual(notificationRecipients('attendance_declined', { members, eventMemberIds: ['vocal'], decliningMemberId: 'other' }), []);
  assert.deepEqual(notificationRecipients('attendance_declined', { members, eventMemberIds: ['admin'], decliningMemberId: 'admin' }), ['leader']);
  assert.deepEqual(notificationRecipients('attendance_confirmed', { members, eventMemberIds: ['vocal'] }), []);
});

test('event notices target affected ordinary members and song additions exclude leaders, inactive accounts and actor', () => {
  assert.deepEqual(notificationRecipients('event_changed', { members, eventMemberIds: ['vocal', 'admin', 'inactive'], previousMemberIds: ['removed'] }), ['vocal', 'removed']);
  assert.deepEqual(notificationRecipients('event_changed', { members, eventMemberIds: ['vocal'], actorId: 'vocal' }), []);
  assert.deepEqual(notificationRecipients('event_changed', { members, audience: 'all' }), ['vocal', 'removed', 'other']);
  assert.deepEqual(notificationRecipients('song_added', { members, actorId: 'other' }), ['vocal', 'removed']);
  assert.deepEqual(notificationRecipients('unknown', { members }), []);
  assert.deepEqual(notificationRecipients('song_added', { members: [...members, members[0]] }), ['vocal', 'removed', 'other']);
});

test('push subscriptions accept browser providers while rejecting SSRF and unrelated domains', () => {
  for (const endpoint of [subscription.endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://web.push.apple.com/fixture', 'https://wns2-fixture.notify.windows.com/w/?token=test']) assert.equal(validPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/token', 'https://127.0.0.1/push', 'https://[::1]/push',
    'https://169.254.169.254/latest/meta-data', 'https://fcm.googleapis.com.attacker.test/push',
    'https://attacker.test/push.services.mozilla.com/x', 'https://fcm.googleapis.com:444/push',
    'https://member:secret@fcm.googleapis.com/push', 'https://web.push.apple.com/push#fragment',
    'https://web.push.apple.com/', 'https://web.push.apple.com/\nfixture', 'https://attacker.test/push',
  ]) assert.equal(validPushEndpoint(endpoint), false, endpoint);
});

test('subscription keys have the browser-required length and format and unexpected privilege fields are stripped', () => {
  assert.deepEqual(validatePushSubscription({ ...subscription, is_admin: true, memberId: 'other', expirationTime: null }), subscription);
  assert.deepEqual(validatePushSubscription({ ...subscription, keys: { p256dh: point + '=', auth: auth + '==' } }), subscription);
  for (const keys of [null, {}, { p256dh: point, auth: 'short' }, { p256dh: 'A'.repeat(87), auth }, { p256dh: point, auth: auth + '!'}, { p256dh: point.slice(1), auth }]) assert.equal(validatePushSubscription({ ...subscription, keys }), null);
  assert.equal(validatePushSubscription({ ...subscription, endpoint: 'https://127.0.0.1/push' }), null);
});
