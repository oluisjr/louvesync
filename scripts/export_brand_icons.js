import { chromium } from 'playwright';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Deterministic exports from the supplied artwork. Remove presentation margins
// and clip the tile's outer corners; never redraw or recolor the folded mark.
const output='public/brand/v2',native='android/app/src/main/res';
const sources={
  black:{file:'branding/source/icon-dark.jpg',crop:[250,228,760,760]},
  white:{file:'branding/source/icon-light.jpg',crop:[273,252,709,709]},
  color:{file:'branding/source/icon-reference.jpg',crop:[216,188,823,836]},
};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),args:['--no-sandbox','--disk-cache-size=1048576']});
try{
  const page=await browser.newPage();
  const render=async(source,size,maskable=false)=>{
    const base64=readFileSync(source.file).toString('base64');
    const result=await page.evaluate(async({base64,crop,size,maskable})=>{
      const image=new Image();image.src='data:image/jpeg;base64,'+base64;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const ctx=canvas.getContext('2d');
      if(maskable){const gradient=ctx.createLinearGradient(0,0,size,size);gradient.addColorStop(0,'#08c7b8');gradient.addColorStop(.5,'#238adc');gradient.addColorStop(1,'#8929e9');ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);}
      ctx.save();ctx.beginPath();ctx.roundRect(0,0,size,size,size*.238);ctx.clip();
      ctx.drawImage(image,...crop,0,0,size,size);ctx.restore();
      return canvas.toDataURL('image/png').split(',')[1];
    },{base64,crop:source.crop,size,maskable});
    return Buffer.from(result,'base64');
  };
  const save=(file,bytes)=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);};
  const png=async(file,variant,size,maskable=false)=>save(file,await render(sources[variant],size,maskable));
  for(const variant of Object.keys(sources))await png(`${output}/mark-${variant}.png`,variant,512);
  for(const size of [192,512])await png(`${output}/icon-${size}.png`,'color',size);
  await png(`${output}/apple-touch-icon.png`,'color',180);
  await png(`${output}/icon-maskable-512.png`,'color',512,true);
  for(const [theme,variant] of [['light','black'],['dark','white']])await png(`${output}/favicon-${theme}.png`,variant,64);
  mkdirSync('public/brand/v1',{recursive:true});
  for(const name of ['mark-black.png','mark-white.png','mark-color.png','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon-light.png','favicon-dark.png'])copyFileSync(`${output}/${name}`,`public/brand/v1/${name}`);
  for(const [from,to] of [['mark-color.png','logo_solo.png'],['mark-color.png','louve.png'],['icon-192.png','pwa-192x192.png'],['icon-512.png','pwa-512x512.png'],['apple-touch-icon.png','apple-touch-icon.png']])copyFileSync(`${output}/${from}`,'public/'+to);
  await png('public/favicon.png','color',64);
  const icons=[];for(const size of [16,32,48,64])icons.push({size,png:await render(sources.color,size)});
  const header=Buffer.alloc(6+16*icons.length);header.writeUInt16LE(1,2);header.writeUInt16LE(icons.length,4);
  let offset=header.length;for(let i=0;i<icons.length;i++){const {size,png:bytes}=icons[i],at=6+16*i;header[at]=header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length;}
  save('public/favicon.ico',Buffer.concat([header,...icons.map(icon=>icon.png)]));
  save('public/favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${readFileSync('public/favicon.png').toString('base64')}"/></svg>\n`);
  for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]])for(const suffix of ['','_round','_foreground'])await png(`${native}/mipmap-${density}/ic_launcher${suffix}.png`,'color',Math.round((suffix==='_foreground'?108:48)*scale));
  await png(`${native}/drawable-nodpi/louve_icon.png`,'black',512);
  await png(`${native}/drawable-night-nodpi/louve_icon.png`,'white',512);
  for(const [name,variant] of [['light','black'],['dark','white'],['installation','color']]){mkdirSync('branding/previews',{recursive:true});copyFileSync(`${output}/mark-${variant}.png`,`branding/previews/${name}.png`);}
  save('branding/exports.json',JSON.stringify({sources,output,operations:['crop presentation margins','clip transparent rounded corners','resize','encode PNG/ICO'],artwork:'Original supplied tile and folded mark, with no white presentation fringe. Maskable export has an edge-to-edge brand background.'},null,2)+'\n');
  console.log('Exported original marks with clean transparent corners and no white side margins.');
}finally{await browser.close();}