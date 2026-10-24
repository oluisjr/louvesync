import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('dist/assets')).filter(file => /\.(js|css)$/.test(file)).map(file => '/assets/' + file);
const html = await readFile('dist/index.html', 'utf8');
const version = createHash('sha256').update(html + files.join(',')).digest('hex').slice(0, 16);
const worker = (await readFile('dist/sw.js', 'utf8')).replace('__BUILD_VERSION__', version).replace("'/logo_solo.png'", "'/logo_solo.png', " + files.map(file => JSON.stringify(file)).join(', '));
await writeFile('dist/sw.js', worker);
await writeFile('dist/version.json', JSON.stringify({ version }));
