import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { validatePushSubscription } from '../src/lib/notification-policy.js';

const actions = new Set(['config', 'list', 'mark_read', 'subscribe', 'unsubscribe', 'dispatch']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function notificationsPayload(body) {
  if (!body || !actions.has(body.action) || !identifier(body.memberId) || typeof body.pin !== 'string' || !body.pin.length || body.pin.length > 256) return null;
  const payload = { action: body.action, memberId: body.memberId, pin: body.pin };
  if (body.action === 'mark_read') {
    if (!Array.isArray(body.ids) || body.ids.length > 100 || body.ids.some(id => !uuid.test(id))) return null;
    payload.ids = [...new Set(body.ids)];
  }
  if (body.action === 'subscribe') {
    const subscription = validatePushSubscription(body.subscription);
    if (!subscription || (body.deviceId != null && !uuid.test(body.deviceId))) return null;
    payload.subscription = subscription;
    if (body.deviceId) payload.deviceId = body.deviceId;
  }
  if (body.action === 'unsubscribe') {
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) return null;
    payload.endpoint = body.endpoint;
  }
  return payload;
}

export function pushConfiguration(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim(), privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  let validKeys = false;
  try {
    const publicBytes = Buffer.from(publicKey || '', 'base64url');
    validKeys = publicBytes.length === 65 && publicBytes[0] === 4 && Buffer.from(privateKey || '', 'base64url').length === 32;
  } catch { /* Report unavailable, without returning secret material. */ }
  const validSubject = typeof subject === 'string' && (/^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s]+$/.test(subject));
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return { publicKey: validKeys ? publicKey : null, privateKey, subject, serviceKey, configured: !!(validKeys && validSubject && serviceKey) };
}

async function rpc(client, name, payload) {
  return client.rpc(name, { p_payload: payload }).abortSignal(AbortSignal.timeout(8000));
}

function databaseFailure(res, error) {
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return res.status(503).json({ code: 'NOTIFICATIONS_SETUP_REQUIRED', setupRequired: true, error: 'As notificações precisam ser ativadas no banco.' });
  if (error?.code === '28000') return res.status(401).json({ error: 'Sessão inválida. Entre novamente no app.' });
  if (error?.code === '42501') return res.status(403).json({ error: 'Operação não permitida.' });
  if (['22023', '22P02'].includes(error?.code)) return res.status(400).json({ error: 'Solicitação de notificação inválida.' });
  return res.status(503).json({ error: 'Não foi possível atualizar as notificações.' });
}

// The database leases each notification/device pair. Parallel API requests do
// not send the same pending delivery concurrently, and a failed send can retry.
export async function dispatchNotifications(client, configuration, send = webPush.sendNotification, wait = delay) {
  if (!configuration.configured) return { processed: 0, pushed: 0, pushConfigured: false };
  // A save spans several existing PostgREST requests. Let their triggers settle
  // before comparing the final header/setlist/member snapshot.
  await wait(1100);
  const claimed = await rpc(client, 'louvesync_notification_worker', { action: 'drain', limit: 20 });
  if (claimed.error) throw claimed.error;
  const deliveries = Array.isArray(claimed.data?.deliveries) ? claimed.data.deliveries : [];
  let pushed = 0;
  await Promise.all(deliveries.map(async delivery => {
    const subscription = validatePushSubscription(delivery.subscription);
    let status = 'retry', errorCode = 'PUSH_FAILED';
    if (!subscription) { status = 'expired'; errorCode = 'INVALID_SUBSCRIPTION'; }
    else {
      const item = delivery.notification || {};
      const url = typeof item.url === 'string' && item.url.startsWith('/?') ? item.url : '/';
      const message = JSON.stringify({ id: item.id, title: String(item.title || 'LouveSync').slice(0, 120), body: String(item.body || '').slice(0, 600), url, tag: item.id });
      try {
        await send(subscription, message, { TTL: 86400, urgency: 'normal', timeout: 5000, vapidDetails: { subject: configuration.subject, publicKey: configuration.publicKey, privateKey: configuration.privateKey } });
        status = 'sent'; pushed++;
      } catch (error) {
        if ([404, 410].includes(error?.statusCode)) { status = 'expired'; errorCode = 'SUBSCRIPTION_EXPIRED'; }
        else errorCode = 'PUSH_' + (Number.isInteger(error?.statusCode) ? error.statusCode : 'FAILED');
      }
    }
    // If acknowledgement fails, the lease expires and the durable row retries.
    // The notification ID/tag remains stable, preventing stacks on devices.
    await rpc(client, 'louvesync_notification_worker', { action: 'complete', deliveryId: delivery.deliveryId, claimToken: delivery.claimToken, status, errorCode }).catch(() => {});
  }));
  return { processed: deliveries.length, pushed, pushConfigured: true };
}

export function createNotificationsHandler({ clientFactory = createClient, send = webPush.sendNotification, wait = delay, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    const config = pushConfiguration(env);
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    const cron = req.method === 'GET' && req.query?.action === 'dispatch';
    if (cron) {
      if (!env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + env.CRON_SECRET) return res.status(401).json({ error: 'Não autorizado.' });
      if (!url || !config.configured) return res.status(503).json({ code: 'PUSH_CONFIGURATION_REQUIRED', error: 'O envio Push ainda não está configurado.' });
      try {
        const client = clientFactory(url.trim(), config.serviceKey.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
        return res.status(200).json({ ok: true, ...await dispatchNotifications(client, config, send, wait) });
      } catch (error) { return databaseFailure(res, error); }
    }
    if (req.method === 'GET') return res.status(200).json({ ok: true, publicKey: config.publicKey, pushConfigured: config.configured, setupRequired: null });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); }
      catch { return res.status(403).json({ error: 'Origem não permitida.' }); }
    }
    const payload = notificationsPayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Solicitação de notificação inválida.' });
    if (!url || !anonKey) return res.status(503).json({ code: 'NOTIFICATIONS_UNAVAILABLE', setupRequired: true, error: 'As notificações ainda não estão configuradas no servidor.' });
    try {
      const client = clientFactory(url.trim(), anonKey.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await rpc(client, 'louvesync_notifications', payload);
      if (result.error) return databaseFailure(res, result.error);
      if (result.data?.ok !== true) return res.status(503).json({ error: 'O servidor retornou notificações inválidas.' });
      if (payload.action === 'config') return res.status(200).json({ ...result.data, publicKey: config.publicKey, pushConfigured: config.configured, setupRequired: false });
      if (payload.action === 'dispatch') {
        if (!config.configured) return res.status(200).json({ ...result.data, processed: 0, pushed: 0, pushConfigured: false });
        const worker = clientFactory(url.trim(), config.serviceKey.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
        return res.status(200).json({ ...result.data, ...await dispatchNotifications(worker, config, send, wait) });
      }
      return res.status(200).json(result.data);
    } catch (error) { return databaseFailure(res, error); }
  };
}
