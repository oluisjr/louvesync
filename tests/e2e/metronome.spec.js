import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const profile = {id:'vocal',name:'Vocal de teste',instrument:'Vocal',is_admin:true,status:'ativo'};
const songs = [
  {id:'metro-a',title:'Cifra do metrônomo',artist:'Teste',cat:'adoracao',key:'C',bpm:80,time_signature:'4/4',lyrics:'[C]Teste de [G]áudio',vocal_keys:{}},
  {id:'metro-b',title:'Segunda música',artist:'Teste',cat:'jubilo',key:'G',bpm:120,time_signature:'3/4',lyrics:'[G]Outra cifra',vocal_keys:{}},
];
const names = [...fs.readFileSync('src/lib/supabase.js','utf8').matchAll(/export async function (\w+)/g)].map(match=>match[1]);

async function open(browser, mode = 'gesture') {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(profile=>{localStorage.setItem('ls_profile',JSON.stringify(profile));localStorage.removeItem('ls_last_activity');},profile);
  await context.addInitScript(mode=>{
    const Native=window.AudioContext||window.webkitAudioContext;
    const record=window.__metroAudio={contexts:[],notes:[],resumeGestures:[],peak:0};
    if(mode==='unsupported'){window.AudioContext=undefined;window.webkitAudioContext=undefined;return;}
    let gesture=false;
    window.addEventListener('click',()=>{gesture=true;},true);
    window.addEventListener('click',()=>{gesture=false;});
    class GestureContext extends Native {
      constructor(options){
        super(options);this.unlocked=false;this.testId=record.contexts.length;record.contexts.push(this);
        this.analyser=super.createAnalyser();this.analyser.fftSize=256;this.analyser.connect(this.destination);
        const samples=new Float32Array(this.analyser.fftSize);
        this.monitor=setInterval(()=>{this.analyser.getFloatTimeDomainData(samples);for(const value of samples)record.peak=Math.max(record.peak,Math.abs(value));},5);
      }
      get state(){return this.unlocked?super.state:'suspended';}
      resume(){
        record.resumeGestures.push(gesture);
        if(!gesture||mode==='rejected')return Promise.reject(new Error('Áudio bloqueado pelo navegador'));
        this.unlocked=true;
        const resumed=super.resume();
        if(mode==='pending')return new Promise((resolve,reject)=>{record.release=()=>resumed.then(resolve,reject);});
        return resumed;
      }
      createGain(){
        const gain=super.createGain(), connect=gain.connect.bind(gain);
        gain.connect=(target,...args)=>connect(target===this.destination?this.analyser:target,...args);
        return gain;
      }
      createOscillator(){
        const oscillator=super.createOscillator(),start=oscillator.start.bind(oscillator);
        oscillator.start=at=>{if(!this.unlocked)throw new Error('AudioContext não liberado');record.notes.push({at,frequency:oscillator.frequency.value,context:this.testId});start(at);};
        return oscillator;
      }
      close(){clearInterval(this.monitor);return super.close();}
    }
    window.AudioContext=GestureContext;window.webkitAudioContext=GestureContext;
  },mode);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const code=`export const supabase=null;export const publicSupabaseConfig=null;window.__fixtureSongs=${JSON.stringify(songs)};window.__songLoads=0;
    export async function fetchSongs(){window.__songLoads++;return structuredClone(window.__fixtureSongs);}
    export async function fetchMembers(){return [${JSON.stringify(profile)}];}
    export async function fetchEvents(){return [];}
    ${names.filter(name=>!['fetchSongs','fetchMembers','fetchEvents'].includes(name)).map(name=>`export async function ${name}(){return null;}`).join('\n')}`;
  await page.route('**/src/lib/supabase.js*',route=>route.fulfill({contentType:'text/javascript',body:code}));
  await page.route('**/version.json',route=>route.fulfill({json:{version:'test'}}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('button',{name:'Mais',exact:true}).click();
  await page.getByRole('dialog',{name:'Mais',exact:true}).getByRole('button',{name:'Músicas',exact:true}).click();
  await page.getByText('Cifra do metrônomo',{exact:true}).click();
  return {page,errors,close:()=>context.close()};
}

test('metronome unlocks real Web Audio on activation and keeps live tempo through refresh and stage',async({browser})=>{
  const app=await open(browser);
  try{
    const {page}=app;
    expect(await page.evaluate(()=>window.__metroAudio.contexts.length)).toBe(0);
    await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toHaveCSS('background-image',/linear-gradient/);
    await expect.poll(()=>page.evaluate(()=>window.__metroAudio.peak)).toBeGreaterThan(0.01);
    expect(await page.evaluate(()=>window.__metroAudio.resumeGestures)).toEqual([true]);
    await expect.poll(()=>page.locator('.ui-metronome-dot[data-active="true"]').count()).toBe(1);
    await page.getByRole('spinbutton',{name:'BPM',exact:true}).fill('120');
    await expect(page.locator('.ui-metronome-status')).toContainText('120 BPM');
    const before=await page.evaluate(()=>window.__metroAudio.notes.length);
    await expect.poll(()=>page.evaluate(()=>window.__metroAudio.notes.length)).toBeGreaterThan(before+1);
    const notes=await page.evaluate(()=>window.__metroAudio.notes.slice(-2));
    expect(notes[1].at-notes[0].at).toBeCloseTo(0.5,5);
    const loads=await page.evaluate(()=>window.__songLoads);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(()=>page.evaluate(()=>window.__songLoads)).toBeGreaterThan(loads);
    expect(await page.evaluate(()=>window.__metroAudio.contexts.length)).toBe(1);
    await expect(page.getByRole('spinbutton',{name:'BPM',exact:true})).toHaveValue('120');
    await expect(page.locator('.ui-metronome')).toHaveAttribute('data-update-blocking','true');
    await page.screenshot({path:test.info().outputPath('metronome.png'),animations:'disabled'});
    await page.getByRole('button',{name:'Modo Palco 🖥️',exact:true}).click();
    await expect(page.locator('.stage-wrap .ui-metronome-status')).toContainText('120 BPM');
    await expect(page.locator('.stage-wrap').getByRole('button',{name:'Parar metrônomo',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>window.__metroAudio.contexts.length)).toBe(1);
    await page.screenshot({path:test.info().outputPath('metronome-stage.png'),animations:'disabled'});
    await page.getByRole('button',{name:'Parar metrônomo',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__metroAudio.contexts[0].state)).toBe('closed');
    const stopped=await page.evaluate(()=>window.__metroAudio.notes.length);
    await page.waitForTimeout(600);
    expect(await page.evaluate(()=>window.__metroAudio.notes.length)).toBe(stopped);
    await expect(page.locator('.ui-metronome-dot[data-active="true"]')).toHaveCount(0);
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await expect(page.getByRole('spinbutton',{name:'BPM',exact:true})).toHaveValue('120');
    await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>window.__metroAudio.resumeGestures)).toEqual([true,true]);
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__metroAudio.contexts[1].state)).toBe('closed');
    expect(app.errors).toEqual([]);
  }finally{await app.close();}
});

for(const mode of ['rejected','unsupported'])test('metronome reports '+mode+' audio without claiming to be active',async({browser})=>{
  const app=await open(browser,mode);
  try{
    await app.page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(app.page.getByRole('alert')).toBeVisible();
    await expect(app.page.getByRole('button',{name:'Ativar metrônomo',exact:true})).toHaveAttribute('aria-pressed','false');
    expect(await app.page.evaluate(()=>window.__metroAudio.notes.length)).toBe(0);
    expect(app.errors).toEqual([]);
  }finally{await app.close();}
});

test('leaving during pending activation cancels it; device interruption and app background can be restarted',async({browser})=>{
  const pending=await open(browser,'pending');
  try{
    await pending.page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(pending.page.getByRole('button',{name:'Ativando áudio…',exact:true})).toBeDisabled();
    await pending.page.getByRole('button',{name:'Voltar',exact:true}).click();
    await pending.page.evaluate(()=>window.__metroAudio.release());
    expect(await pending.page.evaluate(()=>window.__metroAudio.notes.length)).toBe(0);
    expect(pending.errors).toEqual([]);
  }finally{await pending.close();}
  const app=await open(browser);
  try{
    const {page}=app;
    await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toBeVisible();
    await page.evaluate(()=>window.__metroAudio.contexts[0].suspend());
    await expect(page.getByRole('alert')).toContainText('interrompido');
    await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toBeVisible();
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.getByRole('button',{name:'Ativar metrônomo',exact:true})).toHaveAttribute('aria-pressed','false');
    expect(await page.evaluate(()=>window.__metroAudio.contexts[1].state)).toBe('closed');
    expect(app.errors).toEqual([]);
  }finally{await app.close();}
});
