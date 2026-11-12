import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Deterministic exports of the approved ribbon mark. Requires ImageMagick 7.
// The artwork is preserved in branding/source; no generation service is used here.
const output = 'public/brand/v1';
const native = 'android/app/src/main/res';
const temporary = mkdtempSync(join(tmpdir(), 'louvesync-brand-'));
const exported = [];
const magick = (...args) => execFileSync('magick', args);
const png = (file, ...args) => {
  mkdirSync(join(file, '..'), { recursive: true });
  magick(...args, '-strip', '-depth', '8', 'PNG32:' + file);
  const [width, height] = magick('identify', '-format', '%w %h', file).toString().split(' ').map(Number);
  exported.push({ file, width, height });
};
try {
  mkdirSync(output, { recursive: true });
  const mark = join(temporary, 'mark.png');
  // Remove faint extraction noise, then antialias the original outline before
  // resizing. All variants retain identical proportions and negative space.
  magick('branding/source/mark-master.png', '-channel', 'A', '-threshold', '50%', '-morphology', 'Open', 'Disk:1', '-blur', '0x0.7', '+channel', '-trim', '+repage', mark);
  // Keep the ribbon folds visible in the monochrome marks, rather than
  // flattening the entire symbol into an indistinct solid silhouette.
  const monochrome = ['-colorspace', 'Gray', '-colorspace', 'sRGB', '-channel', 'RGB', '-level', '15%,85%'];
  const colors = { color: [], black: [...monochrome, '+level', '6%,36%', '+channel'], white: [...monochrome, '+level', '70%,100%', '+channel'] };
  for (const [name, treatment] of Object.entries(colors)) {
    png(`${output}/mark-${name}.png`, mark, ...treatment, '-resize', '440x440', '-background', 'none', '-gravity', 'center', '-extent', '512x512');
  }
  const whiteRibbon = join(temporary, 'white-ribbon.png');
  magick(mark, '-fill', 'white', '-colorize', '78%', whiteRibbon);
  const gradient = join(temporary, 'gradient.ppm');
  const pixels = Buffer.alloc(1024 * 1024 * 3);
  const palette = [[8, 205, 177], [35, 135, 231], [132, 39, 235]];
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const position = (x * 0.25 + y * 0.75) / 1023;
    const segment = position < 0.52 ? 0 : 1;
    const amount = segment === 0 ? position / 0.52 : (position - 0.52) / 0.48;
    for (let channel = 0; channel < 3; channel++) pixels[(y * 1024 + x) * 3 + channel] = Math.round(palette[segment][channel] * (1 - amount) + palette[segment + 1][channel] * amount);
  }
  writeFileSync(gradient, Buffer.concat([Buffer.from('P6\n1024 1024\n255\n'), pixels]));
  const tile = join(temporary, 'tile.png');
  const maskable = join(temporary, 'maskable.png');
  for (const [file, width] of [[tile, 780], [maskable, 660]]) {
    magick(gradient, '(', whiteRibbon, '-resize', width + 'x' + width, ')', '-gravity', 'center', '-compose', 'over', '-composite', file);
  }
  const tileShape = (file, size, round = false) => {
    const shape = round ? `circle ${size / 2},${size / 2} ${size / 2},0` : `roundrectangle 0,0 ${size - 1},${size - 1} ${size * 0.21},${size * 0.21}`;
    png(file, tile, '-resize', `${size}x${size}`, '(', '-size', `${size}x${size}`, 'canvas:black', '-fill', 'white', '-draw', shape, ')', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite');
  };
  for (const size of [192, 512]) tileShape(`${output}/icon-${size}.png`, size);
  png(`${output}/icon-maskable-512.png`, maskable, '-resize', '512x512');
  png(`${output}/apple-touch-icon.png`, tile, '-resize', '180x180');
  for (const [theme, variant] of [['light', 'black'], ['dark', 'white']]) {
    // A contrasting tile keeps the glyph readable even when the browser's
    // tab theme differs from the app's own light/dark setting.
    const background = theme === 'dark' ? '#0A0414' : '#F5F0FF';
    png(`${output}/favicon-${theme}.png`, '-size', '64x64', 'canvas:' + background, '(', `${output}/mark-${variant}.png`, '-resize', '64x64', ')', '-gravity', 'center', '-compose', 'over', '-composite', '(', '-size', '64x64', 'canvas:black', '-fill', 'white', '-draw', 'roundrectangle 0,0 63,63 14,14', ')', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite');
  }
  // Compatibility for old manifests, bookmarks and already cached HTML.
  for (const [from, to] of [
    ['icon-192.png', 'pwa-192x192.png'], ['icon-512.png', 'pwa-512x512.png'],
    ['apple-touch-icon.png', 'apple-touch-icon.png'], ['mark-color.png', 'logo_solo.png'],
    ['mark-color.png', 'louve.png'],
  ]) copyFileSync(join(output, from), join('public', to));
  png('public/favicon.png', `${output}/mark-color.png`, '-resize', '64x64');
  magick('public/favicon.png', '-define', 'icon:auto-resize=64,48,32,16', 'public/favicon.ico');
  const embedded = readFileSync('public/favicon.png').toString('base64');
  writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${embedded}"/></svg>\n`);
  // Legacy launchers and modern adaptive icons use the same artwork. The
  // adaptive foreground fits inside Android's central 66 dp safe circle.
  for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const directory = `${native}/mipmap-${density}`;
    const size = Math.round(48 * scale);
    for (const suffix of ['', '_round']) tileShape(`${directory}/ic_launcher${suffix}.png`, size, suffix === '_round');
    const foreground = Math.round(108 * scale), symbol = Math.round(foreground * 0.50);
    png(`${directory}/ic_launcher_foreground.png`, whiteRibbon, '-resize', `${symbol}x${symbol}`, '-background', 'none', '-gravity', 'center', '-extent', `${foreground}x${foreground}`);
  }
  for (const [directory, variant] of [['drawable-nodpi', 'black'], ['drawable-night-nodpi', 'white']]) {
    png(`${native}/${directory}/louve_icon.png`, `${output}/mark-${variant}.png`, '-resize', '298x298', '-background', 'none', '-gravity', 'center', '-extent', '512x512');
  }
  png(`${native}/drawable-nodpi/louvesync_monochrome.png`, mark, '-fill', 'white', '-colorize', '100%', '-resize', '216x216', '-background', 'none', '-gravity', 'center', '-extent', '432x432');
  for (const [name, variant, background] of [['light', 'black', '#F5F0FF'], ['dark', 'white', '#0A0414']]) {
    png(`branding/previews/${name}.png`, '-size', '512x512', 'canvas:' + background, '(', `${output}/mark-${variant}.png`, '-resize', '360x360', ')', '-gravity', 'center', '-compose', 'over', '-composite');
  }
  copyFileSync(`${output}/icon-512.png`, 'branding/previews/installation.png');
  writeFileSync('branding/exports.json', JSON.stringify({
    source: 'branding/source/mark-master.png',
    reference: 'branding/source/icon-reference.jpg',
    roles: { light: 'mark-black.png', dark: 'mark-white.png', login: 'mark-color.png', installation: 'icon-512.png', maskable: 'icon-maskable-512.png' },
    files: exported,
  }, null, 2) + '\n');
  console.log(`Exported ${exported.length} web and Android brand assets.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
