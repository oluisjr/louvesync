import { test, expect } from '@playwright/test';
import { deploymentServer } from './deploy-server.js';

async function controlled(page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
}
async function ready(page, version) {
  await expect(page.locator('#root')).toHaveText(version);
  await page.waitForFunction(() => window.__ready === true);
}
async function resume(page, name = 'louvesync:resume') {
  await page.bringToFront();
  await page.evaluate(name => window.dispatchEvent(name==='pageshow'?new PageTransitionEvent('pageshow',{persisted:true}):new Event(name)), name);
}

test('an installed shell resumes onto the new deployment and never caches version.json', async ({ browser }) => {
  const deploy = await deploymentServer();
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(deploy.url); await ready(page, 'build-a'); await controlled(page);
    await page.evaluate(async () => {
      localStorage.setItem('ls_profile', JSON.stringify({ id: 'fixture' }));
      localStorage.setItem('ls_sync_queue', JSON.stringify([{ id: 'pending', data: 'keep me' }]));
      const cache = await caches.open('louvesync-poisoned-version');
      await cache.put('/version.json', new Response(JSON.stringify({ version: 'build-a' })));
    });
    deploy.state.version = 'build-b';
    await resume(page); await ready(page, 'build-b'); await controlled(page);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ls_sync_queue')))).toEqual([{ id: 'pending', data: 'keep me' }]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ls_profile')))).toEqual({ id: 'fixture' });
    const response = await page.evaluate(async () => (await fetch('/version.json', { cache: 'no-store' })).json());
    expect(response.version).toBe('build-b');
    const cachedVersions = await page.evaluate(async () => {
      const own = (await caches.keys()).filter(key => key === 'louvesync-shell-build-a' || key === 'louvesync-shell-build-b');
      return Promise.all(own.map(async key => !!await (await caches.open(key)).match('/version.json')));
    });
    expect(cachedVersions.every(value => !value)).toBe(true);
    expect(deploy.requests.filter(request => request.path === '/version.json').every(request => request.cache?.includes('no-cache'))).toBe(true);
  } finally { await context.close(); await deploy.close(); }
});

test('a stale HTML document updates even when localStorage already says the new version was seen', async ({ browser }) => {
  const deploy = await deploymentServer();
  deploy.state.version = 'build-b'; deploy.state.staleNavigations = 1;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    await context.addInitScript(() => localStorage.setItem('ls_app_version', 'build-b'));
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-b');
    expect(Number(await page.evaluate(() => sessionStorage.getItem('loads')))).toBeLessThanOrEqual(3);
  } finally { await context.close(); await deploy.close(); }
});

for (const entry of ['/', '/index.html']) {
test(`a real cache-first legacy worker at ${entry} migrates automatically`, async ({ browser }) => {
  const deploy = await deploymentServer(); deploy.state.legacy = true;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url+entry); await ready(page, 'legacy'); await controlled(page);
    await page.evaluate(async () => { localStorage.setItem('ls_songs', '["keep"]'); const cache = await caches.open('louvesync-rehearsal-audio'); await cache.put('/audio-fixture', new Response('keep recording')); });
    deploy.state.legacy = false; deploy.state.version = 'build-b';
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await ready(page, 'build-b');
    expect(await page.evaluate(() => localStorage.getItem('ls_songs'))).toBe('["keep"]');
    expect(await page.evaluate(() => caches.has('louvesync-rehearsal-audio'))).toBe(true);
    expect(new URL(page.url()).searchParams.get('__ls_build')).toBe('build-b');
  } finally { await context.close(); await deploy.close(); }
});

}

test('offline launch retains the last complete deployment and updates automatically when connectivity returns', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    await context.addInitScript(() => {
      const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register=(...args)=>navigator.onLine?register(...args):Promise.reject(new DOMException('Offline registration failed','NetworkError'));
    });
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a'); await controlled(page);
    await context.setOffline(true); await page.reload(); await ready(page, 'build-a');
    expect(await page.evaluate(() => sessionStorage.getItem('ls_app_update_attempt'))).toBeNull();
    deploy.state.version = 'build-b'; await context.setOffline(false); await resume(page, 'online'); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});

test('two open clients update without discarding an active draft; saving releases the pending automatic update', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const editing = await context.newPage(); await editing.goto(deploy.url); await ready(editing, 'build-a'); await controlled(editing);
    await editing.evaluate(() => { const textarea = document.createElement('textarea'); textarea.value = 'Cifra ainda não salva'; textarea.dataset.updateBlocking = 'true'; document.body.append(textarea); });
    const other = await context.newPage(); await other.goto(deploy.url); await ready(other, 'build-a');
    deploy.state.version = 'build-b'; await resume(other); await ready(other, 'build-b');
    await editing.bringToFront(); await resume(editing);
    await expect.poll(() => editing.evaluate(() => window.__status)).toBe('deferred');
    await expect(editing.locator('#root')).toHaveText('build-a'); await expect(editing.locator('textarea')).toHaveValue('Cifra ainda não salva');
    await editing.evaluate(() => { localStorage.setItem('savedDraft', document.querySelector('textarea').value); document.querySelector('textarea').remove(); });
    await ready(editing, 'build-b'); expect(await editing.evaluate(() => localStorage.getItem('savedDraft'))).toBe('Cifra ainda não salva');
  } finally { await context.close(); await deploy.close(); }
});

test('an incomplete deployment never replaces the working offline cache and recovers once assets are available', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a'); await controlled(page);
    deploy.state.version = 'build-b'; deploy.state.html = 'build-a'; deploy.state.missing = '/assets/build-b.js';
    await resume(page); await expect.poll(() => page.evaluate(() => window.__status)).toBe('retry');
    await expect(page.locator('#root')).toHaveText('build-a');
    expect(await page.evaluate(async () => (await (await caches.open('louvesync-shell-build-a')).match('/index.html')).text())).toContain('content="build-a"');
    expect(await page.evaluate(() => sessionStorage.getItem('ls_app_update_attempt'))).toBeNull();
    deploy.state.html = null; deploy.state.missing = null;
    await resume(page); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});

test('a rollback and foreground/pageshow events use the published version rather than a monotonic version comparison', async ({ browser }) => {
  const deploy = await deploymentServer(); deploy.state.version = 'build-b';
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-b'); await controlled(page);
    deploy.state.version = 'build-a'; await resume(page, 'pageshow'); await ready(page, 'build-a');
  } finally { await context.close(); await deploy.close(); }
});

test('a broken navigation cannot cause an infinite refresh loop', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a'); await controlled(page);
    deploy.state.version = 'build-b'; deploy.state.stuckNavigations = true;
    await resume(page); await expect.poll(() => page.evaluate(() => window.__status)).toBe('retry');
    await expect(page.locator('#root')).toHaveText('build-a');
    expect(Number(await page.evaluate(() => sessionStorage.getItem('loads')))).toBeLessThanOrEqual(3);
    deploy.state.stuckNavigations = false;
    await page.clock.setFixedTime(new Date(Date.now() + 65000));
    await resume(page); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});

test('without service worker support a fresh network HTML still replaces a stale shell', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext();
  try {
    await context.addInitScript(() => Object.defineProperty(navigator, 'serviceWorker', { value: undefined }));
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a');
    deploy.state.version = 'build-b'; await resume(page); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});

test('failed version discovery does not mark an update as installed or erase offline data', async ({ browser }) => {
  const deploy = await deploymentServer(); deploy.state.manifestError = true;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a');
    expect(await page.evaluate(() => sessionStorage.getItem('ls_app_update_attempt'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('ls_app_version'))).toBeNull();
    deploy.state.manifestError = false; deploy.state.version = 'build-b'; await resume(page); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});

test('a missing new chunk fails installation without destroying the old offline shell', async ({ browser }) => {
  const deploy = await deploymentServer(); const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage(); await page.goto(deploy.url); await ready(page, 'build-a'); await controlled(page);
    deploy.state.version = 'build-b'; deploy.state.missing = '/assets/build-b.js';
    await resume(page); await expect.poll(() => page.evaluate(() => window.__status)).toBe('retry');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state)).toBe('activated');
    await context.setOffline(true); await page.reload(); await ready(page, 'build-a');
    deploy.state.missing = null; await context.setOffline(false); await resume(page, 'online'); await ready(page, 'build-b');
  } finally { await context.close(); await deploy.close(); }
});
