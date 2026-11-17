import { createClient } from '@supabase/supabase-js';
import { authenticatedFetch } from './member-session.js';
export function actorClient(config, actor) {
  if (!config?.url || !config.anonKey || !actor?.memberId || !actor.pin) throw new Error('Entre novamente para sincronizar esta conta.');
  const fixed = Object.freeze({ memberId: actor.memberId, pin: actor.pin });
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authenticatedFetch(config.url, fetch, () => fixed) } });
}
