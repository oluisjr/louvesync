import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activityRequest, createViewRecorder } from '../lib/activity-client.js';
import { broadcastUpdate, onRealtime } from '../lib/realtime.js';

function changed() {
  window.dispatchEvent(new Event('louvesync:activity'));
  void broadcastUpdate({ type: 'activity_changed' }, { ensureConnection: false }).catch(() => {});
}

export function useActivity(profile, members) {
  const memberId = profile?.id;
  const pin = members.find(member => member.id === memberId)?.pin;
  const credentials = useMemo(() => memberId && pin != null ? { memberId, pin: String(pin) } : null, [memberId, pin]);
  const recorder = useMemo(() => createViewRecorder({ onSaved: changed }), []);
  const recordView = useCallback((targetType, targetId) => {
    if (!memberId || document.visibilityState !== 'visible') return;
    recorder.add(memberId, targetType, targetId);
    if (credentials && navigator.onLine) void recorder.flush(credentials);
  }, [memberId, credentials, recorder]);
  useEffect(() => {
    if (!credentials) return;
    const sessionId = crypto.randomUUID();
    let version = 0, disposed = false, sending = false, active = false;
    const leave = () => {
      active = false;
      if (navigator.onLine) void activityRequest(credentials, { action: 'leave', sessionId, version: ++version }, { keepalive: true }).then(changed).catch(() => {});
    };
    const pulse = async () => {
      if (disposed || sending || document.visibilityState !== 'visible' || !navigator.onLine) return;
      sending = true;
      const wasActive = active;
      try {
        await activityRequest(credentials, { action: 'heartbeat', sessionId, version: ++version });
        if (!disposed && document.visibilityState === 'visible') { active = true; if (!wasActive) changed(); }
      } catch { active = false; }
      finally { sending = false; }
      if (!disposed) void recorder.flush(credentials);
    };
    const visibility = () => document.visibilityState === 'visible' ? void pulse() : leave();
    const offline = () => { active = false; };
    void pulse();
    const timer = setInterval(pulse, 25000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', pulse);
    window.addEventListener('offline', offline);
    window.addEventListener('pageshow', pulse);
    window.addEventListener('pagehide', leave);
    window.addEventListener('louvesync:resume', pulse);
    return () => {
      disposed = true; leave(); clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', pulse); window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', pulse); window.removeEventListener('pagehide', leave);
      window.removeEventListener('louvesync:resume', pulse);
    };
  }, [credentials, recorder]);
  return { credentials, recordView };
}

export function useActivityQuery(credentials, action, targetType, targetId) {
  const memberId = credentials?.memberId, pin = credentials?.pin;
  const scope = useMemo(() => ({ memberId, pin, action, targetType, targetId }), [memberId, pin, action, targetType, targetId]);
  const [state, setState] = useState({ scope: null, loading: true, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const { memberId, pin, action, targetType, targetId } = scope;
    if (!memberId || !pin) return;
    let disposed = false, running = false, pending = false;
    const controller = new AbortController();
    setState({ scope, loading: true, data: null, error: '' });
    const load = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (running) { pending = true; return; }
      running = true;
      try {
        const data = await activityRequest({ memberId, pin }, { action, ...(targetType ? { targetType, targetId } : {}) }, { signal: controller.signal });
        if (!disposed) setState({ scope, loading: false, data, error: '' });
      } catch (error) { if (!disposed) setState(previous => ({ scope, data: previous.scope === scope ? previous.data : null, loading: false, error: error.message })); }
      finally { running = false; if (pending && !disposed) { pending = false; void load(); } }
    };
    void load();
    const off = onRealtime(message => { if (message.type === 'activity_changed') void load(); });
    const timer = setInterval(load, 15000);
    window.addEventListener('louvesync:activity', load);
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', load);
    return () => { disposed = true; controller.abort(); off(); clearInterval(timer); window.removeEventListener('louvesync:activity', load); window.removeEventListener('online', load); document.removeEventListener('visibilitychange', load); };
  }, [scope, retry]);
  const unavailable = !memberId || !pin;
  // Effects run after a render: clearing state in the effect alone can show
  // the previous event's readers under the new event's heading. Gate all data
  // synchronously by the full query identity, including the signed-in member.
  const current = state.scope === scope ? state : { loading: true, data: null, error: '' };
  return { loading: current.loading, data: current.data, error: current.error, ...(unavailable ? { loading: false, data: null, error: 'Não foi possível validar esta sessão. Entre novamente no app.' } : {}), refresh: () => setRetry(value => value + 1) };
}

// A mural card is viewed only after a meaningful portion stays visible for 1 s.
export function useVisibleView(onView, key, { root = null, immediate = false, enabled = true } = {}) {
  const ref = useRef(null), callback = useRef(onView);
  callback.current = onView;
  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    let timer, recorded = false, visible = immediate;
    const cancel = () => clearTimeout(timer);
    const schedule = () => {
      cancel();
      if (!recorded && visible && document.visibilityState === 'visible' && !document.getElementById('root')?.inert) timer = setTimeout(() => {
        if (document.visibilityState === 'visible' && !document.getElementById('root')?.inert) { recorded = true; callback.current?.(); }
      }, immediate ? 0 : 1000);
    };
    let observer;
    if (!immediate && element) {
      const scroller = root || element.closest('[data-main-scroll]');
      const nav = document.querySelector('.app-nav');
      const inset = nav ? Math.max(0, (scroller?.getBoundingClientRect().bottom || window.innerHeight) - nav.getBoundingClientRect().top) : 0;
      observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        const needed = Math.min(entry.boundingClientRect.height * 0.5, (entry.rootBounds?.height || window.innerHeight) * 0.5);
        visible = entry.isIntersecting && entry.intersectionRect.height >= needed;
        schedule();
      }, { root: scroller, rootMargin: `0px 0px -${Math.ceil(inset)}px 0px`, threshold: Array.from({ length: 101 }, (_, index) => index / 100) });
      observer.observe(element);
    }
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('focusin', schedule);
    schedule();
    return () => { cancel(); observer?.disconnect(); document.removeEventListener('visibilitychange', schedule); document.removeEventListener('focusin', schedule); };
  }, [key, root, immediate, enabled]);
  return ref;
}
