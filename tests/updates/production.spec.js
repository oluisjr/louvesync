import { test, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, extname } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { finalizeBuild } from '../../scripts/finalize_build.js';

async function serveProduction() {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const profile={id:'offline-admin',name:'Admin Offline',avatar:'AO',role:'Líder de Louvor',instrument:'Vocal',color:'#7B3FF2',is_admin:true,status:'ativo',access_type:'ministry',schedule_enabled:true};
 const teammate={...profile,id:'offline-member',name:'Membro Offline',is_admin:false,role:'Vocal'};
 const state={active:resolve('dist'),prayers:new Map(),lostReceipt:false,writeCount:0,songs:[],profiles:[profile,teammate],events:[{id:'offline-event',date:today,time:'23:59',label:'Culto offline',type:'culto',theme:'Comunhão',event_songs:[],event_members:[{member_id:profile.id,confirmed:null}]}]};
 const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
 const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');let body={};
   if(req.method!=='GET'&&req.method!=='HEAD'){let raw='';for await(const chunk of req)raw+=chunk;body=raw?JSON.parse(raw):{};}
   if(url.pathname==='/api/version'){json(res,JSON.parse(await readFile(join(state.active,'version.json'),'utf8')));return;}
   if(url.pathname==='/api/community'){
    if(body.action==='public'){json(res,{ok:true,events:[{id:'public',title:'Encontro da comunidade',starts_at:'2050-12-25T18:00:00-03:00',published:true,time_defined:true}],prayers:[]});return;}
    if(body.action==='submit_prayer'){state.prayers.set(body.id,body);if(state.lostReceipt){json(res,{ok:false,error:'Recibo temporariamente indisponível'},503);return;}json(res,{ok:true,id:body.id});return;}
    json(res,{ok:true,events:[],prayers:[]});return;
   }
   if(url.pathname==='/api/notifications'){json(res,{ok:true,items:[],publicKey:'',pushConfigured:false});return;}
   if(url.pathname==='/api/changes'){json(res,{ok:true,requests:[],pendingCount:0,entries:[],hasMore:false});return;}
   if(url.pathname==='/api/activity'){json(res,{ok:true,members:[],serverTime:new Date().toISOString()});return;}
   if(url.pathname==='/api/attendance'){json(res,{ok:true,today,serverTime:new Date().toISOString(),sheets:[]});return;}
   if(url.pathname.startsWith('/rest/v1/')){
    const table=url.pathname.split('/').at(-1);
    if(table==='louvesync_login'){const input=body.p_payload,member=state.profiles.find(person=>person.id===input.memberId);json(res,input.pin==='SYNTHETIC_OFFLINE_PIN'&&member?{ok:true,member}:{ok:false});return;}
    if(table==='louvesync_member_settings'){json(res,{ok:true,members:state.profiles});return;}
    if(table==='members'){json(res,state.profiles);return;}
    if(table==='events'){json(res,state.events);return;}
    if(table==='songs'){json(res,state.songs);return;}
    if(table==='event_members'&&req.method==='PATCH'){
     if(req.headers['x-louvesync-member']!==profile.id||req.headers['x-louvesync-pin']!=='SYNTHETIC_OFFLINE_PIN'){json(res,{message:'Forbidden',code:'42501'},403);return;}
     state.writeCount++;state.events[0].event_members[0].confirmed=body.confirmed;json(res,[{member_id:profile.id}]);return;
    }
    json(res,[]);return;
   }
   const file=resolve(state.active,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname))),inside=relative(state.active,file);
   if(inside.startsWith('..')||isAbsolute(inside)){res.writeHead(400);res.end();return;}
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');
   res.setHeader('Cache-Control',url.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-store');
   res.end(await readFile(file));
  }catch{if(!res.destroyed){res.writeHead(404);res.end('Not found');}}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {state,origin:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function buildCopy(origin,changed=false){
 const directory=await mkdtemp(join(tmpdir(),'louvesync-offline-'));
 for(const item of ['src','public','data','index.html','package.json','vite.config.js'])await cp(item,join(directory,item),{recursive:true});
 await symlink(resolve('node_modules'),join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
 if(changed){const file=join(directory,'src/components/ChurchCommunity.jsx');await writeFile(file,(await readFile(file,'utf8')).replace('Um lugar para viver a fé em comunidade.','Comunidade atualizada para você.'));}
 await promisify(execFile)(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:directory,env:{...process.env,VITE_SUPABASE_URL:origin,VITE_SUPABASE_ANON_KEY:'synthetic-public-fixture-key'}});
 await finalizeBuild(join(directory,'dist'));return directory;
}
async function ready(page,origin){
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.church-audience')).toHaveText('Visitante');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await expect.poll(()=>page.evaluate(async()=>(await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
}
async function login(page,name='Admin Offline',pin='SYNTHETIC_OFFLINE_PIN'){
 await page.getByRole('button',{name:'Fazer login',exact:true}).click();
 await page.getByRole('button',{name:new RegExp(name)}).click();
 await page.getByLabel('Senha',{exact:true}).fill(pin);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
}
const queueSize=page=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('ls_sync_job:')).length);

test('actual production update waits for a prayer draft and the new coherent shell reads an unopened Bible chapter offline',async({browser})=>{
 test.setTimeout(90000);const host=await serveProduction();let directory,context;const errors=[];
 try{
  directory=await buildCopy(host.origin,true);
  context=await browser.newContext({serviceWorkers:'allow',viewport:{width:390,height:844}});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await ready(page,host.origin);
  await page.getByRole('button',{name:'Oração',exact:true}).click();const text=page.getByRole('textbox',{name:'Seu pedido de oração',exact:true});await text.fill('Rascunho preservado durante a atualização do aplicativo.');
  host.state.active=join(directory,'dist');await page.evaluate(()=>window.dispatchEvent(new Event('louvesync:resume')));
  await expect(page.locator('.update-notice')).toContainText('Será aplicada ao concluir');await expect(text).toHaveValue('Rascunho preservado durante a atualização do aplicativo.');
  await page.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(page.locator('.church-welcome-hero')).toContainText('Comunidade atualizada para você.');
  await page.evaluate(()=>localStorage.setItem('ls_bible_position',JSON.stringify({book:'genesis',chapter:50})));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.church-audience')).toHaveText('Visitante');
  await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(page.locator('[data-verse="26"]')).toContainText('José');
  await expect(page.getByLabel('Sincronização offline')).toContainText('Você está offline');expect(errors).toEqual([]);
 }finally{await context?.close();await host.close();if(directory)await rm(directory,{recursive:true});}
});

test('production visitor prayer survives an offline reopen and a lost upload acknowledgement never creates a second prayer',async({browser})=>{
 test.setTimeout(60000);const host=await serveProduction();let context;const errors=[];
 try{
  context=await browser.newContext({serviceWorkers:'allow'});await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await ready(page,host.origin);
  await context.setOffline(true);await page.getByRole('button',{name:'Oração',exact:true}).click();await page.getByRole('textbox',{name:'Seu pedido de oração',exact:true}).fill('Pedido privado preparado no aparelho sem internet.');await page.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(page.locator('.church-success')).toContainText('Pedido salvo neste aparelho');expect(host.state.prayers.size).toBe(0);
  const snapshot=await page.evaluate(async()=>({url:location.href,controller:navigator.serviceWorker.controller?.scriptURL,caches:await Promise.all((await caches.keys()).map(async name=>({name,html:!!(await(await caches.open(name)).match('/index.html'))})))}));try{await page.reload({waitUntil:'domcontentloaded'});}catch(error){throw new Error(error.message+' Snapshot: '+JSON.stringify(snapshot),{cause:error});}await expect(page.locator('.church-audience')).toHaveText('Visitante');await expect.poll(()=>queueSize(page)).toBe(1);await page.getByRole('button',{name:'Agenda',exact:true}).click();await expect(page.locator('.church-events-list')).toContainText('Encontro da comunidade');
  await context.setOffline(false);await expect.poll(()=>host.state.prayers.size).toBe(1);await expect.poll(()=>queueSize(page)).toBe(0);
  host.state.lostReceipt=true;await page.getByRole('button',{name:'Oração',exact:true}).click();await page.getByRole('textbox',{name:'Seu pedido de oração',exact:true}).fill('Pedido com recibo de upload interrompido para verificar duplicação.');await page.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(page.locator('.church-success')).toContainText('Pedido salvo neste aparelho');expect(host.state.prayers.size).toBe(2);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect.poll(()=>queueSize(page)).toBe(1);host.state.lostReceipt=false;await context.setOffline(false);await expect.poll(()=>queueSize(page)).toBe(0);expect(host.state.prayers.size).toBe(2);expect(errors).toEqual([]);
 }finally{await context?.close();await host.close();}
});

test('production ministry reopens offline with explicit PIN unlock and keeps its outbox isolated when another member logs in',async({browser})=>{
 test.setTimeout(90000);const host=await serveProduction();let directory,context;const errors=[];
 try{
  directory=await buildCopy(host.origin);host.state.active=join(directory,'dist');context=await browser.newContext({serviceWorkers:'allow',viewport:{width:412,height:915}});await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await ready(page,host.origin);await login(page);await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ls_offline:workspace:offline-admin')||'{}').events?.length||0)).toBe(1);
  await context.setOffline(true);await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect.poll(()=>queueSize(page)).toBe(1);expect(host.state.writeCount).toBe(0);
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.church-audience')).toHaveText('Visitante');await login(page,'Admin Offline','wrong-pin');await expect(page.getByText('PIN incorreto.',{exact:true})).toBeVisible();await page.getByLabel('Senha',{exact:true}).fill('SYNTHETIC_OFFLINE_PIN');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.church-audience')).toHaveText('Visitante');await context.setOffline(false);await login(page,'Membro Offline');await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();expect(host.state.writeCount).toBe(0);expect(await queueSize(page)).toBe(1);
  await page.getByRole('button',{name:'Sair',exact:true}).click();await login(page);await expect.poll(()=>host.state.writeCount).toBe(1);await expect.poll(()=>queueSize(page)).toBe(0);expect(host.state.events[0].event_members[0].confirmed).toBe(true);expect(errors).toEqual([]);
 }finally{await context?.close();await host.close();if(directory)await rm(directory,{recursive:true});}
});


test('production core content works offline without a download choice: schedule, lyrics, chords, metronome and full Bible',async({browser})=>{
 test.setTimeout(90000);const host=await serveProduction();let directory,context;const errors=[];
 try{
  host.state.songs=[{id:'offline-song',title:'Canção offline',artist:'Equipe de teste',cat:'adoracao',key:'C',bpm:90,time_signature:'4/4',tags:[],lyrics:'[C]Cantamos juntos em [G]oração\n[Am]Em comunhão vamos [F]adorar',vocal_keys:{}}];
  host.state.events[0].event_songs=[{id:1,song_id:'offline-song',item_type:'song',order_index:1,singer_member_id:'offline-admin',sequence:null}];
  directory=await buildCopy(host.origin);host.state.active=join(directory,'dist');context=await browser.newContext({serviceWorkers:'allow',viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo'});await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await ready(page,host.origin);await login(page);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ls_offline:workspace:offline-admin')||'{}').songs?.length||0)).toBe(1);
  await page.evaluate(()=>localStorage.setItem('ls_bible_position',JSON.stringify({book:'genesis',chapter:50})));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await login(page);await page.getByRole('button',{name:'Escala',exact:true}).click();await expect(page.getByRole('article',{name:'Culto offline',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mais',exact:true}).click();await page.getByRole('region',{name:'Mais',exact:true}).getByRole('button',{name:'Músicas',exact:true}).click();await page.getByRole('button',{name:'Abrir cifra de Canção offline',exact:true}).click();
  await expect(page.locator('.lyrics-content')).toContainText('Cantamos juntos em');await expect(page.locator('.lyrics-content b').first()).toHaveText('C');
  await page.getByRole('button',{name:'Somente letra',exact:true}).click();await expect(page.locator('.lyrics-content')).toContainText('Em comunhão vamos');await expect(page.locator('.lyrics-content b')).toHaveCount(0);
  await page.getByRole('button',{name:'Letra e acordes',exact:true}).click();await expect(page.locator('.lyrics-content b').first()).toHaveText('C');
  await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>page.locator('.ui-metronome-dot[data-active="true"]').count()).toBe(1);await expect(page.locator('.ui-metronome-status')).toContainText('90 BPM');await page.getByRole('button',{name:'Parar metrônomo',exact:true}).click();
  await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(page.locator('[data-verse="26"]')).toContainText('José');await page.screenshot({path:test.info().outputPath('core-content-offline.png')});expect(errors).toEqual([]);
 }finally{await context?.close();await host.close();if(directory)await rm(directory,{recursive:true});}
});
