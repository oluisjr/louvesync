import { supabase } from './supabase';

let channel;
let status = 'offline';
const listeners = new Set();
const statusListeners = new Set();
function setStatus(value) { status = value; statusListeners.forEach(fn => fn(value)); }
export function connectRealtime() {
  if (!supabase || channel) return;
  setStatus('connecting');
  channel = supabase.channel('louvesync_broadcast', { config: { broadcast: { self: true, ack: true } } });
  channel.on('broadcast', { event: 'app_update' }, ({ payload }) => listeners.forEach(fn => fn(payload)));
  channel.on('broadcast', { event: 'stage_chat' }, ({ payload }) => listeners.forEach(fn => fn({ type: 'stage_chat', ...payload })));
  channel.subscribe(state => {
    setStatus(state === 'SUBSCRIBED' ? 'connected' : state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED' ? 'offline' : 'connecting');
  });
}
export function onRealtime(callback) { listeners.add(callback); connectRealtime(); return () => listeners.delete(callback); }
export function onRealtimeStatus(callback) { statusListeners.add(callback); callback(status); connectRealtime(); return () => statusListeners.delete(callback); }
export async function broadcastUpdate(payload) {
  connectRealtime();
  if (!channel || status !== 'connected') return false;
  const result = await channel.send({ type: 'broadcast', event: 'app_update', payload });
  return result === 'ok';
}
export function disconnectRealtime() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  setStatus('offline');
}
