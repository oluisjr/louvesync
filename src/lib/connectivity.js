import { Capacitor } from '@capacitor/core';
const listeners = new Set();
let online = globalThis.navigator?.onLine !== false, started = false, probing = null;
export const connectionAvailable = () => online && globalThis.navigator?.onLine !== false;
export function networkFailure(error) {
  if (!error) return false;
  if(['not_configured','provider_auth','provider_model','provider_quota'].includes(error.code))return false;
  if (error.status >= 400 && error.status < 500) return false;
  return error instanceof TypeError || error.name === 'AbortError' || error.status >= 500 ||
    /failed to fetch|fetch failed|network|networkerror|load failed|connection|sem conexão/i.test(error.message || '') ||
    (!!error.cause && networkFailure(error.cause));
}
function update(value) {
  if (online === value) return;
  online = value; listeners.forEach(listener => listener());
  if (value) globalThis.window?.dispatchEvent(new Event('louvesync:connected'));
}
export function connectionFailed() { update(false); }
export function connectionSucceeded(){if(globalThis.navigator?.onLine!==false)update(true);}
export async function checkConnection() {
  if (globalThis.navigator?.onLine === false) { update(false); return false; }
  if (probing) return probing;
  probing = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const native=Capacitor.isNativePlatform(),endpoint=native?'https://louvesync.vercel.app/api/version':import.meta.env?.DEV?'/':'/api/version';
      const response = await fetch(endpoint, { method: !native&&import.meta.env?.DEV ? 'HEAD' : 'GET', cache: 'no-store', signal: controller.signal });
      const available = response.ok && (import.meta.env?.DEV || typeof (await response.json()).version === 'string');
      update(!!available); return !!available;
    } catch { update(false); return false; }
    finally { clearTimeout(timer); probing = null; }
  })();
  return probing;
}
export function subscribeConnection(listener) {
  listeners.add(listener);
  if (!started && globalThis.window) {
    started = true;
    window.addEventListener('offline', () => update(false));
    for (const name of ['online', 'focus', 'pageshow', 'louvesync:resume']) window.addEventListener(name, () => void checkConnection());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkConnection(); });
    setInterval(() => { if (document.visibilityState !== 'hidden') void checkConnection(); }, 15000);
    void checkConnection();
  }
  return () => listeners.delete(listener);
}
