import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { finalizeBuild } from '../scripts/finalize_build.js';
import { validVersion, buildFromDocument, versionedUrl, recentlyAttempted } from '../src/lib/app-updates.js';

test('update identity comes from the actual document, with strict manifest validation', () => {
  assert.equal(buildFromDocument({ querySelector: () => ({ content: 'build-a' }) }), 'build-a');
  assert.equal(buildFromDocument({ querySelector: () => ({ content: '__LOUVESYNC_BUILD__' }) }), null);
  for (const invalid of [null, {}, '', 'x'.repeat(129), 'https://other.test/', '<script>']) assert.equal(validVersion(invalid), false);
});
test('a versioned navigation preserves the current route, parameters and fragment', () => {
  const url = new URL(versionedUrl('https://louvesync.vercel.app/escala?event=123#cifra', 'build-b'));
  assert.equal(url.pathname, '/escala'); assert.equal(url.searchParams.get('event'), '123'); assert.equal(url.hash, '#cifra');
  assert.equal(url.searchParams.get('__ls_build'), 'build-b');
});
test('reload-loop protection is per actual source and target build and expires', () => {
  const attempt = { from: 'build-a', to: 'build-b', at: 1000 };
  assert.equal(recentlyAttempted(attempt, 'build-a', 'build-b', 2000), true);
  assert.equal(recentlyAttempted(attempt, 'build-b', 'build-a', 2000), false);
  assert.equal(recentlyAttempted(attempt, 'build-a', 'build-b', 62000), false);
  assert.equal(recentlyAttempted(attempt, 'build-a', 'build-b', 0), false);
});
async function fixture({ worker = 'worker-a', icon = 'icon-a' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'louvesync-build-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<html><head><meta name="louvesync-build" content="__LOUVESYNC_BUILD__"></head></html>');
  await writeFile(join(directory, 'assets/main-hash.js'), 'const app = "same JS";');
  await writeFile(join(directory, 'assets/print-hash.js'), 'const print = "lazy chunk";');
  await writeFile(join(directory, 'assets/main-hash.css'), 'body{}');
  await writeFile(join(directory, 'logo_solo.png'), icon);
  await writeFile(join(directory, 'manifest.webmanifest'), '{}');
  await writeFile(join(directory, 'sw.js'), `const version='__BUILD_VERSION__';const assets=__PRECACHE_MANIFEST__;const fixture='${worker}';`);
  return directory;
}
test('build output stamps identical HTML/worker/manifest identities and precaches lazy JS chunks', async () => {
  const directory = await fixture();
  try {
    const version = await finalizeBuild(directory, 'fixture-commit');
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    const worker = await readFile(join(directory, 'sw.js'), 'utf8');
    const manifest = JSON.parse(await readFile(join(directory, 'version.json'), 'utf8'));
    assert.ok(html.includes(`content="${version}"`)); assert.ok(worker.includes(`version='${version}'`));
    assert.equal(manifest.version, version); assert.equal(manifest.commit, 'fixture-commit');
    assert.ok(worker.includes('/assets/print-hash.js')); assert.ok(!worker.includes('__PRECACHE_MANIFEST__'));
  } finally { await rm(directory, { recursive: true }); }
});
test('identical inputs reproduce the same build; worker-only and public-image edits change it', async () => {
  const directories = await Promise.all([fixture(), fixture(), fixture({ worker: 'worker-b' }), fixture({ icon: 'icon-b' })]);
  try {
    const versions = await Promise.all(directories.map(directory => finalizeBuild(directory)));
    assert.equal(versions[0], versions[1]); assert.notEqual(versions[0], versions[2]); assert.notEqual(versions[0], versions[3]);
  } finally { await Promise.all(directories.map(directory => rm(directory, { recursive: true }))); }
});
test('Vercel never caches entry HTML, worker or update metadata; hashed assets stay immutable', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  const headers = path => {
    const result = {};
    for (const rule of config.headers) if (new RegExp('^' + rule.source + '$').test(path)) for (const header of rule.headers) result[header.key] = header.value;
    return result;
  };
  for (const path of ['/', '/index.html', '/sw.js', '/version.json', '/manifest.webmanifest', '/api/version']) {
    for (const key of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) assert.ok(headers(path)[key].includes('no-store'));
  }
  assert.ok(headers('/assets/main-123.js')['Cache-Control'].includes('immutable'));
  const spa = new RegExp('^' + config.rewrites[0].source + '$');
  assert.ok(spa.test('/escala'));
  for (const path of ['/sw.js', '/version.json', '/assets/main-123.js', '/api/version', '/manifest.webmanifest']) assert.equal(spa.test(path), false);
});
