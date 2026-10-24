const VERSION_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
const ATTEMPT_KEY = 'ls_app_update_attempt';
const RELOAD_COOLDOWN = 60000;
let latestStatus = { state: 'idle' };
export function getAppUpdateStatus() { return latestStatus; }

export function validVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

export function buildFromDocument(document) {
  const value = document.querySelector('meta[name="louvesync-build"]')?.content;
  return validVersion(value) && value !== '__LOUVESYNC_BUILD__' ? value : null;
}

export function versionedUrl(address, version) {
  const url = new URL(address);
  url.searchParams.set('__ls_build', version);
  return url.href;
}

export function recentlyAttempted(attempt, from, to, now = Date.now()) {
  return attempt?.from === from && attempt?.to === to && now >= attempt.at && now - attempt.at < RELOAD_COOLDOWN;
}

function workerVersion(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(null), 350);
    function finish(version) { clearTimeout(timer); channel.port1.close(); resolve(version); }
    channel.port1.onmessage = event => finish(validVersion(event.data?.version) ? event.data.version : null);
    try { worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]); } catch { finish(null); }
  });
}

export function createAppUpdater({ win = window, fetcher = fetch, interval = 30000 } = {}) {
  const doc = win.document;
  const nav = win.navigator;
  // This is the build that actually supplied the document, never the last
  // version observed in localStorage. Seeing an update does not install it.
  const currentVersion = buildFromDocument(doc);
  let registrationPromise, inFlight, pendingVersion, disposed = false;
  let intervalId, deferredCheck, observer, blocked = false;
  let navigating = false;
  const cleanups = [];
  const status = detail => { latestStatus = detail; win.dispatchEvent(new win.CustomEvent('louvesync:update-status', { detail })); };
  const pendingWork = () => !!doc.querySelector('[data-update-blocking="true"]');
  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    cleanups.push(() => target.removeEventListener(name, handler));
  }
  function storageRead() {
    try { return JSON.parse(win.sessionStorage.getItem(ATTEMPT_KEY)); } catch { return null; }
  }
  async function registerWorker() {
    if (!nav.serviceWorker) return null;
    try {
      const registration = await nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      const activate = () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      activate();
      listen(registration, 'updatefound', () => {
        const worker = registration.installing;
        if (worker) listen(worker, 'statechange', () => { if (worker.state === 'installed') activate(); });
      });
      return registration;
    } catch {
      // An offline register() can reject even though a working controller
      // already exists. Keep that registration so online recovery can update it.
      try { return await nav.serviceWorker.getRegistration('/'); } catch { return null; }
    }
  }
  async function workerReady(version) {
    const registration = await registrationPromise;
    if (!registration) return !nav.serviceWorker?.controller;
    if (await workerVersion(registration.active) === version) return true;
    try { await registration.update(); } catch { return false; }
    const deadline = Date.now() + 8000;
    while (!disposed && Date.now() < deadline) {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      if (await workerVersion(registration.active) === version) return true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
  }
  async function getPublishedVersion() {
    const url = new URL('/version.json', win.location.origin);
    url.searchParams.set('_ls_check', `${Date.now()}`);
    const response = await fetcher(url.href, {
      cache: 'no-store', credentials: 'same-origin', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Version check unavailable');
    const data = await response.json();
    if (!validVersion(data.version)) throw new Error('Invalid version manifest');
    return data.version;
  }
  async function documentReady(version) {
    // Wait out partially propagated deploys; never reload on a manifest alone.
    const response = await fetcher(versionedUrl(new URL('/index.html', win.location.origin).href, version), {
      cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const html = new win.DOMParser().parseFromString(await response.text(), 'text/html');
    return buildFromDocument(html) === version;
  }
  async function performCheck({ startup = false, manual = false } = {}) {
    try {
      const version = await getPublishedVersion();
      if (disposed || navigating) return;
      if (version === currentVersion) {
        try { win.sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Storage may be disabled. */ }
        pendingVersion = null;
        status({ state: manual ? 'current' : 'idle', version });
        return;
      }
      pendingVersion = version;
      if (pendingWork()) { blocked = true; status({ state: 'deferred', version }); return; }
      if (!startup && doc.visibilityState === 'hidden') return;
      if (recentlyAttempted(storageRead(), currentVersion, version)) { status({ state: 'retry', version }); return; }
      status({ state: 'updating', version });
      if (!await documentReady(version) || !await workerReady(version)) { status({ state: 'retry', version }); return; }
      if (disposed || pendingWork()) { if (!disposed) { blocked = true; status({ state: 'deferred', version }); } return; }
      if (!startup && doc.visibilityState === 'hidden') return;
      try { win.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ from: currentVersion, to: version, at: Date.now() })); } catch { /* Storage may be disabled. */ }
      navigating = true;
      win.location.replace(versionedUrl(win.location.href, version));
    } catch {
      // Offline opens use the last complete app; do not delete the cache,
      // session, drafts, or unsent changes while trying to update the shell.
      if (manual) status({ state: 'unavailable' });
    }
  }
  function check(options) {
    if (disposed || navigating) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = performCheck(options).finally(() => { inFlight = null; });
    return inFlight;
  }
  function start() {
    const foreground = () => { if (doc.visibilityState !== 'hidden') void check(); };
    if (nav.serviceWorker) {
      listen(nav.serviceWorker, 'controllerchange', foreground);
      listen(nav.serviceWorker, 'message', event => {
        if (event.data?.type !== 'LOUVESYNC_ACTIVATED' || !validVersion(event.data.version)) return;
        // Acknowledging the protocol tells the worker that this client handles
        // its own update, including postponing it for an unsaved edit/recording.
        event.ports[0]?.postMessage({ type: 'LOUVESYNC_CLIENT', version: currentVersion });
        foreground();
      });
    }
    listen(doc, 'visibilitychange', foreground);
    for (const name of ['focus', 'online', 'louvesync:resume']) listen(win, name, foreground);
    listen(win, 'pageshow', event => {
      if (event.persisted) { navigating = false; inFlight = null; }
      foreground();
    });
    intervalId = setInterval(foreground, interval);
    observer = new win.MutationObserver(() => {
      if (!pendingVersion || !blocked || pendingWork() || disposed || deferredCheck) return;
      blocked = false;
      deferredCheck = setTimeout(() => { deferredCheck = null; foreground(); }, 150);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-update-blocking'] });
    registrationPromise = registerWorker();
    return check({ startup: true });
  }
  return {
    start, check, get navigating() { return navigating; },
    dispose() { disposed = true; cleanups.forEach(cleanup => cleanup()); observer?.disconnect(); clearInterval(intervalId); clearTimeout(deferredCheck); },
  };
}

let updater;
export function startAppUpdates() {
  updater = createAppUpdater();
  return updater.start().then(() => !updater.navigating);
}
export function checkForAppUpdate() { return updater?.check({ manual: true }); }
