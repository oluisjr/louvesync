import { test, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { finalizeBuild } from '../../scripts/finalize_build.js';

// Two actual Vite production outputs. A real SW and the real React bootstrap
// perform the update; no app modules, worker messages or version checks are mocked.
test('actual production app applies a changed JS build after saving a draft and then boots it offline', async ({ browser }) => {
  test.setTimeout(60000);
  const directory = await mkdtemp(join(tmpdir(), 'louvesync-deploy-b-'));
  let server, context;
  try {
    for (const item of ['src', 'public', 'index.html', 'package.json', 'vite.config.js']) await cp(item, join(directory, item), { recursive: true });
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    const appPath = join(directory, 'src/App.jsx');
    const source = await readFile(appPath, 'utf8');
    expect(source).toContain('seu ministério em harmonia');
    await writeFile(appPath, source.replace('seu ministério em harmonia', 'Atualização de teste recebida'));
    await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: directory, env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
    await finalizeBuild(join(directory, 'dist'));
    const before = JSON.parse(await readFile('dist/version.json', 'utf8')).version;
    const after = JSON.parse(await readFile(join(directory, 'dist/version.json'), 'utf8')).version;
    expect(before).not.toBe(after);
    let active = resolve('dist');
    const errors = [];
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const file = resolve(active, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(active + '/')) { res.writeHead(400); res.end(); return; }
        res.setHeader('Cache-Control', url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
        res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        // No third-party APIs are used in this production-shell test.
        res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data: blob:");
        res.end(await readFile(file));
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 412, height: 915 } });
    await context.addInitScript(() => {
      // Seed once: subsequent reloads must retain the app's saved draft.
      if (!localStorage.getItem('ls_profile')) localStorage.setItem('ls_profile', JSON.stringify({ id: 'update-test', name: 'Teste', avatar: 'T', color: '#7B3FF2', is_admin: true }));
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-header')).toContainText('seu ministério em harmonia');
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    await page.getByRole('button', { name: 'Músicas', exact: true }).click();
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.getByRole('button', { name: '⌨️ Digitar cifra manualmente', exact: true }).click();
    await page.getByPlaceholder('Título da música *').fill('Cifra preservada durante atualização');
    await page.locator('textarea').fill('[C]Minha cifra [G]manual');
    active = join(directory, 'dist');
    await page.evaluate(() => window.dispatchEvent(new Event('louvesync:resume')));
    await expect(page.locator('.update-notice')).toContainText('Será aplicada ao concluir');
    await expect(page.locator('textarea')).toHaveValue('[C]Minha cifra [G]manual');
    expect(await page.locator('meta[name="louvesync-build"]').getAttribute('content')).toBe(before);
    await page.getByRole('button', { name: 'Salvar Música', exact: true }).click();
    await expect(page.locator('.app-header')).toContainText('Atualização de teste recebida');
    expect(await page.locator('meta[name="louvesync-build"]').getAttribute('content')).toBe(after);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ls_songs')).some(song => song.title === 'Cifra preservada durante atualização'))).toBe(true);
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-header')).toContainText('Atualização de teste recebida');
    await page.getByRole('button', { name: 'Músicas', exact: true }).click();
    await expect(page.getByText('Cifra preservada durante atualização', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context?.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(directory, { recursive: true });
  }
});
