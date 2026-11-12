import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// File-format exports only: preserve the supplied tile, letter colors and folds.
// Crop the outer presentation margins; never redraw, extract or recolor the art.
const output = 'public/brand/v2', native = 'android/app/src/main/res';
const sources = {
  black: ['branding/source/icon-dark.jpg', '788x788+233+225'],
  white: ['branding/source/icon-light.jpg', '744x744+255+237'],
  color: ['branding/source/icon-reference.jpg', '852x852+200+178'],
};
const png = (file, source, size, crop) => {
  mkdirSync(join(file, '..'), { recursive: true });
  execFileSync('magick', [source, ...(crop ? ['-crop', crop, '+repage'] : []), '-resize', `${size}x${size}`, '-strip', '-depth', '8', 'PNG32:' + file]);
};
for (const [variant, [source, crop]] of Object.entries(sources)) png(`${output}/mark-${variant}.png`, source, 512, crop);
for (const size of [192, 512]) png(`${output}/icon-${size}.png`, `${output}/mark-color.png`, size);
png(`${output}/apple-touch-icon.png`, `${output}/mark-color.png`, 180);
png(`${output}/icon-maskable-512.png`, `${output}/mark-color.png`, 512);
for (const [theme, variant] of [['light', 'black'], ['dark', 'white']]) png(`${output}/favicon-${theme}.png`, `${output}/mark-${variant}.png`, 64);
// Old URLs remain available with the corrected, original artwork.
mkdirSync('public/brand/v1', { recursive: true });
for (const name of ['mark-black.png','mark-white.png','mark-color.png','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon-light.png','favicon-dark.png']) copyFileSync(`${output}/${name}`, `public/brand/v1/${name}`);
for (const [from, to] of [['mark-color.png','logo_solo.png'],['mark-color.png','louve.png'],['icon-192.png','pwa-192x192.png'],['icon-512.png','pwa-512x512.png'],['apple-touch-icon.png','apple-touch-icon.png']]) copyFileSync(`${output}/${from}`, 'public/'+to);
png('public/favicon.png', `${output}/mark-color.png`, 64);
execFileSync('magick', ['public/favicon.png','-define','icon:auto-resize=64,48,32,16','public/favicon.ico']);
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${readFileSync('public/favicon.png').toString('base64')}"/></svg>\n`);
for (const [density, scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
  for (const suffix of ['', '_round', '_foreground']) png(`${native}/mipmap-${density}/ic_launcher${suffix}.png`, `${output}/mark-color.png`, Math.round((suffix === '_foreground' ? 108 : 48)*scale));
}
png(`${native}/drawable-nodpi/louve_icon.png`, `${output}/mark-black.png`, 512);
png(`${native}/drawable-night-nodpi/louve_icon.png`, `${output}/mark-white.png`, 512);
for (const [name, variant] of [['light','black'],['dark','white'],['installation','color']]) copyFileSync(`${output}/mark-${variant}.png`, `branding/previews/${name}.png`);
writeFileSync('branding/exports.json', JSON.stringify({sources, output, operations:['crop outer margins','resize','encode PNG/ICO'],artwork:'Original rounded tiles and original letter colors; no recoloring or generated artwork.'},null,2)+'\n');
console.log('Exported original supplied tiles without recoloring.');
