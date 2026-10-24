import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesIn(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const name = join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(directory, name));
    else if (entry.isFile() && name !== 'version.json' && !name.endsWith('.map')) files.push(name.replaceAll('\\', '/'));
  }
  return files.sort();
}
export async function finalizeBuild(directory = 'dist', commit = process.env.VERCEL_GIT_COMMIT_SHA) {
  const files = await filesIn(directory);
  const hash = createHash('sha256');
  // Include the worker and public assets too: a worker-only or icon change must
  // have its own release ID even when the main JS entry did not change.
  for (const file of files) hash.update(file).update(await readFile(join(directory, file)));
  const version = hash.digest('hex').slice(0, 20);
  const html = (await readFile(join(directory, 'index.html'), 'utf8')).replace('__LOUVESYNC_BUILD__', version);
  if (!html.includes(`name="louvesync-build" content="${version}"`)) throw new Error('Build metadata missing from index.html');
  const precache = [...new Set(['/index.html', '/manifest.webmanifest', '/logo_solo.png', '/pwa-192x192.png', '/pwa-512x512.png', ...files.filter(file => file.startsWith('assets/') && /\.(js|css)$/.test(file)).map(file => '/' + file)])];
  const worker = (await readFile(join(directory, 'sw.js'), 'utf8')).replace('__BUILD_VERSION__', version).replace('__PRECACHE_MANIFEST__', JSON.stringify(precache));
  await writeFile(join(directory, 'index.html'), html);
  await writeFile(join(directory, 'sw.js'), worker);
  await writeFile(join(directory, 'version.json'), JSON.stringify({ version, ...(commit ? { commit } : {}) }));
  return version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await finalizeBuild();
