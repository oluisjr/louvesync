import { useCallback, useEffect, useRef, useState } from 'react';
import { changesRequest } from '../lib/change-requests.js';
import { publicSupabaseConfig } from '../lib/supabase.js';

export function useChangeRequests(credentials, { eventId, audit = false, pending = false } = {}) {
  const memberId = credentials?.memberId, pin = credentials?.pin;
  const [query, setQuery] = useState({ data: null, loading: true, error: '' });
  const version = useRef(0), current = useRef(null), loadingMore = useRef(false);
  const send = useCallback(payload => changesRequest({ memberId, pin }, payload, { connection: publicSupabaseConfig }), [memberId, pin]);
  const refresh = useCallback(async () => {
    const attempt = ++version.current;
    setQuery(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await send({ action: audit ? 'audit' : 'list', ...(eventId ? { eventId } : {}), ...(!audit ? { status: pending ? 'pending' : 'all' } : {}) });
      if (attempt === version.current) { current.current = data; setQuery({ data, loading: false, error: '' }); }
    } catch (error) { if (attempt === version.current) setQuery(previous => ({ ...previous, loading: false, error: error.message })); }
  }, [send, audit, eventId, pending]);
  useEffect(() => {
    const counter = version;
    current.current = null; setQuery({ data: null, loading: true, error: '' });
    void refresh();
    const poll = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && !loadingMore.current) void refresh(); }, 30000);
    const changed = () => { void refresh(); };
    window.addEventListener('online', changed); window.addEventListener('louvesync:changes', changed);window.addEventListener('louvesync:synced',changed);
    return () => { counter.current++; clearInterval(poll); window.removeEventListener('online', changed); window.removeEventListener('louvesync:changes', changed);window.removeEventListener('louvesync:synced',changed); };
  }, [refresh]);
  const loadMore = async () => {
    const data = current.current, key = audit ? 'entries' : 'requests';
    if (!data?.hasMore || loadingMore.current) return;
    loadingMore.current = true; const attempt = ++version.current;
    setQuery(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const next = await send({ action: audit ? 'audit' : 'list', ...(eventId ? { eventId } : {}), ...(audit ? { beforeId: data[key].at(-1).id } : { status: pending ? 'pending' : 'all', beforeRequest: data[key].at(-1).id }) });
      if (attempt === version.current) { const merged = { ...next, [key]: [...data[key], ...next[key]] }; current.current = merged; setQuery({ data: merged, loading: false, error: '' }); }
    } catch (error) { if (attempt === version.current) setQuery(previous => ({ ...previous, loading: false, error: error.message })); }
    finally { loadingMore.current = false; }
  };
  return { ...query, refresh, loadMore, send };
}
