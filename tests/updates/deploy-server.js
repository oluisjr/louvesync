import http from 'node:http';
import { readFile } from 'node:fs/promises';

export async function deploymentServer() {
  const workerTemplate = await readFile('public/sw.js', 'utf8');
  const updater = await readFile('src/lib/app-updates.js', 'utf8');
  const state = { version: 'build-a', manifest: null, html: null, missing: null, legacy: false, staleNavigations: 0, stuckNavigations: false, manifestError: false };
  const requests = [];
  const html = (version, legacy = false) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="louvesync-build" content="${version}"></head><body><main id="root"></main><script type="module" src="/assets/${legacy ? 'legacy' : version}.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ path: url.pathname, query: url.search, cache: req.headers['cache-control'] });
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/version.json') {
      if (state.manifestError) { res.writeHead(503); res.end('Unavailable'); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ version: state.manifest || state.version })); return;
    }
    if (url.pathname === '/index.html' || url.pathname === '/' || url.pathname === '/escala') {
      let version = state.html || state.version;
      if (url.pathname !== '/index.html' && (state.staleNavigations > 0 || state.stuckNavigations)) { version = 'build-a'; state.staleNavigations--; }
      res.setHeader('Content-Type', 'text/html'); res.end(html(version, state.legacy)); return;
    }
    if (url.pathname === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      const precache = ['/index.html', '/manifest.webmanifest', '/assets/updater.js', `/assets/${state.legacy ? 'legacy' : state.version}.js`];
      res.end(state.legacy ? `const CACHE='louve-v1234';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/index.html','/assets/legacy.js'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')));});` : workerTemplate.replace('__BUILD_VERSION__', state.version).replace('__PRECACHE_MANIFEST__', JSON.stringify(precache))); return;
    }
    if (url.pathname === '/assets/updater.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(updater); return; }
    if (url.pathname === '/assets/legacy.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end("document.getElementById('root').textContent='legacy';window.__ready=true;navigator.serviceWorker.register('/sw.js');"); return;
    }
    if (/^\/assets\/build-[a-z]\.js$/.test(url.pathname)) {
      if (url.pathname === state.missing) { res.writeHead(404); res.end('Missing chunk'); return; }
      res.setHeader('Content-Type', 'application/javascript');
      res.end(`import {createAppUpdater} from '/assets/updater.js';
        const build=document.querySelector('meta[name="louvesync-build"]').content;
        sessionStorage.setItem('loads',Number(sessionStorage.getItem('loads')||0)+1);
        window.__status='idle';window.addEventListener('louvesync:update-status',event=>window.__status=event.detail.state);
        window.__updater=createAppUpdater({interval:3600000});
        await window.__updater.start();
        if(!window.__updater.navigating){document.getElementById('root').textContent=build;window.__ready=true;}
      `); return;
    }
    if (url.pathname === '/manifest.webmanifest') { res.setHeader('Content-Type', 'application/manifest+json'); res.end('{}'); return; }
    res.writeHead(404); res.end('Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, requests, url: `http://127.0.0.1:${server.address().port}`, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
