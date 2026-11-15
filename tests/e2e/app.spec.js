import { test, expect, devices } from '@playwright/test';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { communityDatabase } from '../helpers/community-database.js';
import { mentionsDatabase } from '../helpers/mentions-database.js';
import { createMaestroHandler } from '../../server/maestro.js';
import { createChangesHandler } from '../../api/changes.js';
import { createAttendanceHandler } from '../../api/attendance.js';
import { strFromU8, unzipSync } from 'fflate';
import { encodeSequence, normalizeEvent } from '../../src/lib/domain.js';
import { decodeEventPreferences, encodeEventPreferences } from '../../src/lib/event-preferences.js';
import { isSetlistConfirmed, setlistSnapshot } from '../../src/lib/setlist-confirmation.js';
import { BIBLE_EDITION, bibleCacheKey } from '../../src/lib/bible-edition.js';
import { createBibleHandler } from '../../api/bible.js';
const names = [...fs.readFileSync('src/lib/supabase.js','utf8').matchAll(/export async function (\w+)/g)].map(match => match[1]);
const admin = { id: 'user-admin', name: 'Admin Teste', instrument: 'Vocal', role: 'Vocal', avatar: 'AT', color: '#7B3FF2', status: 'ativo', is_admin: true };
const member = { ...admin, id: 'user-member', name: 'Membro Teste', is_admin: false };
const songs = ['adoracao', 'ceia', 'jubilo'].map((cat, index) => ({ id: `song-${index}`, title: `Teste ${cat}`, artist: 'Fixture', cat, key: 'C', lyrics: '[C]Letra para [G]teste', bpm: 80, tags: [], time_signature: '4/4', vocal_keys: {} }));
const initialEvents = [{ id: 'event-1', date: '2026-10-25', time: '18:00:00', label: 'Culto de Teste', type: 'culto', event_songs: songs.map((song, index) => ({ id: index + 1, song_id: song.id, order_index: index + 1, item_type: 'song' })), event_members: [{ member_id: admin.id, confirmed: null }, { member_id: member.id, confirmed: null }] }];
const rehearsalEvent = () => ({ ...structuredClone(initialEvents[0]), id:'practice', date:'2026-10-24', time:'15:00:00', type:'ensaio', label:'Ensaio da equipe', event_members:[{member_id:admin.id,confirmed:true},{member_id:member.id,confirmed:true}] });

for(const theme of ['light','dark'])test(`every fresh entry starts as visitor with four destinations and a prominent login in ${theme}`,async({browser})=>{
 const app=await fixture(browser);
 try{
  const page=await app.open(admin,undefined,{visitorOnly:true,theme,device:{viewport:{width:390,height:844}}});
  const nav=page.getByRole('navigation',{name:'Navegação da comunidade'}),cta=page.getByRole('button',{name:'Fazer login',exact:true});
  await expect(page.locator('.church-audience')).toHaveText('Visitante');await expect(nav.getByRole('button')).toHaveText(['Início','Agenda','Oração','Bíblia']);
  expect((app.state.databaseReads||[]).filter(action=>['fetchSongs','fetchEvents','fetchMembers'].includes(action))).toEqual([]);
  expect(await page.evaluate(()=>localStorage.getItem('ls_actor_session'))).toBeNull();
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await expect(cta).toBeInViewport();
   const box=await cta.boundingBox();expect(box.height).toBeGreaterThanOrEqual(54);expect(box.width).toBeGreaterThan(width*.75);
   const colors=await cta.evaluate(element=>{const style=getComputedStyle(element);return {text:style.color,bg:style.backgroundImage};});expect(colors.bg).toContain('gradient');
   await page.screenshot({path:test.info().outputPath(`visitor-login-${theme}-${width}.png`),scale:'css'});
  }
  await app.login(page);await expect(page.locator('.app-header')).toBeVisible();await page.getByRole('button',{name:'Tema',exact:true}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.church-community')).toHaveAttribute('data-theme',theme==='dark'?'light':'dark');
  await page.reload();await expect(page.locator('.church-audience')).toHaveText('Visitante');await expect(nav.getByRole('button')).toHaveCount(4);await expect(cta).toBeVisible();
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('church-only member logs in explicitly and receives only the four community screens',async({browser})=>{
 const app=await fixture(browser),church={...member,access_type:'church_member',role:'Membro',instrument:'',schedule_enabled:false};app.state.members[1]=church;
 try{
  const page=await app.open(church,undefined,{visitorOnly:true,community:true});await app.login(page);
  await expect(page.locator('.church-audience')).toHaveText('Membro');const nav=page.getByRole('navigation',{name:'Navegação da comunidade'});await expect(nav.getByRole('button')).toHaveCount(4);
  for(const name of ['Escala','Mais','Mural','Admin'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sair da minha conta',exact:true}).click();await expect(page.locator('.church-audience')).toHaveText('Visitante');await expect(page.getByRole('button',{name:'Fazer login',exact:true})).toBeVisible();expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('visitor Bible stores chapters locally and reads the same chapter after an offline reload',async({browser})=>{
 const app=await fixture(browser);
 try{
  const page=await app.open(null),transport=await bibleTransport(page);await page.getByRole('button',{name:'Bíblia',exact:true}).click();
  const reader=page.locator('.ui-bible-reading');await expect(reader.locator('[data-verse="1"]')).toContainText('No princípio era a Palavra');
  await page.locator('.church-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;});const last=await reader.locator('[data-verse="51"]').boundingBox(),dock=await page.locator('.bible-chapter-dock').boundingBox(),nav=await page.locator('.church-navigation').boundingBox();expect(last.y+last.height).toBeLessThan(dock.y-8);expect(dock.y+dock.height).toBeLessThan(nav.y);await page.screenshot({path:test.info().outputPath('visitor-bible.png'),scale:'css'});const cached=await page.evaluate(key=>localStorage.getItem(key),bibleCacheKey('john',1));expect(JSON.parse(cached)).toHaveLength(51);
  transport.offline=true;await page.reload();await expect(page.locator('.church-audience')).toHaveText('Visitante');await page.getByRole('button',{name:'Bíblia',exact:true}).click();
  await expect(reader).toContainText('Leitura disponível offline.');await expect(reader.locator('[data-verse="1"]')).toContainText('No princípio era a Palavra');expect(await page.evaluate(key=>localStorage.getItem(key),bibleCacheKey('john',1))).toBe(cached);expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('schedule mentions notify another signed-in device and reopen the exact event with durable read receipts',async({browser})=>{
 const app=await fixture(browser);
 try{
  const leader=await app.open(admin,undefined,{mentions:true}),teammate=await app.open(member,undefined,{mentions:true});
  await leader.getByRole('button',{name:'Escala',exact:true}).click();await leader.getByRole('button',{name:'Editar evento Culto de Teste',exact:true}).click();const editor=leader.getByRole('dialog',{name:'Editar evento',exact:true});
  const notes=editor.getByRole('textbox',{name:'Mensagem para a equipe',exact:true});await notes.fill('Confira a passagem, @mem');await editor.getByRole('option',{name:/Membro Teste/}).click();
  await expect(notes).toHaveValue('Confira a passagem, @Membro Teste ');await editor.getByRole('button',{name:'Salvar Alterações',exact:true}).click();await expect(editor).toHaveCount(0);
  await teammate.getByRole('button',{name:'Notificações',exact:true}).click();const inbox=teammate.getByRole('dialog',{name:'Notificações',exact:true});await inbox.getByRole('button',{name:'Atualizar',exact:true}).click();const notice=inbox.getByRole('article').filter({hasText:'Você foi mencionado na escala'});await expect(notice).toContainText('Admin Teste marcou você em Culto de Teste');
  await notice.getByRole('button',{name:'Ver escala',exact:true}).click();await expect(teammate.getByRole('dialog',{name:'Culto de Teste',exact:true})).toContainText('Confira a passagem, @Membro Teste');
  await expect.poll(async()=>(await app.communityQuery("select read_at from louvesync_notifications where member_id=$1 and kind='mention'",[member.id])).rows[0]?.read_at!=null).toBe(true);
  await app.reload(teammate);await teammate.getByRole('button',{name:'Notificações',exact:true}).click();await expect(inbox.getByRole('article').filter({hasText:'Você foi mencionado na escala'}).getByRole('button',{name:'Marcar como lida',exact:true})).toHaveCount(0);expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('mural posts and member comments mention ministry recipients and notifications focus their source',async({browser})=>{
 const app=await fixture(browser);app.state.members.push({...member,id:'church-only',name:'Só Igreja',access_type:'church_member',role:'Membro',instrument:'',schedule_enabled:false},{...member,id:'inactive',name:'Inativo',status:'inativo'});
 try{
  const leader=await app.open(admin,undefined,{mentions:true,theme:'dark'}),teammate=await app.open(member,undefined,{mentions:true});await navigate(leader,'Mural');await leader.getByRole('button',{name:'Novo Aviso',exact:true}).click();const composer=leader.getByRole('dialog',{name:'Novo Comunicado',exact:true});await composer.getByPlaceholder('Título do post *').fill('Preparação com marcações');
  await composer.getByRole('button',{name:'Marcar integrantes',exact:true}).click();await expect(composer.getByRole('option',{name:/Só Igreja|Inativo/})).toHaveCount(0);await composer.getByRole('option',{name:/Membro Teste/}).click();await composer.getByRole('textbox',{name:'Comunicado',exact:true}).press('End');await composer.getByRole('textbox',{name:'Comunicado',exact:true}).pressSequentially('vamos ensaiar a transição.');
  await expect(composer.getByRole('listbox')).toHaveCount(0);await leader.screenshot({path:test.info().outputPath('mural-mention-composer.png'),scale:'css'});await composer.getByRole('button',{name:'Publicar',exact:true}).click();await expect(composer).toHaveCount(0);
  await teammate.getByRole('button',{name:'Notificações',exact:true}).click();let inbox=teammate.getByRole('dialog',{name:'Notificações',exact:true});await inbox.getByRole('button',{name:'Atualizar',exact:true}).click();await inbox.getByRole('article').filter({hasText:'Você foi mencionado no mural'}).getByRole('button',{name:'Ver comunicado',exact:true}).click();const post=teammate.locator('.community-post').filter({hasText:'Preparação com marcações'});await expect(post).toBeFocused();await post.getByRole('button',{name:'Comentar',exact:true}).click();
  await post.getByRole('textbox',{name:'Escrever comentário em Preparação com marcações',exact:true}).fill('Combinado, @adm');await post.getByRole('option',{name:/Admin Teste/}).click();await post.getByRole('button',{name:'Enviar',exact:true}).click();
  await leader.getByRole('button',{name:'Notificações',exact:true}).click();inbox=leader.getByRole('dialog',{name:'Notificações',exact:true});await inbox.getByRole('button',{name:'Atualizar',exact:true}).click();await inbox.getByRole('article').filter({hasText:'Você foi mencionado em um comentário'}).getByRole('button',{name:'Ver comunicado',exact:true}).click();
  const comment=leader.locator('.community-comment').filter({hasText:'Combinado, @Admin Teste'});await expect(comment).toBeFocused();await expect(comment.locator('.mention-token')).toHaveText('@Admin Teste');await leader.screenshot({path:test.info().outputPath('mural-comment-mention.png'),scale:'css'});expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

for(const profile of [admin,member])test(`rehearsal events open the studio and use service and custom event repertoires for ${profile.is_admin?'admins':'members'}`,async({browser})=>{
  const app=await fixture(browser);
  app.state.events.unshift(rehearsalEvent());
  app.state.events.push({...structuredClone(initialEvents[0]),id:'special',date:'2026-10-26',type:'outro',label:'Encontro com músicas',event_songs:[{id:20,song_id:'song-1',item_type:'song'}]},
    {...structuredClone(initialEvents[0]),id:'empty',date:'2026-10-26',type:'outro',label:'Reunião sem músicas',event_songs:[]});
  try{
    const page=await app.open(profile);
    const homeCard=page.locator('.gL1').filter({has:page.getByText('Ensaio da equipe',{exact:true})});
    await expect(homeCard).not.toContainText('Teste adoracao');
    await homeCard.getByRole('button',{name:'Abrir Ensaio',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Estúdio',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Escolher evento do ensaio',exact:true})).toContainText('Culto de Teste');
    await expect(page.getByRole('region',{name:'Músicas do ensaio',exact:true}).getByRole('button')).toHaveCount(3);
    await page.getByRole('button',{name:'Escolher evento do ensaio',exact:true}).click();
    const picker=page.getByRole('combobox',{name:'Evento do ensaio',exact:true});
    await expect(picker.locator('option')).toHaveText(['Selecione um evento','Culto de Teste · 25/10/2026','Encontro com músicas · 26/10/2026']);
    await picker.selectOption('special');
    const repertoire=page.getByRole('region',{name:'Músicas do ensaio',exact:true});
    await expect(repertoire.getByRole('button')).toHaveCount(1);
    await repertoire.getByRole('button',{name:'Teste ceia',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Tocando agora: Teste ceia',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    const card=page.locator('.gL1').filter({has:page.getByText('Ensaio da equipe',{exact:true})});
    await expect(card).not.toContainText('Teste adoracao');
    await expect(card.getByRole('button',{name:'Ver detalhes →',exact:true})).toHaveCount(0);
    await expect(card.getByRole('button',{name:'Editar evento Ensaio da equipe',exact:true})).toHaveCount(profile.is_admin?1:0);
    await card.getByRole('button',{name:'Abrir Ensaio →',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Estúdio',exact:true})).toBeVisible();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('rehearsal editing clears legacy song links while retaining the team and Sunday creation no longer copies music',async({browser})=>{
  const app=await fixture(browser);
  const legacy=rehearsalEvent();legacy.event_songs.push({id:10,item_type:'note',note_text:'Chegar às 15h',order_index:4});app.state.events.unshift(legacy);
  try{
    const page=await app.open();
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Editar evento Ensaio da equipe',exact:true}).click();
    const edit=page.getByRole('dialog',{name:'Editar evento',exact:true});
    await expect(edit.getByRole('tab',{name:'Setlist',exact:true})).toHaveCount(0);
    await expect(edit).toContainText('Na tela Ensaio, a equipe acessa as músicas dos cultos');
    await edit.getByRole('tab',{name:'Equipe',exact:true}).click();
    await expect(edit.getByRole('button',{name:'Admin Teste',exact:true})).toHaveAttribute('aria-pressed','true');
    await edit.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    await expect(edit).toHaveCount(0);
    const saved=app.state.events.find(event=>event.id==='practice');
    expect(saved.event_songs.filter(row=>row.song_id)).toHaveLength(0);
    expect(saved.event_songs.find(row=>row.id===10).note_text).toBe('Chegar às 15h');
    expect(saved.event_members).toEqual([{member_id:admin.id,confirmed:true},{member_id:member.id,confirmed:true}]);
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    const create=page.getByRole('dialog',{name:'Novo evento',exact:true});
    await create.getByLabel('Nome do evento',{exact:true}).fill('Novo culto de domingo');
    await create.getByLabel('Data',{exact:true}).fill('2026-11-01');
    await create.getByRole('tab',{name:'Setlist',exact:true}).click();
    await create.getByRole('button',{name:'Selecionar Teste adoracao',exact:true}).click();
    await create.getByRole('button',{name:'Criar Compromisso',exact:true}).click();
    await expect(create).toHaveCount(0);
    const sunday=app.state.events.find(event=>event.label==='Novo culto de domingo');
    const saturday=app.state.events.find(event=>event.type==='ensaio'&&event.date==='2026-10-31');
    expect(sunday.event_songs.filter(row=>row.song_id).map(row=>row.song_id)).toEqual(['song-0']);
    expect(saturday.event_songs.filter(row=>row.song_id)).toHaveLength(0);
    expect(saturday.event_members.map(row=>row.member_id)).toEqual(sunday.event_members.map(row=>row.member_id));
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    const direct=page.getByRole('dialog',{name:'Novo evento',exact:true});
    await direct.getByLabel('Nome do evento',{exact:true}).fill('Ensaio sem cópia');
    await direct.getByLabel('Data',{exact:true}).fill('2026-10-30');
    await direct.getByRole('tab',{name:'Setlist',exact:true}).click();
    await direct.getByRole('button',{name:'Selecionar Teste ceia',exact:true}).click();
    await direct.getByRole('tab',{name:'Detalhes',exact:true}).click();
    await direct.getByRole('button',{name:'Ensaio',exact:true}).click();
    await expect(direct.getByRole('tab',{name:'Setlist',exact:true})).toHaveCount(0);
    await direct.getByRole('button',{name:'Criar Compromisso',exact:true}).click();
    await expect(direct).toHaveCount(0);
    expect(app.state.events.find(event=>event.label==='Ensaio sem cópia').event_songs.filter(row=>row.song_id)).toHaveLength(0);
    expect(app.state.songs).toHaveLength(songs.length);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`3D inventory uses real totals and supports search, filters and custody in ${theme} theme`,async({browser})=>{
  const app=await fixture(browser);
  app.state.equipment=[{id:'mic',name:'Microfone SM58',brand:'Shure',serial_number:'M-01',status:'Disponível'},
    {id:'keyboard',name:'Teclado PSR',brand:'Yamaha',status:'Em uso',custodian_id:member.id},
    {id:'guitar',name:'Violão acústico',brand:'Takamine',status:'Manutenção'},
    {id:'mixer',name:'Mesa de som',brand:'Behringer',status:'Disponível'},
    {id:'drums',name:'Bateria acústica',brand:'Pearl',status:'Disponível'},
    {id:'speaker',name:'Caixa de som',brand:'JBL',status:'Disponível'}];
  try{
    const page=await app.open(admin,undefined,{theme,device:{viewport:{width:390,height:844}}});
    await navigate(page,'Patrimônio');
    const inventory=page.getByRole('region',{name:'Patrimônio',exact:true}),summary=page.getByRole('region',{name:'Resumo do inventário',exact:true});
    await expect(summary).toContainText('6 equipamentos');
    await expect(summary).toContainText('4 disponíveis');
    await expect(summary).toContainText('1 em uso');
    await expect(summary).toContainText('1 em manutenção');
    await expect(inventory.getByRole('article')).toHaveCount(6);
    await expect(inventory.getByRole('article',{name:'Teclado PSR',exact:true})).toContainText('Custódia: Membro Teste');
    for(const [name,src] of [['Microfone SM58','/images/equipment/microphone.webp'],['Teclado PSR','/images/equipment/keyboard.webp'],['Violão acústico','/images/equipment/guitar.webp'],['Mesa de som','/images/equipment/mixer.webp'],['Bateria acústica','/images/equipment/drums.webp'],['Caixa de som','/images/equipment/speaker.webp']]){
      const image=inventory.getByRole('article',{name,exact:true}).locator('img');
      await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',src);
      await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    }
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:test.info().outputPath(`inventory-${theme}-${width}.png`),scale:'css'});
      expect(await inventory.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      const last=inventory.getByRole('article').last();await last.scrollIntoViewIfNeeded();
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      expect((await last.boundingBox()).y+(await last.boundingBox()).height).toBeLessThan((await page.locator('.app-nav .gNav').boundingBox()).y-8);
    }
    const filters=inventory.getByRole('group',{name:'Filtrar por status'});
    await filters.getByRole('button',{name:'Manutenção',exact:true}).click();
    await expect(inventory.getByRole('article')).toHaveCount(1);
    await expect(inventory.getByRole('article')).toHaveAccessibleName('Violão acústico');
    await expect(summary).toContainText('6 equipamentos');
    await filters.getByRole('button',{name:'Todos',exact:true}).click();
    await inventory.getByRole('searchbox',{name:'Buscar equipamento'}).fill('yamaha');
    await expect(inventory.getByRole('article')).toHaveCount(1);
    await expect(inventory.getByRole('article')).toHaveAccessibleName('Teclado PSR');
    await inventory.getByRole('searchbox',{name:'Buscar equipamento'}).fill('inexistente');
    await expect(inventory.getByText('Nenhum equipamento encontrado',{exact:true})).toBeVisible();
    await inventory.getByRole('searchbox',{name:'Buscar equipamento'}).fill('');
    await inventory.getByRole('article',{name:'Violão acústico',exact:true}).getByRole('button',{name:'Editar',exact:true}).click();
    const edit=page.getByRole('dialog',{name:'Editar equipamento',exact:true});
    await edit.getByLabel('Status',{exact:true}).selectOption('Disponível');
    await edit.getByRole('button',{name:'Salvar',exact:true}).click();await expect(edit).toHaveCount(0);
    await expect(summary).toContainText('5 disponíveis');await expect(summary).toContainText('0 em manutenção');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('members can consult the 3D inventory without equipment mutation controls',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(member);await navigate(page,'Patrimônio');
    const inventory=page.getByRole('region',{name:'Patrimônio',exact:true});
    await expect(inventory.getByRole('article')).toHaveCount(1);
    await expect(inventory.getByRole('button',{name:'Adicionar equipamento',exact:true})).toHaveCount(0);
    await expect(inventory.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);
    await inventory.getByRole('group',{name:'Filtrar por status'}).getByRole('button',{name:'Disponível',exact:true}).click();
    await expect(inventory.getByRole('article')).toHaveCount(1);
    expect(app.state.equipmentRequests||[]).toEqual([]);expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

async function navigate(page, name) {
  if (['Início','Escala','Mural','Bíblia'].includes(name)) {
    await page.getByRole('button',{name,exact:true}).click();
    return;
  }
  await page.getByRole('button',{name:'Mais',exact:true}).click();
  const menu=page.getByRole('region',{name:'Mais',exact:true});
  await menu.getByRole('button',{name,exact:true}).click();
  await expect(menu).toHaveCount(0);
}

for(const theme of ['light','dark'])test(`3D repertoire preserves songs, favorites, filters, editing and chart navigation in ${theme} theme`,async({browser})=>{
  const app=await fixture(browser);
  app.state.songs[0]={...app.state.songs[0],artist:'João da Equipe',key:'D'};
  app.state.songs.push({...songs[0],id:'hino',title:'Hino para o culto de domingo',cat:'hinario',key:'G'},
    {...songs[0],id:'custom',title:'Arranjo acústico',cat:'Acústico',key:'Eb'},
    {...songs[0],id:'uncategorized',title:'Música ainda sem categoria',cat:null});
  try{
    const page=await app.open(admin,undefined,{theme,device:{viewport:{width:390,height:844}}});
    await navigate(page,'Músicas');
    const library=page.getByRole('region',{name:'Repertório',exact:true}),summary=library.getByRole('region',{name:'Resumo do repertório',exact:true});
    await expect(summary).toContainText('6 músicas');await expect(summary).toContainText('6 categorias');
    await expect(summary).toContainText('0 favoritas');await expect(library.getByRole('article')).toHaveCount(6);
    await expect.poll(()=>summary.locator('img').evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    await expect(summary.locator('img')).toHaveAttribute('src','/images/more/music.webp');
    await expect(page.locator('.app-nav [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.app-nav [aria-current="page"]')).toHaveAccessibleName('Mais');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:test.info().outputPath(`repertoire-${theme}-${width}.png`),scale:'css'});
      expect(await library.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      const last=library.getByRole('article').last(),lastBox=await last.boundingBox(),navBox=await page.locator('.app-nav .gNav').boundingBox();
      expect(lastBox.y+lastBox.height).toBeLessThan(navBox.y-8);
      expect(navBox.y-lastBox.y-lastBox.height).toBeLessThan(36);
    }
    await library.getByRole('button',{name:'Favoritar Teste adoracao',exact:true}).click();
    await library.getByRole('button',{name:'Favoritar Teste ceia',exact:true}).click();
    await expect(summary).toContainText('2 favoritas');
    const categories=library.getByRole('group',{name:'Filtrar por categoria'});
    await categories.getByRole('button',{name:'Favoritas',exact:true}).click();
    await expect(library.getByRole('article')).toHaveCount(2);
    await expect(library.getByRole('region',{name:'Adoração',exact:true})).toBeVisible();
    await expect(library.getByRole('region',{name:'Santa Ceia',exact:true})).toBeVisible();
    await library.getByRole('combobox',{name:'Filtrar por tom',exact:true}).selectOption('D');
    await expect(library.getByRole('article')).toHaveCount(1);
    const search=library.getByRole('searchbox',{name:'Buscar música ou artista',exact:true});
    await search.fill(' JOAO ');await expect(library.getByRole('article')).toHaveCount(1);
    await search.fill('inexistente');await expect(library.getByText('Nenhuma música encontrada',{exact:true})).toBeVisible();
    await library.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await expect(search).toHaveValue('');await expect(library.getByRole('combobox',{name:'Filtrar por tom'})).toHaveValue('');
    await expect(library.getByRole('article')).toHaveCount(6);
    await categories.getByRole('button',{name:'Acústico',exact:true}).click();
    await expect(library.getByRole('article')).toHaveAccessibleName('Arranjo acústico');
    await categories.getByRole('button',{name:'Sem categoria',exact:true}).click();
    await expect(library.getByRole('article')).toHaveAccessibleName('Música ainda sem categoria');
    await app.reload(page);await navigate(page,'Músicas');
    await expect(summary).toContainText('2 favoritas');
    await library.getByRole('button',{name:'Editar Teste adoracao',exact:true}).click();
    await expect(page.getByText('Editar Música',{exact:true})).toBeVisible();
    await expect(page.getByPlaceholder('Título da música *')).toHaveValue('Teste adoracao');
    await page.getByPlaceholder('Título da música *').fill('Teste adoracao atualizado');
    await page.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    await expect(page.getByPlaceholder('Título da música *')).toHaveCount(0);
    expect(app.state.songs).toHaveLength(6);expect(app.state.songs[0].title).toBe('Teste adoracao atualizado');
    await categories.getByRole('button',{name:'Adoração',exact:true}).click();
    const open=library.getByRole('button',{name:'Abrir cifra de Teste adoracao atualizado',exact:true});
    await open.focus();await page.keyboard.press('Enter');
    await expect(page.locator('.lyrics-content')).toContainText('Letra para');
    await expect(page.locator('.app-nav')).toHaveCount(0);
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(categories.getByRole('button',{name:'Adoração',exact:true})).toHaveAttribute('aria-pressed','true');
    await categories.getByRole('button',{name:'Favoritas',exact:true}).click();
    await library.getByRole('button',{name:'Remover Teste adoracao atualizado dos favoritos',exact:true}).click();
    await expect(library.getByRole('article')).toHaveCount(1);
    await library.getByRole('button',{name:'Remover Teste ceia dos favoritos',exact:true}).click();
    await expect(library.getByText('Suas favoritas ficam aqui',{exact:true})).toBeVisible();
    await library.getByRole('button',{name:'Ver todas as músicas',exact:true}).click();
    await expect(library.getByRole('article')).toHaveCount(6);expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('an empty repertoire offers the actual add-song flow without invented library counts',async({browser})=>{
  const app=await fixture(browser);app.state.songs=[];
  try{
    const page=await app.open();await navigate(page,'Músicas');
    const library=page.getByRole('region',{name:'Repertório',exact:true});
    await expect(library.getByRole('region',{name:'Resumo do repertório'})).toContainText('0 músicas');
    await expect(library.getByText('Seu repertório começa aqui',{exact:true})).toBeVisible();
    await library.getByRole('button',{name:'Adicionar música',exact:true}).click();
    await expect(page.getByText('Nova Música',{exact:true})).toBeVisible();
    await expect(page.getByPlaceholder('Título da música *')).toBeVisible();expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('saved dark theme covers the document before application JavaScript loads',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>localStorage.setItem('ls_theme','dark'));
    const page=await context.newPage();
    await page.route('**/src/main.jsx',route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('status')).toHaveText('Abrindo LouveSync…');
    for(const selector of ['html','body'])await expect(page.locator(selector)).toHaveCSS('background-color','rgb(29, 27, 45)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#1D1B2D');
  }finally{await context.close();}
});

for(const theme of ['light','dark']){
  test(`app fills the visible screen and clears the floating menu with simulated iPhone safe areas in ${theme} theme`,async({browser})=>{
    const app=await fixture(browser);
    app.state.events.push(...Array.from({length:6},(_,index)=>({...structuredClone(initialEvents[0]),id:'extra-event-'+index,label:'Evento extra '+index})));
    try{
      const page=await app.open(admin,undefined,{device:{...devices['iPhone 13'],viewport:{width:390,height:844}},theme,standalone:true});
      await page.addStyleTag({content:':root { --app-safe-top: 47px; --app-safe-bottom: 34px; }'});
      const root=page.locator('#root'),shell=page.locator('.app-shell'),header=page.locator('.app-header'),main=page.locator('[data-main-scroll]'),nav=page.locator('.app-nav .gNav');
      const canvas=theme==='dark'?'rgb(29, 27, 45)':'rgb(234, 248, 250)';
      for(const selector of ['html','body','.app-header'])await expect(page.locator(selector)).toHaveCSS('background-color',canvas);
      await expect(header).toHaveCSS('backdrop-filter','none');
      await expect(header).toHaveCSS('padding-top','58px');
      const expectFrame=async(height,top=0)=>{
        await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(height);
        await expect.poll(async()=>Math.round((await root.boundingBox()).y)).toBe(top);
        expect(Math.round((await shell.boundingBox()).height)).toBe(height);
        const box=await nav.boundingBox();
        expect(Math.abs(top+height-(box.y+box.height)-34)).toBeLessThan(1);
        expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      };
      await expectFrame(844);
      await page.getByRole('button',{name:'Escala',exact:true}).click();
      const before=await header.boundingBox();
      await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
      const last=page.getByRole('button',{name:'Ver detalhes →',exact:true}).last();
      await expect(last).toBeInViewport();
      expect((await last.boundingBox()).y+(await last.boundingBox()).height).toBeLessThan((await nav.boundingBox()).y-8);
      await expect.poll(async()=>{
        await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
        return (await nav.boundingBox()).y-await last.evaluate(element=>element.closest('.gL1').getBoundingClientRect().bottom);
      }).toBeGreaterThanOrEqual(10);
      const lastCardBottom=await last.evaluate(element=>element.closest('.gL1').getBoundingClientRect().bottom);
      const endGap=(await nav.boundingBox()).y-lastCardBottom;
      expect(endGap).toBeGreaterThanOrEqual(10);expect(endGap).toBeLessThanOrEqual(32);
      await page.screenshot({path:test.info().outputPath('iphone-'+theme+'-bottom.png'),scale:'css'});
      expect((await header.boundingBox()).y).toBe(before.y);
      await header.hover();await page.mouse.wheel(0,-700);
      await expectFrame(844);
      await main.evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:test.info().outputPath('iphone-'+theme+'.png'),scale:'css'});

      await page.getByRole('button',{name:'Novo',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Novo evento',exact:true});
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Nome do evento',{exact:true}).focus();
      // A software keyboard can resize/pan the visual viewport during text entry.
      await page.evaluate(()=>{
        Object.defineProperties(window.visualViewport,{height:{configurable:true,value:490},offsetTop:{configurable:true,value:38}});
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      await expectFrame(490,38);
      await page.evaluate(()=>{
        Object.defineProperties(window.visualViewport,{height:{configurable:true,value:245},scale:{configurable:true,value:2}});
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      await expectFrame(490,38);
      await page.evaluate(()=>{
        delete window.visualViewport.scale;
        Object.defineProperty(window.visualViewport,'height',{configurable:true,value:490});
      });
      const footer=await dialog.locator('footer').boundingBox();
      expect(footer.y+footer.height).toBeLessThanOrEqual(528);
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{
        delete window.visualViewport.height;delete window.visualViewport.offsetTop;
        window.dispatchEvent(new Event('pageshow'));
      });
      await expectFrame(844);
      await page.setViewportSize({width:390,height:700});await expectFrame(700);
      await page.setViewportSize({width:844,height:390});
      await expect(page.getByText('Gire o dispositivo',{exact:true})).toBeVisible();
      await expect.poll(async()=>Math.round((await page.locator('.rotate-msg').boundingBox()).height)).toBe(390);
      await page.setViewportSize({width:390,height:844});await expectFrame(844);

      await page.getByRole('button',{name:'Tema',exact:true}).click();
      const changed=theme==='dark'?'light':'dark';
      await expect(page.locator('html')).toHaveAttribute('data-theme',changed);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content',changed==='dark'?'#1D1B2D':'#F5F0FF');
      await expect.poll(()=>page.evaluate(()=>localStorage.getItem('ls_theme'))).toBe(changed);
      await app.reload(page);
      await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',changed);
      await expect(page.locator('body')).toHaveCSS('background-color',changed==='dark'?'rgb(29, 27, 45)':'rgb(234, 248, 250)');
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}

test('desktop frame stays centered and covers the viewport after resizing',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();
    for(const size of [{width:1440,height:1000},{width:1024,height:650}]){
      await page.setViewportSize(size);
      await expect.poll(async()=>Math.round((await page.locator('.app-shell').boundingBox()).height)).toBe(size.height);
      const shell=await page.locator('.app-shell').boundingBox();
      expect(shell.width).toBe(500);expect(shell.x).toBe((size.width-500)/2);
      expect(await page.locator('html').evaluate(element=>element.scrollWidth)).toBe(size.width);
    }
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark']){
  test(`installed app uses the full screen when iOS reports a shorter visual viewport in ${theme} theme`,async({browser})=>{
    const app=await fixture(browser);
    try{
      const page=await app.open(admin,undefined,{device:{...devices['iPhone 13'],viewport:{width:390,height:844}},theme,standalone:true,visualViewportHeight:797});
      await page.addStyleTag({content:':root { --app-safe-top: 47px; --app-safe-bottom: 34px; } *,*::before,*::after { animation:none!important; transition:none!important; }'});
      await page.getByRole('button',{name:'Escala',exact:true}).click();
      await expect(page.getByRole('button',{name:'Ver detalhes →',exact:true})).toBeVisible();
      await page.screenshot({path:test.info().outputPath('short-visual-viewport-'+theme+'.png'),scale:'css'});
      const root=page.locator('#root'),main=page.locator('[data-main-scroll]'),nav=page.locator('.app-nav .gNav');
      await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(844);
      const content=await main.boundingBox(),menu=await nav.boundingBox();
      expect(Math.round(content.y+content.height)).toBe(844);
      expect(Math.abs(844-menu.y-menu.height-55)).toBeLessThan(1);
      expect(Math.round(menu.y+menu.height)).toBe(789);
      await page.getByRole('button',{name:'Novo',exact:true}).click();
      const layer=page.locator('.ui-dialog-layer');
      await expect.poll(async()=>Math.round((await layer.boundingBox()).height)).toBe(844);
      await expect(page.getByRole('dialog',{name:'Novo evento',exact:true})).toBeVisible();
      const footer=await layer.locator('footer').boundingBox();
      expect(Math.round(footer.y+footer.height)).toBe(844);
      const save=await layer.getByRole('button',{name:'Criar Compromisso',exact:true}).boundingBox();
      expect(save.y+save.height).toBeLessThanOrEqual(797-12);
      await page.keyboard.press('Escape');
      await navigate(page,'Músicas');
      const search=page.getByPlaceholder('Buscar música ou artista...');
      await search.focus();
      // A focused field with no software keyboard must not shrink the installed app either.
      await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(844);
      await search.blur();
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(844);
      await page.evaluate(()=>{
        Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,value:47});
        window.visualViewport.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('louvesync:resume'));
      });
      await expect.poll(async()=>Math.round((await root.boundingBox()).y)).toBe(0);
      await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(844);
      await page.setViewportSize({width:390,height:760});
      await expect.poll(async()=>Math.round((await root.boundingBox()).height)).toBe(760);
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}

test('login remains scrollable and themed when the visible screen is short',async({browser})=>{
  const app=await fixture(browser);
  app.state.members.push(...Array.from({length:10},(_,index)=>({...member,id:'extra-member-'+index,name:'Pessoa extra '+index})));
  try{
    const page=await app.open(admin,undefined,{theme:'dark'});
    await page.setViewportSize({width:390,height:420});
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.getByRole('button',{name:'Fazer login',exact:true}).click();
    const login=page.locator('.app-login'),toggle=page.getByRole('button',{name:'Modo escuro',exact:true});
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toBeInViewport();
    expect((await toggle.boundingBox()).y+(await toggle.boundingBox()).height).toBeLessThanOrEqual(420);
    expect(await login.evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
    await toggle.click();
    await expect(page.locator('body')).toHaveCSS('background-color','rgb(245, 240, 255)');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const layout of [{theme:'light',width:390,height:844},{theme:'dark',width:320,height:740}]){
  test(`password login keeps credentials and submit visible above a panned software keyboard in ${layout.theme} theme`,async({browser})=>{
    const app=await fixture(browser);
    app.state.members=app.state.members.map((person,index)=>({...person,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN',instrument:'Teclado / Vocal principal'}));
    try{
      const page=await app.open(admin,undefined,{device:{...devices['iPhone 13'],viewport:{width:layout.width,height:layout.height}},theme:layout.theme,standalone:true});
      await page.addStyleTag({content:':root { --app-safe-top:47px; --app-safe-bottom:34px; } *,*::before,*::after { animation:none!important; transition:none!important; }'});
      await page.getByRole('button',{name:'Sair',exact:true}).click();
      await page.getByRole('button',{name:'Fazer login',exact:true}).click();
      await page.getByRole('button',{name:/Membro Teste/}).click();
      const login=page.locator('.app-login'),password=page.getByPlaceholder('Digite sua senha...'),submit=page.getByRole('button',{name:'Entrar',exact:true});
      await expect(password).toBeFocused();
      const keyboard=async(height,top)=>{
        await page.evaluate(({height,top})=>{
          Object.defineProperties(window.visualViewport,{height:{configurable:true,value:height},offsetTop:{configurable:true,value:top}});
          window.visualViewport.dispatchEvent(new Event('resize'));
          window.visualViewport.dispatchEvent(new Event('scroll'));
        },{height,top});
        await expect.poll(async()=>Math.round((await login.boundingBox()).height)).toBe(height);
        for(const control of [password,submit])await expect.poll(async()=>{
          const frame=await login.boundingBox(),box=await control.boundingBox();
          return box.y>=frame.y+8&&box.y+box.height<=frame.y+frame.height-8;
        }).toBe(true);
        await expect(password).toBeFocused();
        expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      };
      await keyboard(440,38);
      await password.fill('WRONG');await password.press('Enter');
      await expect(page.getByText('PIN incorreto ou membro inativo.',{exact:true})).toBeVisible();
      await keyboard(310,76);
      await page.screenshot({path:test.info().outputPath('login-keyboard-'+layout.theme+'.png')});
      await password.fill('MEMBER_TEST_PIN');await submit.click();
      await expect(page.locator('.app-header')).toBeVisible();
      await expect.poll(async()=>Math.round((await page.locator('#root').boundingBox()).height)).toBe(layout.height);
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}

test('pages use one compact menu clearance and release it when opening a chart',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();
    await page.setViewportSize({width:390,height:700});
    await page.addStyleTag({content:':root { --app-safe-bottom: 0px; }'});
    const main=page.locator('[data-main-scroll]'),nav=page.locator('.app-nav .gNav');
    const checkEnd=async(last,obstruction=nav)=>{
      await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
      await expect(last).toBeInViewport();
      await expect.poll(async()=>{
        await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
        const box=await last.boundingBox();
        return Math.round((await obstruction.boundingBox()).y-box.y-box.height);
      }).toBeGreaterThanOrEqual(10);
      const item=await last.boundingBox(),menu=await nav.boundingBox(),bar=await obstruction.boundingBox();
      expect(bar.y-item.y-item.height).toBeLessThanOrEqual(36);
      expect(Math.abs(700-menu.y-menu.height-8)).toBeLessThan(1);
      const bounds=await main.boundingBox();expect(Math.round(bounds.y+bounds.height)).toBe(700);
    };
    for(const tab of ['Ensaio','Bíblia','Admin']){
      await navigate(page,tab);
      await checkEnd(main.locator('.ui-page > .ui-card, .app-page > .gL1').last(),tab==='Bíblia'?page.locator('.bible-chapter-dock'):nav);
    }
    await navigate(page,'Ensaio');
    const last=main.locator('.ui-page > .ui-card').last();
    const height=(await nav.boundingBox()).height;
    await nav.locator('button').evaluateAll(buttons=>buttons.forEach(button=>{button.style.paddingBottom='28px';}));
    await expect.poll(async()=>(await nav.boundingBox()).height).toBeGreaterThan(height);
    await checkEnd(last);
    await page.screenshot({path:test.info().outputPath('compact-footer.png'),scale:'css'});
    await navigate(page,'Músicas');
    await page.getByText('Teste adoracao',{exact:true}).click();
    await expect(page.locator('.app-nav')).toHaveCount(0);
    await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
    const finalAction=main.getByRole('button',{name:/Excluir.*música/i});
    await expect(finalAction).toBeInViewport();
    const box=await finalAction.boundingBox();
    expect(700-box.y-box.height).toBeGreaterThanOrEqual(16);
    expect(700-box.y-box.height).toBeLessThanOrEqual(40);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

async function fixture(browser) {
  const pages = [], contexts = [], failures = [];
  const profilesByPage=new Map();
  let attendanceDb,changesDb,changeQueue=Promise.resolve();
  const getChangesDb=async()=>{
    if(changesDb)return changesDb;
    changesDb=await PGlite.create();
    const setup=fs.readFileSync('tests/sql/event-changes-setup.sql','utf8');
    await changesDb.exec(setup.slice(0,setup.indexOf('insert into members')));
    for(const person of state.members)await changesDb.query('insert into members(id,name,pin,is_admin,role,instrument,status,avatar,color) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[person.id,person.name,person.pin||'TEST_PIN_'+person.id,!!person.is_admin,person.role||'',person.instrument||'',person.status||'ativo',person.avatar||'',person.color||'']);
    for(const song of state.songs)await changesDb.query('insert into songs(id,title,artist,cat,key,bpm,time_signature,tags,lyrics,vocal_keys) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',[song.id,song.title,song.artist,song.cat,song.key,song.bpm,song.time_signature,song.tags,song.lyrics,JSON.stringify(song.vocal_keys||{})]);
    for(const event of state.events){
      await changesDb.query('insert into events(id,label,date,time,type,theme) values($1,$2,$3,$4,$5,$6)',[event.id,event.label,event.date,event.time||'',event.type||'culto',event.theme||null]);
      for(const item of event.event_songs||[])await changesDb.query('insert into event_songs(id,event_id,song_id,item_type,note_text,order_index,singer_member_id,sequence) values($1,$2,$3,$4,$5,$6,$7,$8)',[item.id,event.id,item.song_id||null,item.item_type||'song',item.note_text||null,item.order_index,item.singer_member_id||null,item.sequence||null]);
      for(const person of event.event_members||[])await changesDb.query('insert into event_members(event_id,member_id,confirmed) values($1,$2,$3)',[event.id,person.member_id,person.confirmed]);
    }
    await changesDb.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_event_change_approval_and_audit.sql')),'utf8'));
    return changesDb;
  };
  const invokeChanges=payload=>{
    const work=async()=>{
      const db=await getChangesDb();
      try{
        await db.exec('begin;set local role anon');
        await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-louvesync-member':payload.memberId,'x-louvesync-pin':payload.pin})]);
        const result=await db.query('select public.louvesync_changes($1::jsonb) as result',[JSON.stringify(payload)]);
        await db.exec('commit');
        state.songs=(await db.query('select * from songs')).rows;
        const events=(await db.query('select * from events')).rows,items=(await db.query('select * from event_songs order by order_index')).rows,roster=(await db.query('select * from event_members')).rows;
        state.events=events.map(event=>({...event,event_songs:items.filter(item=>item.event_id===event.id),event_members:roster.filter(person=>person.event_id===event.id)}));
        return {data:result.rows[0].result,error:null};
      }catch(error){await db.exec('rollback');return {data:null,error:{code:error.code,message:error.message}};}
    };
    const result=changeQueue.then(work);changeQueue=result.catch(()=>{});return result;
  };
  const getAttendanceDb=async()=>{
    if(attendanceDb)return attendanceDb;
    attendanceDb=await PGlite.create();
    await attendanceDb.exec(`create role anon;create role authenticated;create table members(id text primary key,name text,pin text,is_admin boolean,role text,instrument text,status text);create table events(id text primary key,label text,date text,time text,type text);create table event_members(event_id text,member_id text,confirmed boolean);`);
    for(const person of state.members)await attendanceDb.query('insert into members values ($1,$2,$3,$4,$5,$6,$7)',[person.id,person.name,person.pin||'TEST_PIN_'+person.id,!!person.is_admin,person.role||'',person.instrument||'',person.status||'ativo']);
    for(const event of state.events){
      await attendanceDb.query('insert into events values ($1,$2,$3,$4,$5)',[event.id,event.label,event.date,event.time||'',event.type||'outro']);
      for(const member of event.event_members||[])await attendanceDb.query('insert into event_members values ($1,$2,$3)',[event.id,member.member_id,member.confirmed]);
    }
    await attendanceDb.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_ministry_attendance.sql')),'utf8'));
    await attendanceDb.exec('set role anon');
    return attendanceDb;
  };
  const state = { songs: structuredClone(songs), events: structuredClone(initialEvents), members: structuredClone([admin,member]), memberRequests: [], session: null, notes: {}, nextItemId: 100, posts: [], activitySessions:new Map(), activityViews:new Map(), activityRequests:[], activityNow:Date.parse('2026-10-24T15:00:00Z'), activityFailure:null };
  const communityDb=communityDatabase(state,getChangesDb);
  const mentionsDb=mentionsDatabase(communityDb,state);
  async function login(page,profile=profilesByPage.get(page)) {
    const person=state.members.find(person=>person.id===profile?.id)||profile;
    if(!person)return;
    await page.getByRole('button',{name:'Fazer login',exact:true}).click();
    await page.locator('.app-login button').filter({has:page.getByText(person.name,{exact:true})}).click();
    await page.getByLabel('Senha',{exact:true}).fill(person.pin||'TEST_PIN_'+person.id);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    if(person.access_type==='church_member')await expect(page.locator('.church-audience')).toHaveText('Membro');
    else await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();
  }
  const code = `
    import { memberPayload, normalizeMember } from '/src/lib/member-settings.js';
    import { updateEventItems, updateSetlistConfirmation } from '/src/lib/event-storage.js';
    const clone=value=>structuredClone(value);
    const channels=[];
    export const publicSupabaseConfig=window.__testActivityConnection||null;
    window.__testDeliver=(name,message)=>channels.filter(c=>c.topic===name).forEach(c=>c.handlers.filter(h=>h.type==='broadcast'&&h.filter.event===message.event).forEach(h=>h.fn({payload:message.payload})));
    export const supabase={channel(name){const c={topic:name,state:'joined',handlers:[],on(type,filter,fn){this.handlers.push({type,filter,fn});return this;},subscribe(fn){queueMicrotask(()=>fn?.('SUBSCRIBED'));return this;},unsubscribe(){},send(message){return window.__testBroadcast(name,message).then(()=> 'ok');}};channels.push(c);return c;},removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1);},from(table){const query={table,op:'select',filters:{},inFilters:{}};return {select(){return this;},eq(k,v){query.filters[k]=v;return this;},match(values){Object.assign(query.filters,values);return this;},in(k,v){query.inFilters[k]=v;return this;},order(){return this;},single(){query.single=true;return this;},maybeSingle(){query.single=true;return this;},upsert(data){query.op='upsert';query.data=data;return this;},insert(data){query.op='insert';query.data=data;return this;},delete(){query.op='delete';return this;},update(data){query.op='update';query.data=data;return this;},then(resolve,reject){return window.__testDb('query',[query]).then(resolve,reject);}};}};
    export async function upsertMember(member){return normalizeMember(await window.__testDb('upsertMember',[memberPayload(member)]));}
    export async function setEventItems(...args){return updateEventItems(supabase,...args);}
    export async function setSetlistConfirmation(...args){return updateSetlistConfirmation(supabase,...args);}
    ${names.filter(name=>!['upsertMember','setEventItems','setSetlistConfirmation'].includes(name)).map(name=>`export async function ${name}(...args){return window.__testDb('${name}',args);}`).join('\n')}
  `;
  const storageCode=`
    const audioFiles=new Map();
    if(supabase)supabase.storage={from(bucket){return {
      async upload(path,blob){const result=await window.__testDb('rehearsalUpload',[{bucket,path,size:blob.size,type:blob.type}]);if(!result.error)audioFiles.set(path,URL.createObjectURL(blob));return result;},
      getPublicUrl(path){return {data:{publicUrl:audioFiles.get(path)}};},
      async remove(paths){for(const path of paths){URL.revokeObjectURL(audioFiles.get(path));audioFiles.delete(path);}return {error:null};}
    };}};
  `;
  async function open(profile = admin, time = '2026-10-24T12:00:00-03:00', options = {}) {
    if(options.mentions){communityDb.enableMentions();await communityDb.ready();}
    if(options.community)await communityDb.ready();
    if(options.attendance)await getAttendanceDb();
    if(options.changes)await getChangesDb();
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block', ...options.device }); contexts.push(context);
    await context.addInitScript(({profile,pin}) => { try {if(!profile){localStorage.removeItem('ls_profile');localStorage.removeItem('ls_actor_session');return;} localStorage.setItem('ls_profile', JSON.stringify(profile));localStorage.setItem('ls_actor_session',JSON.stringify({memberId:profile.id,pin})); localStorage.removeItem('ls_last_activity'); } catch { /* Sandboxed media frames have no storage access. */ } }, {profile,pin:state.members.find(person=>person.id===profile?.id)?.pin||'TEST_PIN_'+profile?.id});
    if(options.theme)await context.addInitScript(theme=>{try{if(!localStorage.getItem('ls_theme'))localStorage.setItem('ls_theme',theme);}catch{/* Sandboxed media frames have no storage access. */}},options.theme);
    if(options.muralCache)await context.addInitScript(({profile,cache})=>localStorage.setItem('ls_mural_cache_v1:'+profile.id,JSON.stringify(cache)),{profile,cache:options.muralCache});
    if(options.offlineQueue)await context.addInitScript(queue=>localStorage.setItem('ls_sync_queue',JSON.stringify(queue)),options.offlineQueue);
    if(options.directActivity)await context.addInitScript(url=>{window.__testActivityConnection={url,anonKey:'fixture-public-key'};},typeof options.directActivity==='string'?options.directActivity:'https://activity-fixture.supabase.co');
    if(options.visualViewportHeight)await context.addInitScript(height=>Object.defineProperty(window.visualViewport,'height',{configurable:true,value:height}),options.visualViewportHeight);
    if(options.standalone)await context.addInitScript(()=>{
      Object.defineProperty(navigator,'standalone',{value:true});
      const match=window.matchMedia.bind(window);
      window.matchMedia=query=>{
        const result=match(query);
        if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});
        return result;
      };
    });
    if(options.nativeExcel)await context.addInitScript(mode=>{
      window.CapacitorCustomPlatform={name:'android'};
      window.Capacitor={
        PluginHeaders:mode==='legacy'?[]:[{name:'LouveFiles',methods:[{name:'saveExcel',rtype:'promise'}]}],
        nativePromise:(plugin,method,options)=>new Promise((resolve,reject)=>{
          window.__excelRequest={plugin,method,options};
          window.__finishExcel=(error,cancelled)=>error?reject(new Error(error)):resolve({cancelled});
        }),
      };
    },options.nativeExcel);
    await context.exposeBinding('__testDb', async (_source, action, args) => {
      (state.databaseReads||=[]).push(action);
      if (action === 'fetchSongs') return structuredClone(state.songs);
      if (action === 'fetchEvents') return structuredClone(state.events);
      if (action === 'fetchMembers') return structuredClone(state.members);
      if (action === 'authenticateMember') { const person=state.members.find(person=>person.id===args[0]&&(person.pin||'TEST_PIN_'+person.id)===args[1]&&person.status!=='inativo');if(!person)throw new Error('PIN incorreto ou membro inativo.');const {pin:_pin,...safe}=person;return safe; }
      if (action === 'upsertMember') {
        state.memberRequests.push(structuredClone(args[0]));
        await state.memberSaveGate;
        if(state.memberSaveError)throw new Error(state.memberSaveError);
        const unsupported=Object.keys(args[0]).find(key=>!['id','name','role','instrument','avatar','color','status','is_admin','pin','vocal_category','permissions','unavailable_days','schedule_enabled','access_type'].includes(key));
        if(unsupported)throw new Error('Unknown members column: '+unsupported);
        const index=state.members.findIndex(member=>member.id===args[0].id);
        if(index<0)state.members.push(structuredClone(args[0]));else state.members[index]={...state.members[index],...structuredClone(args[0])};
        await communityDb.syncMember(state.members.find(person=>person.id===args[0].id));return args[0];
      }
      if (action === 'setPresence') {
        (state.presenceRequests||=[]).push(structuredClone(args));
        await state.presenceSaveGate;
        if(state.presenceSaveError)throw new Error(state.presenceSaveError);
        state.events.find(event=>event.id===args[0]).event_members.find(row=>row.member_id===args[1]).confirmed=args[2];return;
      }
      if (action === 'rehearsalUpload') {
        (state.audioUploads||=[]).push(structuredClone(args[0]));
        return {error:state.audioUploadError?{message:state.audioUploadError}:null};
      }
      if (action === 'upsertSong') { const index = state.songs.findIndex(song => song.id === args[0].id); if(index<0)state.songs.push(args[0]);else state.songs[index]=args[0];return args[0]; }
      if (action === 'setSequenceForSong') { const row=state.events.find(event=>event.id===args[0]).event_songs.find(row=>row.song_id===args[1]);const previous=row.sequence?.startsWith('louvesync:v1:')?JSON.parse(row.sequence.slice(13)):{text:row.sequence||'',key:null};row.sequence=encodeSequence(args[2]===undefined?previous.text:args[2],args[3]===undefined?previous.key:args[3]);return; }
      if (action === 'saveVocalKey') { const song=state.songs.find(song=>song.id===args[0]);song.vocal_keys[args[1]]=args[2];return song.vocal_keys; }
      if (action === 'setSingerForSong') { const event=state.events.find(event=>event.id===args[0]);event.event_songs.filter(row=>row.song_id===args[1]).forEach(row=>{row.singer_member_id=args[2];});return; }
      if (action === 'upsertEvent') {
        const unknown=Object.keys(args[0]).find(key=>!['id','date','time','type','label','theme','notes','mention_member_ids'].includes(key));
        if(unknown)throw new Error("Could not find the '"+unknown+"' column of 'events' in the schema cache");
        if(options.mentions)await mentionsDb.event(args[0],await _source.page.evaluate(()=>JSON.parse(localStorage.getItem('ls_actor_session'))));
        const index=state.events.findIndex(event=>event.id===args[0].id);if(index<0)state.events.push(args[0]);else state.events[index]={...state.events[index],...args[0]};return args[0];
      }
      if (action === 'query') {
        const query = args[0];
        const muralKeys={announcements:'posts',announcement_comments:'comments',announcement_reactions:'reactions',announcement_saves:'saves'};
        if(muralKeys[query.table]){
          if(options.mentions&&['announcements','announcement_comments'].includes(query.table))return mentionsDb.mural(query,await _source.page.evaluate(()=>JSON.parse(localStorage.getItem('ls_actor_session'))));
          const key=muralKeys[query.table];state[key]||=[];
          const matches=row=>Object.entries(query.filters).every(([field,value])=>row[field]===value);
          let inserted;
          if(query.table==='announcements'&&query.op==='select'&&query.filters.id&&state.muralReadbackError)return {data:null,error:{message:state.muralReadbackError}};
          if(query.op==='insert'){
            if(state.muralInsertError)return {data:null,error:{message:state.muralInsertError}};
            if(query.table==='announcements'&&state.muralRejectLocalIds&&query.data.id)return {data:null,error:{code:'22P02',message:'invalid input syntax for type uuid'}};
            inserted=structuredClone(Array.isArray(query.data)?query.data:[query.data]);
            if(query.table==='announcements'&&state.muralGeneratedId)inserted=inserted.map(row=>({...row,id:state.muralGeneratedId}));
            state[key].push(...inserted);
          }
          if(query.op==='delete')state[key]=state[key].filter(row=>!matches(row));
          const rows=inserted||state[key].filter(matches);
          return {data:structuredClone(query.single?rows[0]||null:rows),error:null};
        }
        if(query.table==='equipment'){
          state.equipment||=[{id:'equipment-fixture',name:'Microfone de teste',brand:'Shure',serial_number:'TEST-01',status:'Disponível',custodian_id:null}];
          if(query.op==='upsert'){
            (state.equipmentRequests||=[]).push(structuredClone(query.data));
            await state.equipmentSaveGate;
            if(state.equipmentSaveError)return {data:null,error:{message:state.equipmentSaveError}};
            for(const row of Array.isArray(query.data)?query.data:[query.data]){const index=state.equipment.findIndex(item=>item.id===row.id);if(index<0)state.equipment.push(structuredClone(row));else state.equipment[index]={...state.equipment[index],...structuredClone(row)};}
          }
          if(query.op==='delete')state.equipment=state.equipment.filter(row=>row.id!==query.filters.id);
          return {data:structuredClone(state.equipment),error:null};
        }
        if(query.table==='events' && query.op==='select') {const rows=state.events.filter(event=>!query.filters.id||event.id===query.filters.id);return {data:structuredClone(query.single?rows[0]||null:rows),error:null};}
        if(query.table==='songs') {
          const rows=state.songs.filter(song=>Object.entries(query.filters).every(([field,value])=>song[field]===value)&&Object.entries(query.inFilters).every(([field,values])=>values.includes(song[field])));
          if(query.op==='update')for(const row of rows)Object.assign(row,query.data);
          return {data:structuredClone(query.single?rows[0]||null:rows),error:null};
        }
        if (['event_songs', 'event_members'].includes(query.table)) {
          const eventId=query.filters.event_id||query.data?.[0]?.event_id;
          const event=state.events.find(event=>event.id===eventId);
          if(!event)return {data:null,error:{message:'Event not found'}};
          const rows=event[query.table]||[];
          const matches=row=>Object.entries(query.filters).every(([key,value])=>key==='event_id'||row[key]===value)&&Object.entries(query.inFilters).every(([key,values])=>values.includes(row[key]));
          const confirmationWrite=query.table==='event_songs' && ['insert','update'].includes(query.op) && (query.data?.note_text||query.data?.[0]?.note_text||'').startsWith('louvesync:event-preferences:v1:');
          if(confirmationWrite){
            (state.setlistRequests||=[]).push(structuredClone(query));
            await state.setlistSaveGate;
            if(state.setlistSaveError)return {data:null,error:{message:state.setlistSaveError}};
          }
          if(query.table==='event_songs'&&query.op==='select'&&state.setlistReadbackError&&state.setlistRequests?.length)return {data:null,error:{message:state.setlistReadbackError}};
          if(query.op==='update'){
            const matched=rows.filter(matches);for(const row of matched)Object.assign(row,query.data);
            return {data:structuredClone(matched),error:null};
          }
          if(['insert','upsert'].includes(query.op)) {
            if(query.table==='event_songs') {
              const invalid=query.data.find(row=>Object.hasOwn(row,'id')&&!Number.isSafeInteger(row.id));
              if(invalid)return {data:null,error:{code:'22P02',message:'invalid input syntax for type bigint: "'+invalid.id+'"'}};
            }
            for(const row of query.data) {
              const existing=query.op==='upsert'?rows.find(existing=>existing.id===row.id):null;
              if(existing)Object.assign(existing,row);
              else rows.push(query.table==='event_songs'?{id:state.nextItemId++,...row}:row);
            }
            event[query.table]=rows;
          }
          if(query.op==='delete')event[query.table]=rows.filter(row=>!matches(row));
          return {data:structuredClone((event[query.table]||[]).filter(matches)),error:null};
        }
        if (query.table === 'rehearsal_sessions') { if(query.op==='upsert')state.session={...state.session,...query.data};return {data:state.session,error:null}; }
        if (query.table === 'rehearsal_notes') { if(query.op==='upsert')state.notes[query.data.song_id]=query.data;return {data:state.notes[query.filters.song_id]||null,error:null}; }
        if (query.table === 'rehearsal_takes') {
          state.takes||=[];
          if(query.op==='insert'){
            if(state.takeInsertError)return {data:null,error:{message:state.takeInsertError}};
            state.takes.unshift(structuredClone(query.data));
          }
          if(query.op==='delete')state.takes=state.takes.filter(take=>take.id!==query.filters.id);
          return {data:structuredClone(state.takes.filter(take=>Object.entries(query.filters).every(([key,value])=>take[key]===value))),error:null};
        }
        return {data:[],error:null};
      }
      return null;
    });
    await context.exposeBinding('__testBroadcast', async (_source, name, message) => { await Promise.all(pages.filter(page=>!page.isClosed()).map(page=>page.evaluate(({name,message})=>window.__testDeliver?.(name,message),{name,message}))); });
    const page = await context.newPage(); pages.push(page);
    profilesByPage.set(page,profile);
    if(options.mentions)await page.route('**/api/notifications',async route=>{
      try{const result=await mentionsDb.notifications(route.request().postDataJSON());await route.fulfill({json:{...result,ok:true,pushConfigured:false}});}
      catch(error){await route.fulfill({status:403,json:{ok:false,error:error.message}});}
    });
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/src/lib/supabase.js*', route => route.fulfill({ contentType: 'text/javascript', body: (options.noSupabase ? code.replace('export const supabase=','const fixtureSupabase=')+'\nexport const supabase=null;' : code)+storageCode }));
    const handleActivity=async(route,direct=false)=>{
      const body=direct?route.request().postDataJSON().p_payload:route.request().postDataJSON();state.activityRequests.push({...structuredClone(body),transport:direct?'rpc':'api'});
      const actor=state.members.find(row=>row.id===body.memberId&&row.pin===body.pin);
      const reply=(status,json)=>route.fulfill({status,json});
      if(!actor)return reply(401,direct?{code:'28000',message:'Sessão inválida.'}:{error:'Sessão inválida.'});
      if(['online','viewers'].includes(body.action)&&!actor.is_admin)return reply(403,direct?{code:'42501',message:'Acesso exclusivo do administrador.'}:{error:'Acesso exclusivo do administrador.'});
      if(state.activityFailure&&!direct)return reply(503,{code:'ACTIVITY_SETUP_REQUIRED',error:state.activityFailure});
      if(['view','viewers'].includes(body.action)){
        const targets=body.targetType==='event'?state.events:state.posts;
        if(!targets.some(target=>String(target.id)===String(body.targetId)))return reply(404,direct?{code:'P0002',message:'Conteúdo não encontrado.'}:{error:'Conteúdo não encontrado.'});
      }
      const serverTime=new Date(state.activityNow).toISOString();
      if(['heartbeat','leave'].includes(body.action)){
        const existing=state.activitySessions.get(body.sessionId);
        if(!existing||body.version>existing.version)state.activitySessions.set(body.sessionId,{...body,active:body.action==='heartbeat',lastSeen:state.activityNow});
        return reply(200,{ok:true,serverTime});
      }
      if(body.action==='online'){
        const active=new Map();
        for(const session of state.activitySessions.values())if(session.active&&state.activityNow-session.lastSeen<=75000)active.set(session.memberId,{memberId:session.memberId,name:state.members.find(m=>m.id===session.memberId)?.name,lastSeenAt:new Date(session.lastSeen).toISOString()});
        return reply(200,{members:[...active.values()],serverTime});
      }
      if(body.action==='view'){
        if(!state.activityViews.has(body.viewId))state.activityViews.set(body.viewId,{...body,name:actor.name,receivedAt:serverTime});
        return reply(200,{ok:true,serverTime});
      }
      if(body.action==='viewers'){
        const groups=new Map();
        for(const view of state.activityViews.values())if(view.targetType===body.targetType&&view.targetId===body.targetId){
          const group=groups.get(view.memberId)||{memberId:view.memberId,name:view.name,firstViewedAt:view.viewedAt,lastViewedAt:view.viewedAt,viewCount:0};
          group.firstViewedAt=[group.firstViewedAt,view.viewedAt].sort()[0];group.lastViewedAt=[group.lastViewedAt,view.viewedAt].sort().at(-1);group.viewCount++;groups.set(view.memberId,group);
        }
        return reply(200,{viewers:[...groups.values()],serverTime});
      }
      return reply(400,{error:'Ação inválida.'});
    };
    if(options.attendance){
      const invoke=async payload=>{
        (state.attendanceRequests||=[]).push(structuredClone(payload));
        if(payload.action==='save')await state.attendanceSaveGate;
        if(state.attendanceSaveError&&payload.action==='save')return {data:null,error:{code:'XX000',message:state.attendanceSaveError}};
        if(state.attendanceReadError&&payload.action!=='save')return {data:null,error:{code:'XX000',message:state.attendanceReadError}};
        try {const database=await getAttendanceDb();const result=await database.query('select public.louvesync_attendance($1::jsonb) as result',[JSON.stringify(payload)]);return {data:result.rows[0].result,error:null};}
        catch(error){return {data:null,error:{code:error.code,message:error.message}};}
      };
      const handler=createAttendanceHandler(()=>({rpc:(_name,args)=>({abortSignal:()=>invoke(args.p_payload)})}),{SUPABASE_URL:'https://attendance-fixture.supabase.co',SUPABASE_ANON_KEY:'public-fixture-key'});
      await page.route('**/api/attendance',async route=>{
        const req={method:route.request().method(),headers:{...route.request().headers(),host:new URL(route.request().url()).host},body:route.request().postDataJSON()};
        const res={code:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
        await handler(req,res);await route.fulfill({status:res.code,headers:res.headers,json:res.body});
      });
      if(options.directActivity)await page.route('https://activity-fixture.supabase.co/rest/v1/rpc/louvesync_attendance',async route=>{const result=await invoke(route.request().postDataJSON().p_payload);await route.fulfill({status:result.error?400:200,json:result.error||result.data});});
    }
    const changesHandler=createChangesHandler(()=>({rpc:(_name,args)=>({abortSignal:()=>invokeChanges(args.p_payload)})}),{SUPABASE_URL:'https://changes-fixture.supabase.co',SUPABASE_ANON_KEY:'public-fixture-key'});
    await page.route('**/api/changes',async route=>{
      if(!options.changes){await route.fulfill({json:{ok:true,requests:[],pendingCount:0,hasMore:false}});return;}
      const req={method:route.request().method(),headers:{...route.request().headers(),host:new URL(route.request().url()).host},body:route.request().postDataJSON()};
      const res={code:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await changesHandler(req,res);await route.fulfill({status:res.code,headers:res.headers,json:res.body});
    });
    const maestroHandler=createMaestroHandler({environment:{GROK_API_KEY:'xai_SYNTHETIC_FIXTURE_KEY'},verifyActor:async credentials=>state.members.find(person=>person.id===credentials.memberId&&(person.pin||'TEST_PIN_'+person.id)===credentials.pin)||null,fetcher:async(url,options)=>{(state.maestroOutbound||=[]).push({url,model:JSON.parse(options.body).model});if(state.maestroFailure)return Response.json({error:'Simulated upstream failure'},{status:state.maestroFailure});return Response.json({choices:[{message:{content:'Vamos preparar o ensaio com oração, repertório e transições bem definidas.'}}]});}});
    await page.route('**/api/maestro',async route=>{
      (state.maestroRequests||=[]).push(route.request().postDataJSON());
      const req={method:route.request().method(),headers:{...route.request().headers(),host:new URL(route.request().url()).host},body:route.request().postDataJSON()};
      const res={code:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};
      await maestroHandler(req,res);await route.fulfill({status:res.code,headers:res.headers,json:res.body});
    });
    await page.route('**/api/community',async route=>{
      const req={method:route.request().method(),headers:{...route.request().headers(),host:new URL(route.request().url()).host,'x-real-ip':'192.0.2.10'},body:route.request().postDataJSON()};
      (state.communityRequests||=[]).push(structuredClone(req.body));
      const res={code:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};
      await communityDb.handler(req,res);await route.fulfill({status:res.code,headers:res.headers,json:res.body});
    });
    if(options.activity)await page.route('**/api/activity',route=>handleActivity(route));
    await page.route('**/version.json', route => route.fulfill({ json: {version:'test'} }));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
    if(options.directActivity)await page.route('https://activity-fixture.supabase.co/rest/v1/rpc/louvesync_activity',route=>handleActivity(route,true));
    await page.clock.setFixedTime(new Date(time));
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('navigation',{name:'Navegação da comunidade'})).toBeVisible();
    if(profile&&!options.visitorOnly)await login(page,profile);
    return page;
  }
  return { open, login, async reload(page){await page.reload();await login(page);}, failures, state, communityQuery:communityDb.query, async attendanceQuery(sql,params=[]){const db=await getAttendanceDb();await db.exec('reset role');try{return await db.query(sql,params);}finally{await db.exec('set role anon');}}, async close(){try{for(const context of contexts)await context.close();}finally{await attendanceDb?.close();await changesDb?.close();}} };
}

test('five fixed destinations keep secondary screens reachable and respect member permissions',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(admin,undefined,{device:{viewport:{width:320,height:740}}});
    const nav=page.getByRole('navigation',{name:'Navegação principal'});
    expect(await nav.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')))).toEqual(['Início','Escala','Mural','Bíblia','Mais']);
    expect(await nav.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await expect.poll(()=>nav.getByRole('button',{name:'Mural',exact:true}).locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    await nav.getByRole('button',{name:'Mais',exact:true}).click();
    const menu=page.getByRole('region',{name:'Mais',exact:true});
    await expect(menu).toBeVisible();
    expect(await page.locator('#root').evaluate(root=>root.inert)).toBe(false);
    await expect(nav.getByRole('button',{name:'Mais',exact:true})).toHaveAttribute('aria-current','page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole('button',{name:'Mural',exact:true}).locator('img')).toHaveAttribute('src','/brand/church-emblem-3d.webp');
    await expect(menu.locator('.app-more-artwork')).toHaveCount(10);
    await expect.poll(()=>menu.locator('.app-more-artwork').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
    for(const label of ['Músicas','Patrimônio','Ensaio','Treinar','Admin'])await expect(menu.getByRole('button',{name:label,exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(nav.getByRole('button',{name:'Mais',exact:true})).toBeFocused();
    await navigate(page,'Músicas');
    await expect(nav.getByRole('button',{name:'Mais',exact:true})).toHaveAttribute('aria-current','page');
    await page.getByText('Teste adoracao',{exact:true}).click();
    await expect(page.locator('.app-nav')).toHaveCount(0);
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(page.getByPlaceholder('Buscar música ou artista...')).toBeVisible();
    await expect(nav.getByRole('button',{name:'Mais',exact:true})).toHaveAttribute('aria-current','page');
    await nav.getByRole('button',{name:'Mural',exact:true}).click();
    await expect(page.locator('[data-main-scroll]').getByText('Mural de Comunicados',{exact:false})).toBeVisible();
    await expect(nav.getByRole('button',{name:'Mural',exact:true})).toHaveAttribute('aria-current','page');

    app.state.members.find(person=>person.id===member.id).permissions=['home','biblia','repertorio','admin','membros'];
    const restricted=await app.open(member);
    const limitedNav=restricted.getByRole('navigation',{name:'Navegação principal'});
    await expect(limitedNav.getByRole('button')).toHaveCount(5);
    await expect(limitedNav.getByRole('button',{name:'Escala',exact:true})).toBeDisabled();
    await expect(limitedNav.getByRole('button',{name:'Mural',exact:true})).toBeDisabled();
    await limitedNav.getByRole('button',{name:'Mais',exact:true}).click();
    const limitedMenu=restricted.getByRole('region',{name:'Mais',exact:true});
    await expect(limitedMenu.getByRole('button',{name:'Músicas',exact:true})).toBeVisible();
    for(const label of ['Admin','Membros','Patrimônio','Treinar'])await expect(limitedMenu.getByRole('button',{name:label,exact:true})).toHaveCount(0);
    await limitedMenu.getByRole('button',{name:'Fechar',exact:true}).click();
    await expect(limitedMenu).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark']){
  test(`More uses the approved 3D grid and keeps navigation usable in ${theme} mode`,async({browser})=>{
    const app=await fixture(browser);
    try{
      const page=await app.open(admin,undefined,{theme,device:{...devices['iPhone 13'],viewport:{width:390,height:844}},standalone:true});
      await page.addStyleTag({content:':root { --app-safe-top:47px; --app-safe-bottom:34px; } *,*::before,*::after { animation:none!important; transition:none!important; }'});
      const nav=page.getByRole('navigation',{name:'Navegação principal'}),main=page.locator('[data-main-scroll]');
      await main.evaluate(element=>{element.scrollTop=180;});
      const previousScroll=await main.evaluate(element=>element.scrollTop);
      await nav.getByRole('button',{name:'Mais',exact:true}).click();
      const menu=page.getByRole('region',{name:'Mais',exact:true});
      const menuScroll=page.locator('.app-more-scroll');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('heading',{name:'Mais',exact:true})).toBeFocused();
      await expect(main).toHaveJSProperty('inert',true);
      expect(await main.evaluate(element=>element.scrollTop)).toBe(previousScroll);
      await expect.poll(()=>menu.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
      for(const [label,asset] of [['Devocional','/images/more/devotional.webp'],['Maestro','/images/maestro/toy.webp'],['Solicitações','/images/more/requests.webp']])await expect(menu.getByRole('button',{name:label,exact:true}).locator('img')).toHaveAttribute('src',asset);
      await expect.poll(()=>nav.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
      for(const width of [390,320]){
        await page.setViewportSize({width,height:844});
        expect(await menuScroll.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
        expect(await menu.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
        const firstCard=await menu.locator('.app-more-destination').nth(0).boundingBox(),secondCard=await menu.locator('.app-more-destination').nth(1).boundingBox();
        expect(secondCard.x-firstCard.x-firstCard.width).toBeGreaterThanOrEqual(8);
        await menuScroll.evaluate(element=>{element.scrollTop=element.scrollHeight;});
        const end=await menu.locator('.app-more-destination').last().boundingBox(),bar=await nav.boundingBox();
        expect(bar.y-end.y-end.height).toBeGreaterThanOrEqual(10);
        await menuScroll.evaluate(element=>{element.scrollTop=0;});
        await page.screenshot({path:test.info().outputPath(`more-${theme}-${width}.png`),scale:'css'});
        await menu.locator('.app-more-devocional').evaluate(element=>element.scrollIntoView({block:'center'}));
        await page.screenshot({path:test.info().outputPath(`more-expanded-${theme}-${width}.png`),scale:'css'});
      }
      const backgroundScroll=await main.evaluate(element=>element.scrollTop);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(page.locator('.home-page')).toBeVisible();
      await expect(main).toHaveJSProperty('inert',false);
      await expect.poll(()=>main.evaluate(element=>element.scrollTop)).toBe(backgroundScroll);
      await nav.getByRole('button',{name:'Mais',exact:true}).click();
      await nav.getByRole('button',{name:'Escala',exact:true}).click();
      await expect(menu).toHaveCount(0);
      await expect(nav.getByRole('button',{name:'Escala',exact:true})).toHaveAttribute('aria-current','page');
      await nav.getByRole('button',{name:'Mais',exact:true}).click();
      await page.getByRole('region',{name:'Mais',exact:true}).getByRole('button',{name:'Devocional',exact:true}).click();
      await expect(menu).toHaveCount(0);
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
  test(`Home preserves live stats, study and pending confirmations while its theme stays scoped in ${theme} mode`,async({browser})=>{
    const app=await fixture(browser);
    app.state.songs[1]={...app.state.songs[1],featured_week:true,featured_note:'Pratique a transição'};
    delete app.state.events[0].event_members[0].confirmed;
    try{
      const options={theme,device:{...devices['iPhone 13'],viewport:{width:390,height:844}},standalone:true};
      const first=await app.open(admin,undefined,options),observer=await app.open(admin,undefined,options);
      await first.addStyleTag({content:':root { --app-safe-top:47px; --app-safe-bottom:34px; } *,*::before,*::after { animation:none!important; transition:none!important; }'});
      const home=first.locator('.home-page'),stats=home.locator('.home-stats');
      await expect(home).toBeVisible();
      await expect(first.locator('html')).toHaveAttribute('data-home-theme','true');
      for(const [label,value] of [['Músicas','3'],['Membros','2'],['Cultos','1'],['Confirm.','0']])await expect(stats.locator(':scope > div').filter({hasText:label})).toContainText(value);
      await expect(home.locator('.home-reminder')).toContainText('Lembrete para Vocais');
      await expect(home.locator('.home-featured')).toContainText('Pratique a transição');
      await expect(home.locator('.home-pending').getByRole('button',{name:'Confirmar',exact:true})).toBeVisible();
      await first.screenshot({path:test.info().outputPath('home-'+theme+'.png'),scale:'css'});
      await home.locator('.home-featured').evaluate(element=>element.scrollIntoView({block:'center'}));
      await home.getByRole('button',{name:'Estudar Teste ceia',exact:true}).click();
      expect(app.failures).toEqual([]);
      await expect(first.locator('.app-header')).toContainText('Teste ceia');
      await expect(first.locator('.app-nav')).toHaveCount(0);
      await first.getByRole('button',{name:'Voltar',exact:true}).click();
      await expect(home).toBeVisible();
      await expect(first.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name:'Início',exact:true})).toHaveAttribute('aria-current','page');
      await home.locator('.home-pending').getByRole('button',{name:'Confirmar',exact:true}).click();
      await expect.poll(()=>app.state.events[0].event_members[0].confirmed).toBe(true);
      for(const page of [first,observer]){
        await expect(page.locator('.home-pending')).toContainText('Presença confirmada.');
        await expect(page.locator('.home-stats > div').filter({hasText:'Confirm.'})).toContainText('1');
      }
      await first.getByRole('button',{name:'Escala',exact:true}).click();
      await expect(first.locator('.home-page')).toHaveCount(0);
      await expect(first.locator('html')).not.toHaveAttribute('data-home-theme','true');
      await expect(first.locator('body')).toHaveCSS('background-color',theme==='dark'?'rgb(29, 27, 45)':'rgb(245, 240, 255)');
      await expect(first.locator('.app-header')).toHaveCSS('background-color',theme==='dark'?'rgb(29, 27, 45)':'rgb(245, 240, 255)');
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}

for(const theme of ['light','dark'])test(`Home stage supports drag and keyboard with preserved backgrounds and compact layouts in ${theme}`,async({browser})=>{
  const app=await fixture(browser);
  app.state.songs[0].featured_week=true;
  app.state.events[0].theme='Unidos em adoração';
  try{
    const page=await app.open(admin,undefined,{theme,device:{...devices['iPhone 13'],viewport:{width:390,height:844}},standalone:true});
    const home=page.locator('.home-page'),art=home.getByRole('button',{name:'Mover ilustração do palco',exact:true}),image=art.locator('img');
    await expect(image).toHaveAttribute('src','/images/home/worship-stage.webp');
    await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    await expect(home.locator('.home-calendar-dates [aria-pressed="true"]')).toHaveCSS('background-color','rgb(101, 68, 232)');
    for(const [selector,file] of [['.home-pending','devotional-ribbons'],['.home-featured','worship-landscape']])expect(await home.locator(selector).evaluate(element=>getComputedStyle(element).backgroundImage)).toContain(`${file}${theme==='dark'?'-dark':''}.webp`);
    const bounds=await art.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+45,bounds.y+bounds.height/2-15,{steps:5});
    await expect(art).toHaveAttribute('data-dragging','true');
    await expect.poll(()=>art.evaluate(element=>parseFloat(element.style.getPropertyValue('--art-ry')))).toBeGreaterThan(0);
    await page.mouse.up();await expect(art).toHaveAttribute('data-dragging','false');
    await expect.poll(()=>art.evaluate(element=>element.style.getPropertyValue('--art-ry'))).toBe('0deg');
    await art.focus();await page.keyboard.down('ArrowLeft');
    await expect.poll(()=>art.evaluate(element=>parseFloat(element.style.getPropertyValue('--art-ry')))).toBeLessThan(0);
    await page.keyboard.up('ArrowLeft');await expect.poll(()=>art.evaluate(element=>element.style.getPropertyValue('--art-ry'))).toBe('0deg');
    if(theme==='light'){
      const touch=await page.context().newCDPSession(page),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y:y+2}]});
      await expect.poll(()=>art.evaluate(element=>parseFloat(element.style.getPropertyValue('--art-ry')))).toBeGreaterThan(0);
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
      await expect(art).toHaveAttribute('data-dragging','false');
    }
    await page.emulateMedia({reducedMotion:'reduce'});await expect(image).toHaveCSS('transition-duration','0s');
    await art.evaluate(element=>element.blur());
    await expect(home).toBeVisible();await expect(page.locator('.gL2')).toHaveCount(0);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:test.info().outputPath(`home-stage-${theme}-${width}.png`),scale:'css'});
      expect(await home.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await home.locator('.home-calendar').evaluate(element=>element.scrollIntoView({block:'center'}));
      await page.screenshot({path:test.info().outputPath(`home-agenda-${theme}-${width}.png`),scale:'css'});
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      const team=await home.getByRole('region',{name:'Equipe',exact:true}).boundingBox(),nav=await page.locator('.app-nav .gNav').boundingBox();
      expect(team.y+team.height).toBeLessThan(nav.y-8);
    }
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const profile of [admin,member])test(`Home keeps day events, setlist keys and team context for ${profile.is_admin?'admins':'members'}`,async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_songs=[{song_id:'song-2',order_index:1,sequence:encodeSequence('Intro','Eb')},{song_id:'song-0',order_index:2}];
  app.state.events[0].event_members=[{member_id:profile.id,confirmed:null}];
  app.state.events.push({...structuredClone(initialEvents[0]),id:'same-day',time:'20:00:00',label:'Encontro da noite',type:'outro'},
    {...structuredClone(initialEvents[0]),id:'following-day',date:'2026-10-26',label:'Culto de segunda'});
  app.state.members.push({...member,id:'inactive',name:'Integrante Inativo',status:'inativo'});
  try{
    const page=await app.open(profile),home=page.locator('.home-page'),calendar=home.getByRole('group',{name:'Dias da agenda'});
    const primary=home.getByRole('article',{name:'Culto de Teste',exact:true});
    await expect(calendar.locator('[aria-pressed="true"]')).toHaveAttribute('data-date','2026-10-25');
    await expect(home.getByRole('article',{name:'Encontro da noite',exact:true})).toBeVisible();
    const other=home.getByRole('region',{name:'Outras confirmações pendentes',exact:true});
    await expect(other).toContainText('Culto de segunda');await expect(other).not.toContainText('Encontro da noite');
    const setlist=home.getByRole('region',{name:'Repertório do evento',exact:true});
    await expect(setlist.locator('.home-song-copy strong')).toHaveText(['Teste jubilo','Teste adoracao']);
    await expect(setlist.locator('.home-song-key').first()).toHaveText('Eb');
    const team=home.getByRole('region',{name:'Equipe',exact:true});
    await expect(team.locator('.home-team-member')).toHaveCount(1);
    await team.getByRole('button',{name:'Equipe ativa 2',exact:true}).click();await expect(team.locator('.home-team-member')).toHaveCount(2);
    await expect(team.getByRole('button',{name:'Ver todos',exact:true})).toHaveCount(profile.is_admin?1:0);
    await setlist.evaluate(element=>element.scrollIntoView({block:'center'}));
    await setlist.getByRole('button',{name:'Abrir cifra de Teste jubilo',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Tom da cifra',exact:true})).toHaveValue('D#'); // The transposer uses sharp pitch names (Eb = D#).
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(home).toBeVisible();await expect(page.locator('.gL2')).toHaveCount(0);
    await expect(calendar.locator('[aria-pressed="true"]')).toHaveAttribute('data-date','2026-10-25');
    await primary.evaluate(element=>element.scrollIntoView({block:'center'}));
    await primary.getByRole('button',{name:'Ver escala',exact:true}).click();
    await page.locator('.gL2').getByRole('button',{name:'Abrir cifra de Teste jubilo',exact:true}).click();
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(page.locator('.gL2')).toContainText('Culto de Teste');
    await page.locator('.gL2').getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click();
    await home.getByRole('region',{name:'Agenda do mês',exact:true}).evaluate(element=>element.scrollIntoView({block:'center'}));
    await calendar.locator('[data-date="2026-10-24"]').click();
    await expect(home).toContainText('Nenhum evento neste dia');
    const create=home.getByRole('button',{name:'Criar evento neste dia',exact:true});
    await expect(create).toHaveCount(profile.is_admin?1:0);
    if(profile.is_admin){
      await create.click();await expect(page.getByRole('dialog',{name:'Novo evento',exact:true}).getByLabel('Data',{exact:true})).toHaveValue('2026-10-24');
    }
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('Home rolls back failed attendance and saves responses on the correct event',async({browser})=>{
  const app=await fixture(browser);
  app.state.events.push({...structuredClone(initialEvents[0]),id:'other-event',time:'20:00:00',label:'Outro culto'});
  try{
    const page=await app.open(),home=page.locator('.home-page'),primary=home.getByRole('article',{name:'Culto de Teste',exact:true}),secondary=home.getByRole('article',{name:'Outro culto',exact:true});
    app.state.presenceSaveError='Falha de teste';
    await primary.getByRole('button',{name:'Confirmar',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Presença não salva: Falha de teste');
    await expect(primary.getByRole('button',{name:'Confirmar',exact:true})).toBeEnabled();
    await expect(home.locator('.home-stats > div').filter({hasText:'Confirm.'})).toContainText('0');
    expect(app.state.events[0].event_members[0].confirmed).toBeNull();await expect(page.locator('.conf-p')).toHaveCount(0);
    delete app.state.presenceSaveError;
    await secondary.evaluate(element=>element.scrollIntoView({block:'center'}));
    await secondary.getByRole('button',{name:'Recusar',exact:true}).click();
    await expect.poll(()=>app.state.events[1].event_members[0].confirmed).toBe(false);
    await expect(secondary).toContainText('Você informou que não poderá ir.');
    expect(app.state.events[0].event_members[0].confirmed).toBeNull();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('admin sees online members across devices, foreground changes, disconnections and logout',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  try{
    const first=await app.open(admin,undefined,{activity:true}),second=await app.open(member,undefined,{activity:true});
    await navigate(first,'Admin');
    const list=first.locator('.ui-activity-list');
    await expect(list.getByText('Membro Teste',{exact:true})).toBeVisible();
    const third=await app.open(member,undefined,{activity:true});
    await expect.poll(()=>[...app.state.activitySessions.values()].filter(s=>s.memberId===member.id&&s.active).length).toBe(2);
    await first.getByRole('button',{name:'Atualizar membros on-line',exact:true}).click();
    await expect(list.getByText('Membro Teste',{exact:true})).toHaveCount(1);
    await second.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
    await expect.poll(()=>[...app.state.activitySessions.values()].filter(s=>s.memberId===member.id&&s.active).length).toBe(1);
    await expect(list.getByText('Membro Teste',{exact:true})).toHaveCount(1);
    await third.getByRole('button',{name:'Sair',exact:true}).click();
    await expect.poll(()=>[...app.state.activitySessions.values()].filter(s=>s.memberId===member.id&&s.active).length).toBe(0);
    await first.getByRole('button',{name:'Atualizar membros on-line',exact:true}).click();
    await expect(list.getByText('Membro Teste',{exact:true})).toHaveCount(0);
    await second.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(list.getByText('Membro Teste',{exact:true})).toBeVisible();
    await first.screenshot({path:test.info().outputPath('admin-online.png')});
    app.state.activityNow+=76000;
    await first.getByRole('button',{name:'Atualizar membros on-line',exact:true}).click();
    await expect(list.getByText('Membro Teste',{exact:true})).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('event view receipts persist with first/last times and are restricted to admins without confirming attendance',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  try{
    const first=await app.open(admin,undefined,{activity:true}),second=await app.open(member,undefined,{activity:true});
    for(const page of [first,second]){await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();}
    await expect(second.getByRole('button',{name:/Ver visualizações/})).toHaveCount(0);
    await first.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await first.getByRole('button',{name:'Ver visualizações de Culto de Teste',exact:true}).click();
    const dialog=first.getByRole('dialog',{name:'Visualizações da escala',exact:true});
    await expect(dialog.locator('.ui-activity-readers').getByText('Membro Teste',{exact:true})).toBeVisible();
    expect(app.state.events[0].event_members.find(m=>m.member_id===member.id).confirmed).toBe(null);
    await second.reload();
    await second.clock.setFixedTime(new Date('2026-10-24T12:05:00-03:00'));
    await second.getByRole('button',{name:'Escala',exact:true}).click();await second.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const row=dialog.locator('.ui-activity-readers .ui-activity-person').filter({hasText:'Membro Teste'});
    await expect(row).toContainText('2 visualizações');await expect(row).toContainText('12:05');await expect(row).toContainText('12:00');
    await expect(row).toBeInViewport({ratio:1});
    const response=await second.evaluate(async()=>{const r=await fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'viewers',memberId:'user-member',pin:'MEMBER_TEST_PIN',is_admin:true,targetType:'event',targetId:'event-1'})});return r.status;});
    expect(response).toBe(403);
    await first.screenshot({path:test.info().outputPath('event-viewers.png')});
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('a report never shows the previous event count while the next event is loading',async({page})=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/src/main.jsx',route=>route.fulfill({contentType:'text/javascript',body:"import '/tests/e2e/fixtures/activity-scope.jsx';"}));
  await page.route('**/api/activity',async route=>{
    const {targetId}=route.request().postDataJSON();
    if(targetId==='event-2')await gate;
    await route.fulfill({json:{viewers:[{memberId:member.id,name:member.name,viewCount:targetId==='event-1'?9:1}],serverTime:'2026-10-24T15:00:00Z'}});
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
  try{
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('9');
    await page.getByRole('button',{name:'Abrir outro evento'}).click();
    await expect(page.getByRole('heading')).toHaveText('event-2');
    await expect(page.getByRole('status')).toHaveText('Consultando');
    release();
    await expect(page.getByRole('status')).toHaveText('1');
    const stale=await page.evaluate(()=>window.activityScopeRenders.filter(render=>render.targetId==='event-2'&&render.count===9));
    expect(stale).toEqual([]);
  }finally{release();}
});

test('events with the same name keep independent readers, counts and observation times',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((person,index)=>({...person,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  app.state.events[0].date='2026-10-24';
  app.state.events.push({...structuredClone(app.state.events[0]),id:'event-2',date:'2026-10-25'});
  try{
    const reader=await app.open(member,undefined,{activity:true});
    await reader.getByRole('button',{name:'Escala',exact:true}).click();
    const openEvent=async(page,index)=>page.getByRole('button',{name:'Ver detalhes →',exact:true}).nth(index).click();
    const closeEvent=async page=>page.locator('.gL2').getByRole('button').first().click();
    const receipts=id=>[...app.state.activityViews.values()].filter(view=>view.memberId===member.id&&view.targetType==='event'&&view.targetId===id);
    await openEvent(reader,0);await expect.poll(()=>receipts('event-1').length).toBe(1);await closeEvent(reader);
    await reader.clock.setFixedTime(new Date('2026-10-24T12:05:00-03:00'));
    await openEvent(reader,0);await expect.poll(()=>receipts('event-1').length).toBe(2);await closeEvent(reader);
    expect(receipts('event-2')).toHaveLength(0);
    await reader.clock.setFixedTime(new Date('2026-10-24T12:10:00-03:00'));
    await openEvent(reader,1);await expect.poll(()=>receipts('event-2').length).toBe(1);await closeEvent(reader);
    const page=await app.open(admin,undefined,{activity:true});
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    for(const index of [0,1,0]){
      await openEvent(page,index);
      await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Ver visualizações de Culto de Teste',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Visualizações da escala',exact:true});
      await expect(dialog.locator('header')).toContainText(index===0?'24/10/2026 · 18:00':'25/10/2026 · 18:00');
      const row=dialog.locator('.ui-activity-readers .ui-activity-person').filter({hasText:'Membro Teste'});
      await expect(row).toContainText(index===0?'12:05':'12:10');
      if(index===0)await expect(row).toContainText('2 visualizações desta escala');
      else await expect(row).not.toContainText('visualizações');
      await dialog.getByRole('button',{name:'Fechar',exact:true}).click();await closeEvent(page);
    }
    expect(receipts('event-1')).toHaveLength(2);expect(receipts('event-2')).toHaveLength(1);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('mural records only visible notices, queues offline observation times and keeps history after reopening',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  app.state.posts=[{id:'post-top',title:'Aviso principal',content:Array(24).fill('Prepare-se para o nosso ensaio.').join('\n'),created_at:'2026-10-24T10:00:00Z',created_by:admin.id},{id:'post-bottom',title:'Aviso no fim',content:'Novo horário para a reunião da equipe.',created_at:'2026-10-23T10:00:00Z',created_by:admin.id}];
  try{
    const first=await app.open(admin,undefined,{activity:true}),second=await app.open(member,undefined,{activity:true});
    await second.getByRole('button',{name:'Mural',exact:true}).click();
    const views=()=>[...app.state.activityViews.values()].filter(v=>v.memberId===member.id);
    await expect.poll(()=>views().some(v=>v.targetId==='post-top')).toBe(true);
    expect(views().some(v=>v.targetId==='post-bottom')).toBe(false);
    await second.context().setOffline(true);
    await second.clock.setFixedTime(new Date('2026-10-24T12:20:00-03:00'));
    await second.locator('[data-main-scroll]').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await expect(second.getByRole('article',{name:'Aviso no fim',exact:true})).toBeInViewport();
    await expect.poll(()=>second.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ls_content_view_v1:')).length)).toBeGreaterThan(0);
    expect(views().some(v=>v.targetId==='post-bottom')).toBe(false);
    app.state.activityNow=Date.parse('2026-10-24T15:30:00Z');
    await second.context().setOffline(false);
    await expect.poll(()=>views().some(v=>v.targetId==='post-bottom')).toBe(true);
    expect(views().find(v=>v.targetId==='post-bottom').viewedAt).toBe('2026-10-24T15:20:00.000Z');
    await second.reload();
    await first.getByRole('button',{name:'Mural',exact:true}).click();
    await first.getByRole('button',{name:'Ver visualizações de Aviso no fim',exact:true}).click();
    const dialog=first.getByRole('dialog',{name:'Visualizações do aviso',exact:true});
    const row=dialog.locator('.ui-activity-readers .ui-activity-person').filter({hasText:'Membro Teste'});
    await expect(row).toContainText('12:20');
    await expect(row).toBeInViewport({ratio:1});
    await first.screenshot({path:test.info().outputPath('mural-viewers.png')});
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const suffix of ['', '/rest/v1/'])test(`monitoring uses the app Supabase connection when the Vercel activity API is misconfigured (${suffix?'Data API URL':'project URL'})`,async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((person,index)=>({...person,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  app.state.events[0].date='2026-10-24';
  app.state.events.push({...structuredClone(app.state.events[0]),id:'event-2',date:'2026-10-25'});
  app.state.posts=[{id:'post-1',title:'Aviso da equipe',content:'Cheguem antes do culto.',created_at:'2026-10-24T10:00:00Z',created_by:admin.id}];
  app.state.activityFailure='O monitoramento ainda não está configurado no servidor.';
  try{
    const viewer=await app.open(admin,undefined,{activity:true,directActivity:'https://activity-fixture.supabase.co'+suffix});
    const reader=await app.open(member,undefined,{activity:true,directActivity:'https://activity-fixture.supabase.co'+suffix});
    await navigate(viewer,'Admin');
    await expect(viewer.locator('.ui-activity-list').getByText('Membro Teste',{exact:true})).toBeVisible();
    await reader.evaluate(({memberId})=>{
      const receipt={memberId,viewId:'11111111-1111-4111-8111-111111111111',targetType:'event',targetId:'event-1',viewedAt:'2026-10-24T14:00:00Z'};
      localStorage.setItem('ls_content_view_v1:'+receipt.viewId,JSON.stringify(receipt));
    },{memberId:member.id});
    await reader.reload();
    await expect.poll(()=>app.state.activityViews.has('11111111-1111-4111-8111-111111111111')).toBe(true);
    await expect.poll(()=>reader.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('ls_content_view_v1:')).length)).toBe(0);
    await reader.getByRole('button',{name:'Escala',exact:true}).click();
    for(const index of [0,1]){
      await reader.getByRole('button',{name:'Ver detalhes →',exact:true}).nth(index).click();
      await expect.poll(()=>[...app.state.activityViews.values()].filter(v=>v.memberId===member.id&&v.targetType==='event'&&v.targetId===`event-${index+1}`).length).toBe(index===0?2:1);
      await reader.locator('.gL2').getByRole('button').first().click();
    }
    await viewer.getByRole('button',{name:'Escala',exact:true}).click();
    await viewer.getByRole('button',{name:'Ver detalhes →',exact:true}).first().click();
    await viewer.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await viewer.getByRole('button',{name:'Ver visualizações de Culto de Teste',exact:true}).click();
    const report=viewer.getByRole('dialog',{name:'Visualizações da escala',exact:true});
    await expect(report.locator('.ui-activity-readers').getByText('Membro Teste',{exact:true})).toBeVisible();
    await expect(report.locator('.ui-activity-readers')).toContainText('2 visualizações desta escala');
    await reader.getByRole('button',{name:'Mural',exact:true}).click();
    await expect.poll(()=>[...app.state.activityViews.values()].filter(v=>v.memberId===member.id&&v.targetType==='announcement'&&v.targetId==='post-1').length).toBe(1);
    const denied=await reader.evaluate(async()=>{
      const response=await fetch('https://activity-fixture.supabase.co/rest/v1/rpc/louvesync_activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_payload:{action:'viewers',memberId:'user-member',pin:'MEMBER_TEST_PIN',is_admin:true,targetType:'event',targetId:'event-1'}})});
      return response.status;
    });
    expect(denied).toBe(403);
    // Closing/reloading a page may interrupt its RPC leave request and use the
    // keepalive API alternative. Reads and view receipts must use the app RPC.
    expect(app.state.activityRequests.filter(request=>request.action!=='leave').every(request=>request.transport==='rpc')).toBe(true);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('missing monitoring setup reports unavailable data instead of declaring everyone offline or unread',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  app.state.activityFailure='O monitoramento precisa ser ativado no banco.';
  try{
    const page=await app.open(admin,undefined,{activity:true});
    await navigate(page,'Admin');
    await expect(page.locator('.ui-activity-monitor')).toContainText(app.state.activityFailure);
    await expect(page.locator('.ui-activity-monitor')).not.toContainText('0 on-line');
    await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Ver visualizações de Culto de Teste',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Visualizações da escala',exact:true});
    await expect(dialog).toContainText(app.state.activityFailure);
    await expect(dialog.getByText(/Sem registro de visualização/)).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('long viewer lists scroll inside a compact dark panel with its close action reachable',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  for(let i=0;i<18;i++){
    const person={...member,id:'reader-'+i,name:'Pessoa de teste '+i,pin:'FIXTURE_PIN'};
    app.state.members.push(person);
    app.state.activityViews.set('seed-'+i,{memberId:person.id,name:person.name,targetType:'event',targetId:'event-1',viewedAt:'2026-10-24T10:00:00.000Z'});
  }
  try{
    const page=await app.open(admin,undefined,{activity:true});
    await page.setViewportSize({width:360,height:640});
    await page.getByRole('button',{name:'Tema',exact:true}).click();
    await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Ver visualizações de Culto de Teste',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Visualizações da escala',exact:true});
    const content=dialog.locator('.ui-dialog-content'),footer=dialog.locator('footer');
    await expect(dialog.getByText('Pessoa de teste 0',{exact:true})).toBeVisible();
    const before=await footer.boundingBox();
    await content.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await expect(dialog.getByText('Pessoa de teste 17',{exact:true})).toBeInViewport();
    const after=await footer.boundingBox();expect(Math.abs(after.y-before.y)).toBeLessThan(1);
    await expect(footer.getByRole('button',{name:'Fechar',exact:true})).toBeInViewport({ratio:1});
    await page.screenshot({path:test.info().outputPath('viewers-dark-long-list.png')});
    await footer.getByRole('button',{name:'Fechar',exact:true}).click();
    await expect(dialog).toHaveCount(0);expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('event presence updates both open event panels and returning from a song restores Escala', async ({browser}) => {
  const app=await fixture(browser);
  try {
    const first=await app.open(admin), second=await app.open(member);
    for(const page of [first,second]) { await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click(); }
    await second.locator('.gL2').getByRole('button',{name:'Confirmar',exact:true}).click();
    await first.locator('.gL2').getByRole('button',{name:/^Equipe/}).click();await second.locator('.gL2').getByRole('button',{name:/^Equipe/}).click();
    await expect(first.locator('.gL2').getByText('Confirmado',{exact:true})).toBeVisible();
    await expect(second.locator('.gL2').getByText('Confirmado',{exact:true})).toBeVisible();
    await first.locator('.gL2').getByRole('button',{name:/^Setlist/}).click();
    await first.locator('.gL2').getByText('Teste adoracao',{exact:true}).click();
    await first.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(first.locator('.nb.on')).toHaveText('Escala');
    await expect(first.locator('.gL2').getByText('Culto de Teste',{exact:true})).toBeVisible();
    expect(app.failures).toEqual([]);
  } finally {await app.close();}
});
const attendanceToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const attendanceTime = attendanceToday + 'T12:00:00-03:00';
function attendanceFixtures(app) {
  for (const person of app.state.members) person.pin = 'SYNTHETIC_' + person.id;
  for (let index = 3; index <= 10; index++) app.state.members.push({ ...member, id: 'called-' + index, name: `Integrante ${String(index).padStart(2, '0')}`, pin: 'SYNTHETIC_CALLED_' + index, instrument: index % 2 ? 'Violão' : 'Vocal' });
  const called = [...app.state.members];
  const leader = { ...member, id: 'leader', name: 'Líder Teste', role: 'Líder de Louvor', pin: 'SYNTHETIC_LEADER' };
  app.state.members.push(leader);
  app.state.events = [{ ...structuredClone(initialEvents[0]), date: attendanceToday, event_songs: [], event_members: called.map((person, index) => ({ member_id: person.id, confirmed: index === 0 ? true : index === 1 ? false : null })) }];
  return { called, leader };
}
async function openAttendanceCall(page) {
  await page.getByRole('button', { name: 'Escala', exact: true }).click();
  const card = page.getByRole('article', { name: 'Culto de Teste', exact: true });
  await card.getByRole('button', { name: 'Registrar presença', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
  await card.getByRole('button', { name: 'Registrar presença', exact: true }).click();
  const screen = page.getByRole('region', { name: 'Presenças do ministério', exact: true });
  await expect(screen.getByRole('listitem')).toHaveCount(10, { timeout: 15000 });
  return screen;
}

test('leader attendance records five of ten present through the real SQL API and retains reports, exports and RSVP after reload', async ({ browser }) => {
  const app = await fixture(browser); attendanceFixtures(app); let finishSave;
  try {
    const page = await app.open(admin, attendanceTime, { attendance: true });
    const screen = await openAttendanceCall(page);
    await expect(screen).toContainText('10 não marcados');
    await expect(screen.locator('.attendance-choices [aria-pressed="true"]')).toHaveCount(0);
    for (let index = 0; index < 10; index++) await screen.getByRole('listitem').nth(index).getByRole('button', { name: index < 5 ? /como presente$/ : /como ausente$/ }).click();
    await expect(screen.getByRole('region', { name: 'Resumo da chamada' })).toContainText('5 ausentes');
    app.state.attendanceSaveGate = new Promise(resolve => { finishSave = resolve; });
    await screen.getByRole('button', { name: 'Concluir chamada', exact: true }).click();
    await expect(screen.getByRole('button', { name: 'Salvando…', exact: true })).toBeDisabled();
    await expect(screen).not.toContainText('Chamada concluída e salva'); finishSave();
    await expect(screen.getByRole('status')).toContainText('Chamada concluída e salva');
    const rsvp = (await app.attendanceQuery("select member_id,confirmed from event_members where event_id='event-1' order by member_id")).rows;
    expect(rsvp.find(row => row.member_id === admin.id).confirmed).toBe(true); expect(rsvp.find(row => row.member_id === member.id).confirmed).toBe(false);
    expect((await app.attendanceQuery('select count(*)::int as n from louvesync_attendance_revisions')).rows[0].n).toBe(1);
    await screen.getByRole('button', { name: 'Eventos e frequência', exact: true }).click();
    await expect(screen.getByRole('region', { name: 'Frequência no período' })).toContainText('50%');
    await expect(screen.locator('.attendance-event-choice')).toContainText('5 presentes de 10 escalados');
    await screen.getByRole('button', { name: 'Por integrante', exact: true }).click();
    await expect(screen.locator('.attendance-frequency')).toHaveCount(10);
    const csvEvent = page.waitForEvent('download'); await screen.getByRole('button', { name: 'CSV', exact: true }).click();
    const download = await csvEvent, path = test.info().outputPath('attendance.csv'); await download.saveAs(path);
    const csv = fs.readFileSync(path, 'utf8'); expect(csv).toContain('Admin Teste'); expect(csv).toContain('Ausente'); expect(csv).toContain('Presente');
    await app.reload(page); await page.getByRole('button', { name: 'Mais', exact: true }).click(); await page.getByRole('button', { name: 'Presenças', exact: true }).click();
    await expect(page.locator('.attendance-overview')).toContainText('50%');
    expect(app.failures).toEqual([]);
  } finally { finishSave?.(); await app.close(); }
});

test('non-admin ministry leaders can save partial attendance through the native RPC without treating pending people as absent', async ({ browser }) => {
  const app = await fixture(browser), { leader } = attendanceFixtures(app);
  try {
    const page = await app.open(leader, attendanceTime, { attendance: true, directActivity: true });
    const screen = await openAttendanceCall(page);
    await screen.getByRole('listitem', { name: 'Admin Teste', exact: true }).getByRole('button', { name: /como presente$/ }).click();
    await screen.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect(screen.getByRole('status')).toContainText('Rascunho salvo');
    await expect(screen).toContainText('9 não marcados'); await expect(screen).toContainText('0 ausentes');
    await screen.getByRole('button', { name: 'Eventos e frequência', exact: true }).click();
    await expect(screen.locator('.attendance-overview')).toContainText('0 chamadas concluídas');
    await screen.getByRole('button', { name: 'Por integrante', exact: true }).click(); await expect(screen.locator('.attendance-frequency')).toHaveCount(0);
    expect(app.state.attendanceRequests.filter(row => row.action === 'save')).toHaveLength(1);
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

test('leader attendance rejects stale concurrent edits, protects unsaved changes and lets the user refresh deliberately', async ({ browser }) => {
  const app = await fixture(browser); attendanceFixtures(app);
  try {
    const one = await app.open(admin, attendanceTime, { attendance: true }), two = await app.open(admin, attendanceTime, { attendance: true });
    const first = await openAttendanceCall(one), second = await openAttendanceCall(two);
    await first.getByRole('listitem', { name: 'Admin Teste', exact: true }).getByRole('button', { name: /como presente$/ }).click();
    await first.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(first.getByRole('status')).toContainText('Rascunho salvo');
    await second.getByRole('listitem', { name: 'Admin Teste', exact: true }).getByRole('button', { name: /como ausente$/ }).click();
    await second.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('alterada em outro aparelho');
    await expect(second.getByRole('listitem', { name: 'Admin Teste', exact: true })).toHaveAttribute('data-status', 'absent');
    await two.getByRole('button', { name: 'Início', exact: true }).click(); await expect(two.getByText('Descartar alterações da chamada?', { exact: true })).toBeVisible();
    await two.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(second).toBeVisible();
    await two.getByRole('button', { name: 'Mais', exact: true }).click(); await two.getByRole('region', { name: 'Mais', exact: true }).getByRole('button', { name: 'Presenças', exact: true }).click();
    await expect(two.getByText('Descartar alterações da chamada?', { exact: true })).toBeVisible(); await two.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await two.getByRole('region', { name: 'Mais', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).click();
    await second.getByRole('button', { name: 'Atualizar chamada', exact: true }).click(); await two.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(second.getByRole('listitem', { name: 'Admin Teste', exact: true })).toHaveAttribute('data-status', 'present');
    expect((await app.attendanceQuery('select version from louvesync_attendance_sheets')).rows[0].version).toBe(1);
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

test('leader attendance preserves notes on validation and network errors and requires a reason for justified absence', async ({ browser }) => {
  const app = await fixture(browser); attendanceFixtures(app);
  try {
    const page = await app.open(admin, attendanceTime, { attendance: true }), screen = await openAttendanceCall(page);
    const person = screen.getByRole('listitem', { name: 'Admin Teste', exact: true });
    await person.getByRole('button', { name: /como falta justificada$/ }).click();
    await screen.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(screen.getByRole('alert')).toContainText('motivo');
    await person.getByRole('textbox', { name: 'Observação de Admin Teste', exact: true }).fill('Avisou à liderança que estava doente.');
    app.state.attendanceSaveError = 'Fixture unavailable';
    await screen.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(screen.getByRole('alert')).toContainText('Não foi possível');
    await expect(person.getByRole('textbox')).toHaveValue('Avisou à liderança que estava doente.');
    await page.context().setOffline(true); await expect(screen.getByRole('button', { name: 'Salvar rascunho', exact: true })).toBeDisabled();
    await page.context().setOffline(false); app.state.attendanceSaveError = null;
    await screen.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(screen.getByRole('status')).toContainText('Rascunho salvo');
    await expect(screen).toContainText('1 justificada'); expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

test('ordinary members cannot open leader attendance or spoof leadership through the real attendance endpoint', async ({ browser }) => {
  const app = await fixture(browser); attendanceFixtures(app);
  try {
    const page = await app.open(member, attendanceTime, { attendance: true });
    await page.getByRole('button', { name: 'Escala', exact: true }).click(); await expect(page.getByRole('button', { name: 'Registrar presença', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mais', exact: true }).click(); await expect(page.getByRole('button', { name: 'Presenças', exact: true })).toHaveCount(0);
    const result = await page.evaluate(async body => { const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, data: await response.json() }; }, { action: 'get', eventId: 'event-1', memberId: member.id, pin: 'SYNTHETIC_' + member.id, is_admin: true, role: 'Líder de Louvor' });
    expect(result.status).toBe(403); expect(result.data.error).toContain('liderança'); expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

for (const theme of ['light', 'dark']) test(`leader attendance keeps ten people, search and controls usable at 390 and 320 pixels in ${theme}`, async ({ browser }) => {
  const app = await fixture(browser); attendanceFixtures(app);
  try {
    const page = await app.open(admin, attendanceTime, { attendance: true, theme, device: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, standalone: true });
    const screen = await openAttendanceCall(page);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
    await screen.getByRole('listitem', { name: 'Admin Teste', exact: true }).getByRole('button', { name: /como presente$/ }).click();
    await screen.getByRole('listitem', { name: 'Membro Teste', exact: true }).getByRole('button', { name: /como ausente$/ }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await page.locator('[data-main-scroll]').evaluate(element => { element.scrollTop = 0; });
      expect(await screen.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`attendance-call-${theme}-${width}.png`), scale: 'css' });
      await page.locator('[data-main-scroll]').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const footer = await screen.locator('.attendance-savebar').boundingBox(), nav = await page.locator('.app-nav .gNav').boundingBox(); expect(footer.y + footer.height).toBeLessThan(nav.y - 8);
    }
    await screen.getByRole('searchbox', { name: 'Buscar integrante na chamada', exact: true }).fill('Admin Teste'); await expect(screen.getByRole('listitem')).toHaveCount(1);
    await expect(screen).toContainText('10 escalados'); await screen.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await expect(screen.getByRole('status')).toContainText('Rascunho salvo');
    await screen.getByRole('button', { name: 'Eventos e frequência', exact: true }).click(); await page.locator('[data-main-scroll]').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath(`attendance-overview-${theme}.png`), scale: 'css' });
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

async function openSetlistCard(page, label = 'Culto de Teste') {
  await page.getByRole('button', { name: 'Escala', exact: true }).click();
  const card = page.getByRole('article', { name: label, exact: true });
  await card.locator('.schedule-music > summary').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await card.locator('.schedule-music > summary').click();
  return card;
}

test('setlist approval persists across devices and reloads without confirming attendance, and admins can withdraw it', async ({ browser }) => {
  const app = await fixture(browser); let finishSave;
  try {
    app.state.setlistSaveGate = new Promise(resolve => { finishSave = resolve; });
    const page = await app.open(), teammate = await app.open(member);
    const card = await openSetlistCard(page), teamCard = await openSetlistCard(teammate);
    await expect(card.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    await expect(teamCard.getByRole('button', { name: 'Confirmar setlist', exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Salvando…', exact: true })).toBeDisabled();
    await expect(card.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    expect(app.state.events[0].event_songs.filter(decodeEventPreferences)).toHaveLength(0);
    finishSave();
    await expect(card.locator('.setlist-badge')).toHaveText('Setlist definido');
    await expect(teamCard.locator('.setlist-badge')).toHaveText('Setlist definido');
    expect(app.state.events[0].event_members.map(row => row.confirmed)).toEqual([null, null]);
    expect(app.state.presenceRequests || []).toEqual([]);
    await expect(card).toContainText('Confirmado por Admin Teste');
    await app.reload(page); await page.getByRole('button', { name: 'Escala', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Culto de Teste', exact: true }).locator('.setlist-badge')).toHaveText('Setlist definido');
    await page.getByRole('button', { name: 'Ver detalhes →', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.getByRole('button', { name: 'Ver detalhes →', exact: true }).click();
    const sheet = page.locator('.gL2');
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist definido');
    await sheet.getByRole('button', { name: 'Retirar confirmação', exact: true }).click();
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    await expect(teamCard.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    expect(normalizeEvent(app.state.events[0]).setlist_confirmation).toBeNull();
    expect(app.failures).toEqual([]);
  } finally { finishSave?.(); await app.close(); }
});

test('setlist approval becomes pending after song order, vocalist and key edits and can be reconfirmed from event details', async ({ browser }) => {
  const app = await fixture(browser);
  try {
    const page = await app.open(), card = await openSetlistCard(page);
    await card.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(card.locator('.setlist-badge')).toHaveText('Setlist definido');
    await card.getByRole('button', { name: 'Editar evento Culto de Teste', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Editar evento', exact: true });
    await editor.getByRole('tab', { name: 'Setlist', exact: true }).click();
    await editor.getByRole('button', { name: 'Descer Teste adoracao', exact: true }).click();
    await editor.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
    await expect(editor).toHaveCount(0); await expect(card.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    await card.getByRole('button', { name: 'Ver detalhes →', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await card.getByRole('button', { name: 'Ver detalhes →', exact: true }).click();
    const sheet = page.locator('.gL2');
    await sheet.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist definido');
    await sheet.getByLabel('Vocal principal de Teste adoracao', { exact: true }).selectOption(member.id);
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    await expect(sheet).toContainText('Alterado após a confirmação');
    await sheet.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist definido');
    const song = sheet.locator('.event-setlist-song').filter({ has: page.getByRole('button', { name: 'Abrir cifra de Teste adoracao', exact: true }) });
    await song.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await song.locator('#adj-key-song-0').selectOption('D#');
    await song.getByRole('button', { name: 'Salvar Ajustes', exact: true }).click();
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    await sheet.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(sheet.locator('.setlist-badge')).toHaveText('Setlist definido');
    expect(isSetlistConfirmed(normalizeEvent(app.state.events[0]), app.state.songs)).toBe(true);
    expect(app.state.events[0].event_members.map(row => row.confirmed)).toEqual([null, null]);
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

test('setlist approval errors and offline mode retain a pending status and empty sets cannot be confirmed', async ({ browser }) => {
  const app = await fixture(browser);
  try {
    app.state.setlistSaveError = 'Falha ao salvar no banco';
    const page = await app.open(), card = await openSetlistCard(page);
    await card.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(card.getByRole('alert')).toHaveText('Falha ao salvar no banco');
    await expect(card.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    app.state.setlistSaveError = null;
    await page.context().setOffline(true);
    await expect(card.getByRole('button', { name: 'Confirmar setlist', exact: true })).toBeDisabled();
    await expect(card).toContainText('Conecte-se para salvar a confirmação');
    expect(app.state.setlistRequests).toHaveLength(1);
    await page.context().setOffline(false);
    app.state.events[0].event_songs = [];
    await app.reload(page); const empty = await openSetlistCard(page);
    await expect(empty.getByRole('button', { name: 'Confirmar setlist', exact: true })).toBeDisabled();
    await expect(empty).toContainText('Adicione músicas antes de confirmar');
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

test('setlist approval rejects an out of date screen and a failed database readback without displaying a green badge', async ({ browser }) => {
  const app = await fixture(browser);
  try {
    const page = await app.open(), card = await openSetlistCard(page);
    app.state.events[0].event_songs[0].singer_member_id = member.id;
    await card.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(card.getByRole('alert')).toContainText('O repertório mudou');
    expect(app.state.setlistRequests || []).toHaveLength(0);
    await app.reload(page); const current = await openSetlistCard(page);
    app.state.setlistReadbackError = 'Não foi possível verificar a gravação';
    await current.getByRole('button', { name: 'Confirmar setlist', exact: true }).click();
    await expect(current.getByRole('alert')).toHaveText('Não foi possível verificar a gravação');
    await expect(current.locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

for (const theme of ['light', 'dark']) test(`setlist confirmation badges fit small screens and reach Home and rehearsal in ${theme}`, async ({ browser }) => {
  const app = await fixture(browser);
  const event = normalizeEvent(app.state.events[0]);
  app.state.events[0].event_songs.push({ id: 90, item_type: 'note', song_id: null, order_index: 4, note_text: encodeEventPreferences({ setlist_confirmation: { version: 1, snapshot: setlistSnapshot(event, app.state.songs), confirmed_by: admin.id, confirmed_at: '2026-10-24T15:00:00Z' } }) });
  app.state.events.push({ ...structuredClone(initialEvents[0]), id: 'draft', label: 'Culto em revisão', time: '19:30:00' });
  try {
    const page = await app.open(admin, undefined, { theme, device: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, standalone: true });
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;}' });
    await expect(page.getByRole('region', { name: 'Repertório do evento', exact: true }).locator('.setlist-badge')).toHaveText('Setlist definido');
    await page.getByRole('button', { name: 'Escala', exact: true }).click();
    const screen = page.getByRole('region', { name: 'Escala semanal', exact: true });
    await expect(screen.getByRole('article', { name: 'Culto em revisão', exact: true }).locator('.setlist-badge')).toHaveText('Setlist não confirmado');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-main-scroll]').evaluate(element => { element.scrollTop = 0; });
      expect(await screen.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`setlist-confirmation-${theme}-${width}.png`), scale: 'css' });
      const draft = screen.getByRole('article', { name: 'Culto em revisão', exact: true });
      await draft.locator('.schedule-music > summary').evaluate(element => element.scrollIntoView({ block: 'center' }));
      await draft.locator('.schedule-music > summary').click();
      await draft.evaluate(element => element.scrollIntoView({ block: 'center' }));
      expect(await draft.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(draft.getByRole('button', { name: 'Confirmar setlist', exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`setlist-confirmation-draft-${theme}-${width}.png`), scale: 'css' });
      await draft.locator('.schedule-music > summary').click();
    }
    await page.getByRole('button', { name: 'Mais', exact: true }).click();
    await page.getByRole('button', { name: 'Ensaio', exact: true }).click();
    await expect(page.locator('.rehearsal-studio > .setlist-badge')).toHaveText('Setlist definido');
    expect(app.failures).toEqual([]);
  } finally { await app.close(); }
});

function scheduleFixtures(app) {
  app.state.events[0].event_songs[0].sequence=encodeSequence('Intro','Eb');
  app.state.events.unshift({...structuredClone(initialEvents[0]),id:'tuesday',date:'2026-10-20',time:'19:30:00',type:'ebd',label:'Estudo bíblico',theme:'Crescendo na Palavra',event_songs:[],event_members:[{member_id:admin.id,confirmed:true}]},
    {...structuredClone(initialEvents[0]),id:'thursday',date:'2026-10-22',time:'19:00:00',label:'Culto da quinta',event_members:[{member_id:member.id,confirmed:true}]},rehearsalEvent(),
    {...structuredClone(initialEvents[0]),id:'sunday-morning',time:'09:00:00',type:'consagracao',label:'Consagração da manhã',event_songs:[],event_members:[{member_id:member.id,confirmed:null}]});
  app.state.events.push({...structuredClone(initialEvents[0]),id:'following-week',date:'2026-10-26',time:'20:00:00',type:'outro',label:'Reunião de planejamento',event_songs:[{song_id:'song-2',order_index:1}]},
    {...structuredClone(initialEvents[0]),id:'previous-week',date:'2026-10-18',label:'Culto anterior',event_members:[{member_id:admin.id,confirmed:false}]});
}

for(const theme of ['light','dark'])test(`weekly schedule groups the full week and retains its context without the Home hero in ${theme}`,async({browser})=>{
  const app=await fixture(browser);scheduleFixtures(app);
  try{
    const page=await app.open(admin,undefined,{theme,device:{...devices['iPhone 13'],viewport:{width:390,height:844}},standalone:true});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;}'});
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    const screen=page.getByRole('region',{name:'Escala semanal',exact:true}),week=screen.getByRole('region',{name:'Semana da escala',exact:true});
    await expect(screen.locator('.schedule-event')).toHaveCount(5);
    expect(await screen.locator('.schedule-event').evaluateAll(cards=>cards.map(card=>card.getAttribute('aria-label')))).toEqual(['Estudo bíblico','Culto da quinta','Ensaio da equipe','Consagração da manhã','Culto de Teste']);
    await expect(screen.locator('.schedule-day')).toHaveCount(4);await expect(week.getByRole('group',{name:'Dias da semana'}).getByRole('button')).toHaveCount(7);
    await expect(week).toContainText('5 eventos');await expect(week).toContainText('3 na sua escala · 1 a confirmar');
    await expect(screen.locator('.home-hero')).toHaveCount(0);await expect(screen.locator('img[src="/images/home/worship-stage.webp"]')).toHaveCount(0);
    for(const [label,art] of [['Estudo bíblico','devotional'],['Ensaio da equipe','rehearsal'],['Culto de Teste','music']]){
      const image=screen.getByRole('article',{name:label,exact:true}).locator('.schedule-event-art img');await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',`/images/more/${art}.webp`);await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    }
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});
      expect(await screen.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await page.screenshot({path:test.info().outputPath(`weekly-schedule-${theme}-${width}.png`),scale:'css'});
      await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      const last=await screen.locator('.schedule-event').last().boundingBox();expect(last.y+last.height).toBeLessThan((await page.locator('.app-nav .gNav').boundingBox()).y-8);
    }
    await page.setViewportSize({width:390,height:844});await week.evaluate(element=>element.scrollIntoView({block:'center'}));
    await week.locator('[data-date="2026-10-24"]').click();await expect(screen.locator('.schedule-event')).toHaveCount(5);
    const practice=screen.getByRole('article',{name:'Ensaio da equipe',exact:true});await expect(practice).not.toContainText('Músicas');
    await practice.locator('.schedule-team > summary').click();await expect(practice.locator('.schedule-team li strong')).toHaveText(['Admin Teste','Membro Teste']);
    const service=screen.getByRole('article',{name:'Culto de Teste',exact:true});await service.locator('.schedule-music > summary').evaluate(element=>element.scrollIntoView({block:'center'}));await service.locator('.schedule-music > summary').click();
    await expect(service.locator('.schedule-music li > div > span:first-child')).toHaveText(['Teste adoracao','Teste ceia','Teste jubilo']);await expect(service.locator('.schedule-music li > small').first()).toHaveText('Eb');
    await week.evaluate(element=>element.scrollIntoView({block:'center'}));await week.getByRole('button',{name:'Próxima semana',exact:true}).click();await expect(screen.getByRole('article',{name:'Reunião de planejamento',exact:true})).toBeVisible();
    const nextRange=await week.getByRole('heading').innerText();await screen.getByRole('group',{name:'Filtrar escala'}).getByRole('button',{name:'Minha escala',exact:true}).click();
    await screen.getByRole('button',{name:'Ver detalhes →',exact:true}).click();await page.locator('.gL2').getByRole('button',{name:'Abrir cifra de Teste jubilo',exact:true}).click();
    await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click();
    await expect(week.getByRole('heading')).toHaveText(nextRange);await expect(screen.getByRole('button',{name:'Minha escala',exact:true})).toHaveAttribute('aria-pressed','true');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('weekly schedule gives members a complete agenda and personal filter while creation and editing remain admin-only',async({browser})=>{
  const app=await fixture(browser);scheduleFixtures(app);
  try{
    const page=await app.open(member);await page.getByRole('button',{name:'Escala',exact:true}).click();const screen=page.getByRole('region',{name:'Escala semanal',exact:true});
    await expect(screen.locator('.schedule-event')).toHaveCount(5);await expect(screen.getByRole('button',{name:'Novo',exact:true})).toHaveCount(0);await expect(screen.getByRole('button',{name:/^(Editar|Excluir) evento/})).toHaveCount(0);
    await screen.getByRole('button',{name:'Minha escala',exact:true}).click();await expect(screen.locator('.schedule-event')).toHaveCount(4);await expect(screen.getByRole('article',{name:'Estudo bíblico',exact:true})).toHaveCount(0);
    await screen.getByRole('button',{name:'Semana anterior',exact:true}).click();await expect(screen).toContainText('Você não está escalado nesta semana');
    await screen.getByRole('button',{name:'Ver todos os eventos',exact:true}).click();await expect(screen.getByRole('article',{name:'Culto anterior',exact:true})).toBeVisible();
    await screen.getByRole('button',{name:'Ir para Hoje',exact:true}).click();await expect(screen.locator('.schedule-event')).toHaveCount(5);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('weekly schedule creates on the chosen empty day and exports filtered event history with correct attendance',async({browser})=>{
  const app=await fixture(browser);scheduleFixtures(app);
  try{
    const page=await app.open();await page.getByRole('button',{name:'Escala',exact:true}).click();const screen=page.getByRole('region',{name:'Escala semanal',exact:true});
    await screen.getByRole('button',{name:'Próxima semana',exact:true}).click();await screen.getByRole('button',{name:'Próxima semana',exact:true}).click();
    await expect(screen).toContainText('Nenhum evento esta semana');await screen.locator('.schedule-week-days [data-date="2026-11-04"]').click();await screen.getByRole('button',{name:'Criar neste dia',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Novo evento',exact:true});await expect(editor.getByLabel('Data',{exact:true})).toHaveValue('2026-11-04');await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
    await screen.getByRole('button',{name:'Histórico',exact:true}).click();await expect(screen.locator('.schedule-event')).toHaveCount(3);
    expect(await screen.locator('.schedule-event').evaluateAll(cards=>cards.map(card=>card.getAttribute('aria-label')))).toEqual(['Culto da quinta','Estudo bíblico','Culto anterior']);
    await screen.getByRole('button',{name:'Minha escala',exact:true}).click();await expect(screen.locator('.schedule-event')).toHaveCount(2);
    const downloadEvent=page.waitForEvent('download');await screen.getByRole('button',{name:'Exportar CSV',exact:true}).click();const download=await downloadEvent;const path=test.info().outputPath('schedule-history.csv');await download.saveAs(path);const csv=fs.readFileSync(path,'utf8');
    expect(csv).toContain('Estudo bíblico');expect(csv).toContain('Culto anterior');expect(csv).not.toContain('Culto da quinta');expect(csv).toContain('"0","1","0"');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('weekly schedule attendance updates the correct card and restores a failed response',async({browser})=>{
  const app=await fixture(browser);
  app.state.events.push({...structuredClone(initialEvents[0]),id:'second-service',time:'20:00:00',label:'Segundo culto'});
  try{
    const page=await app.open();await page.getByRole('button',{name:'Escala',exact:true}).click();const screen=page.getByRole('region',{name:'Escala semanal',exact:true});
    const first=screen.getByRole('article',{name:'Culto de Teste',exact:true}),second=screen.getByRole('article',{name:'Segundo culto',exact:true});
    app.state.presenceSaveError='Falha de teste';await first.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Presença não salva');await expect(first.getByRole('button',{name:'Confirmar',exact:true})).toBeEnabled();
    delete app.state.presenceSaveError;await second.evaluate(element=>element.scrollIntoView({block:'center'}));await second.getByRole('button',{name:'Confirmar',exact:true}).click();await expect.poll(()=>app.state.events.find(event=>event.id==='second-service').event_members[0].confirmed).toBe(true);
    expect(app.state.events.find(event=>event.id==='event-1').event_members[0].confirmed).toBeNull();await expect(second).toContainText('Presença confirmada');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('today calendar navigation completes and ordinary members cannot create or edit events', async ({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(member);await page.getByRole('button',{name:'Escala',exact:true}).click();
    await expect(page.getByRole('button',{name:'Novo',exact:true})).toHaveCount(0);
    const calendar=page.getByRole('region',{name:'Semana da escala',exact:true});
    const initialRange=await calendar.getByRole('heading').innerText();
    await calendar.getByRole('button',{name:'Semana anterior',exact:true}).click();
    await page.getByRole('button',{name:'Ir para Hoje',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ir para Hoje',exact:true})).toHaveCount(0);
    await expect(calendar.getByRole('heading')).toHaveText(initialRange);
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Excluir',exact:true})).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('manual chord editing accepts spaces, vocal transposition renders and PDF contains the transposed text',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();await navigate(page,'Músicas');
    await page.getByText('Teste adoracao',{exact:true}).click();await page.getByRole('button',{name:'✎ Editar',exact:true}).click();
    const editor=page.locator('textarea');await editor.fill('[C]AB');await editor.press('End');await editor.press('Space');await editor.press('C');
    await expect(editor).toHaveValue('[C]AB C');await page.getByRole('button',{name:'✓ Salvar Letra',exact:true}).click();
    await page.getByRole('combobox',{name:'Tom da cifra',exact:true}).selectOption('D');
    await expect(page.locator('.lyrics-content')).toContainText('D');
    await page.emulateMedia({media:'print'});await expect(page.locator('#print-cifra')).toBeVisible();
    await expect(page.locator('#print-cifra pre')).toContainText('[D]AB C');
    await page.pdf({path:test.info().outputPath('cifra.pdf'),format:'A4'});
    expect(fs.statSync(test.info().outputPath('cifra.pdf')).size).toBeGreaterThan(1000);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('new-song manual path works immediately and Santa Ceia includes every category',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();await navigate(page,'Músicas');await page.getByRole('button',{name:'Adicionar',exact:true}).click();
    await page.getByRole('button',{name:'⌨️ Digitar cifra manualmente',exact:true}).click();await expect(page.locator('textarea')).toBeVisible();
    await app.reload(page);await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.getByRole('tab',{name:'Setlist',exact:true}).click();
    await page.getByText('Pedidos e Santa Ceia',{exact:true}).click();
    const select=page.getByRole('combobox',{name:'Música da Santa Ceia',exact:true});
    expect(await select.locator('option').allTextContents()).toEqual(['Nenhuma',...songs.map(song=>`${song.title} (${song.artist})`)]);
    await select.selectOption('song-0');await expect(select).toHaveValue('song-0');
    const requested=page.getByRole('combobox',{name:'Músicas pedidas',exact:true});
    expect(await requested.locator('option').allTextContents()).toEqual(['+ Adicionar música pedida...',...songs.map(song=>`${song.title} (${song.artist})`)]);
    await requested.selectOption('song-2');await expect(page.getByRole('button',{name:'Remover pedido Teste jubilo',exact:true})).toBeVisible();
    const list=page.locator('div').filter({has:page.locator('button',{hasText:'Teste ceia'})});
    expect(await list.count()).toBeGreaterThan(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('approved social mural preserves failed drafts and shares comments and reactions',async({browser})=>{
 const app=await fixture(browser);
 try{
  const first=await app.open(admin),second=await app.open(member);
  for(const page of [first,second])await page.getByRole('button',{name:'Mural',exact:true}).click();
  await expect(second.getByRole('button',{name:'Novo Aviso',exact:true})).toHaveCount(0);
  await first.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  const dialog=first.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await dialog.getByPlaceholder('Título do post *').fill('Ensaio de sábado');
  await dialog.getByPlaceholder('Escreva o comunicado aqui...').fill('Vamos revisar as transições às 15h.');
  app.state.muralInsertError='Falha de conexão simulada';
  await dialog.getByRole('button',{name:'Publicar',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Falha de conexão simulada');
  await expect(dialog.getByPlaceholder('Título do post *')).toHaveValue('Ensaio de sábado');
  app.state.muralInsertError=null;
  await dialog.getByRole('button',{name:'Publicar',exact:true}).click();await expect(dialog).toHaveCount(0);
  const post=second.locator('.community-post').filter({has:second.getByRole('heading',{name:'Ensaio de sábado',exact:true})});
  await expect(post).toBeVisible();
  await post.getByRole('button',{name:'Curtir',exact:true}).click();await expect(post.getByRole('button',{name:'Curtir',exact:true})).toHaveAttribute('aria-pressed','true');
  await post.getByRole('button',{name:'Curtir',exact:true}).click();await expect(post.getByRole('button',{name:'Curtir',exact:true})).toHaveAttribute('aria-pressed','false');
  await post.getByRole('button',{name:'Comentar',exact:true}).click();
  await post.getByRole('textbox',{name:'Escrever comentário em Ensaio de sábado',exact:true}).fill('Estarei lá!');
  await post.getByRole('button',{name:'Enviar',exact:true}).click();
  await expect(first.locator('.community-post').getByText('Estarei lá!',{exact:true})).toBeVisible();
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});
for(const storedId of ['database-post-101',101])test(`a new mural post uses its confirmed database ID for recording and consulting views (${typeof storedId})`,async({browser})=>{
 const app=await fixture(browser);
 app.state.members=app.state.members.map((person,index)=>({...person,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
 app.state.muralGeneratedId=storedId;
 app.state.muralRejectLocalIds=true;
 try{
  const first=await app.open(admin,undefined,{activity:true,directActivity:true});
  const second=await app.open(member,undefined,{activity:true,directActivity:true});
  for(const page of [first,second])await page.getByRole('button',{name:'Mural',exact:true}).click();
  await first.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  const composer=first.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await composer.getByPlaceholder('Título do post *').fill('Louvor novo');
  await composer.getByPlaceholder('Escreva o comunicado aqui...').fill('Vamos estudar o novo arranjo.');
  await composer.getByRole('button',{name:'Publicar',exact:true}).click();await expect(composer).toHaveCount(0);
  await expect(second.getByRole('article',{name:'Louvor novo',exact:true})).toBeVisible();
  await expect.poll(()=>[...app.state.activityViews.values()].some(view=>view.memberId===member.id&&view.targetId===String(storedId))).toBe(true);
  await first.getByRole('button',{name:'Ver visualizações de Louvor novo',exact:true}).click();
  const report=first.getByRole('dialog',{name:'Visualizações do aviso',exact:true});
  await expect(report.locator('.ui-activity-readers').getByText('Membro Teste',{exact:true})).toBeVisible();
  await expect(report.getByRole('alert')).toHaveCount(0);
  expect(app.state.activityRequests.filter(request=>request.targetType==='announcement').every(request=>request.targetId===String(storedId))).toBe(true);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('mural preserves the draft instead of claiming publication when the database client is unavailable',async({browser})=>{
 const app=await fixture(browser);
 try{
  const page=await app.open(admin,undefined,{noSupabase:true});
  await page.getByRole('button',{name:'Mural',exact:true}).click();
  await page.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  const composer=page.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await composer.getByPlaceholder('Título do post *').fill('Aviso que precisa ser salvo');
  await composer.getByPlaceholder('Escreva o comunicado aqui...').fill('Texto que deve continuar disponível.');
  await composer.getByRole('button',{name:'Publicar',exact:true}).click();
  await expect(composer.getByRole('alert')).toContainText('A conexão com o mural está indisponível');
  await expect(composer.getByPlaceholder('Título do post *')).toHaveValue('Aviso que precisa ser salvo');
  await expect(page.getByRole('article',{name:'Aviso que precisa ser salvo',exact:true})).toHaveCount(0);
  expect(app.state.posts).toHaveLength(0);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('an own cached notice missing from the database is recoverable and never opens a nonexistent viewers report',async({browser})=>{
 const app=await fixture(browser);
 const ghost={id:'post-cached-only',title:'Louvor novo',content:'Estudar o arranjo completo.',created_at:'2026-10-24T10:00:00Z',created_by:admin.id,_publication:'confirmed'};
 try{
  const page=await app.open(admin,undefined,{activity:true,muralCache:{posts:[ghost]}});
  await navigate(page,'Mural');
  const post=page.getByRole('article',{name:'Louvor novo',exact:true});
  await expect(post.getByRole('status')).toContainText('não foi localizado no banco');
  await expect(post.getByRole('button',{name:/Ver visualizações/})).toHaveCount(0);
  await expect(post.getByRole('button',{name:'Curtir',exact:true})).toBeDisabled();
  await post.getByRole('button',{name:'Verificar publicação',exact:true}).click();
  await expect(post.getByRole('status')).toContainText('não foi localizado no banco');
  expect(app.state.posts).toHaveLength(0);
  expect(app.state.activityRequests.filter(request=>request.action==='viewers')).toHaveLength(0);
  await post.getByRole('button',{name:'Abrir como rascunho',exact:true}).click();
  const composer=page.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await expect(composer.getByPlaceholder('Título do post *')).toHaveValue(ghost.title);
  await expect(composer.getByPlaceholder('Escreva o comunicado aqui...')).toHaveValue(ghost.content);
  expect(app.state.posts).toHaveLength(0);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('a notice deleted after loading is checked before consulting its viewers',async({browser})=>{
 const app=await fixture(browser);
 app.state.posts=[{id:'post-deleted',title:'Aviso removido',content:'Conteúdo preservado no aparelho.',created_at:'2026-10-24T10:00:00Z',created_by:admin.id}];
 try{
  const page=await app.open(admin,undefined,{activity:true});
  await navigate(page,'Mural');
  const viewers=page.getByRole('button',{name:'Ver visualizações de Aviso removido',exact:true});
  await expect(viewers).toBeVisible();
  app.state.posts=[];
  await viewers.click();
  await expect(page.getByRole('article',{name:'Aviso removido',exact:true}).getByRole('status')).toContainText('não foi localizado no banco');
  await expect(page.getByRole('dialog',{name:'Visualizações do aviso',exact:true})).toHaveCount(0);
  expect(app.state.activityRequests.filter(request=>request.action==='viewers')).toHaveLength(0);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('a committed mural post with a failed readback retains its draft across reload and retries without duplicating',async({browser})=>{
 const app=await fixture(browser);
 app.state.muralGeneratedId='database-after-read-failure';
 try{
  const page=await app.open();await navigate(page,'Mural');
  await page.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  let composer=page.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await composer.getByPlaceholder('Título do post *').fill('Louvor com confirmação pendente');
  await composer.getByPlaceholder('Escreva o comunicado aqui...').fill('Preserve este texto se a conexão cair.');
  app.state.muralReadbackError='Leitura temporariamente indisponível';
  await composer.getByRole('button',{name:'Publicar',exact:true}).click();
  await expect(composer.getByRole('alert')).toContainText('Leitura temporariamente indisponível');
  expect(app.state.posts).toHaveLength(1);
  await app.reload(page);await navigate(page,'Mural');
  await page.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  composer=page.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await expect(composer.getByPlaceholder('Título do post *')).toHaveValue('Louvor com confirmação pendente');
  await expect(composer.getByPlaceholder('Escreva o comunicado aqui...')).toHaveValue('Preserve este texto se a conexão cair.');
  app.state.muralReadbackError=null;
  await composer.getByRole('button',{name:'Publicar',exact:true}).click();
  await expect(composer).toHaveCount(0);
  expect(app.state.posts).toHaveLength(1);
  await expect(page.getByRole('article',{name:'Louvor com confirmação pendente',exact:true})).toHaveCount(1);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('an offline mural post waits for synchronization before offering its viewers report',async({browser})=>{
 const app=await fixture(browser);
 app.state.members=app.state.members.map((person,index)=>({...person,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
 app.state.muralGeneratedId='database-post-offline';
 try{
  const page=await app.open(admin,undefined,{activity:true,directActivity:true});
  await page.getByRole('button',{name:'Mural',exact:true}).click();
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'Novo Aviso',exact:true}).click();
  const composer=page.getByRole('dialog',{name:'Novo Comunicado',exact:true});
  await composer.getByPlaceholder('Título do post *').fill('Aviso salvo offline');
  await composer.getByPlaceholder('Escreva o comunicado aqui...').fill('Lembrem de revisar o repertório.');
  await composer.getByRole('button',{name:'Publicar',exact:true}).click();
  const post=page.getByRole('article',{name:'Aviso salvo offline',exact:true});
  await expect(post.getByRole('status')).toContainText('Aguardando sincronização');
  await expect(post.getByRole('button',{name:/Ver visualizações/})).toHaveCount(0);
  expect(app.state.activityRequests.filter(request=>request.targetType==='announcement')).toHaveLength(0);
  expect(app.state.posts).toHaveLength(0);
  await page.context().setOffline(false);
  await expect(post.getByRole('button',{name:'Ver visualizações de Aviso salvo offline',exact:true})).toBeVisible();
  await expect(post.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('article',{name:'Aviso salvo offline',exact:true})).toHaveCount(1);
  await post.getByRole('button',{name:'Ver visualizações de Aviso salvo offline',exact:true}).click();
  const report=page.getByRole('dialog',{name:'Visualizações do aviso',exact:true});
  await expect(report.locator('.ui-activity-summary')).toBeVisible();
  await expect(report.getByRole('alert')).toHaveCount(0);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

test('legacy offline comments and reactions follow the database ID assigned to their notice',async({browser})=>{
 const app=await fixture(browser);
 app.state.muralGeneratedId=901;app.state.muralRejectLocalIds=true;
 const post={id:'post-legacy-local',title:'Aviso offline antigo',content:'Texto salvo anteriormente.',created_at:'2026-10-24T10:00:00Z',created_by:admin.id};
 const offlineQueue=[
  {id:'job-post',actorId:admin.id,type:'create_post',data:post},
  {id:'job-comment',actorId:admin.id,type:'create_comment',data:{id:'comment-legacy',post_id:post.id,member_id:admin.id,text:'Confirmado',created_at:post.created_at}},
  {id:'job-reaction',actorId:admin.id,type:'toggle_reaction',data:{action:'insert',row:{post_id:post.id,member_id:admin.id,emoji:'👍'}}},
 ];
 try{
  const page=await app.open(admin,undefined,{offlineQueue});
  await expect.poll(()=>app.state.comments?.length||0).toBe(1);
  await expect.poll(()=>app.state.reactions?.length||0).toBe(1);
  expect(app.state.comments[0].post_id).toBe(901);
  expect(app.state.reactions[0].post_id).toBe(901);
  expect(app.state.posts).toHaveLength(1);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ls_sync_queue')))).toEqual([]);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});

for(const [theme,width] of [['light',320],['dark',390]])test(`reaction popup floats without moving posts and supports touch and keyboard in ${theme} mode`,async({browser})=>{
 const app=await fixture(browser);
 app.state.posts=[{id:'post-1',title:'Culto de Domingo',content:'Chegar 30 minutos antes do culto.',created_at:'2026-10-24T14:00:00Z',created_by:admin.id},{id:'post-2',title:'Próximo ensaio',content:'Vamos revisar as transições e os tons.',created_at:'2026-10-23T14:00:00Z',created_by:admin.id}];
 app.state.comments=[{id:'comment-1',post_id:'post-1',member_id:member.id,text:'Estarei lá!',created_at:'2026-10-24T14:10:00Z'}];
 try{
  const page=await app.open(member,undefined,{theme,device:{viewport:{width,height:740},hasTouch:true,reducedMotion:'reduce'}});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.getByRole('button',{name:'Mural',exact:true}).click();
  const post=page.locator('.community-post').first(),nextPost=page.locator('.community-post').nth(1);
  await expect(post.getByText('Estarei lá!',{exact:true})).toBeVisible();
  const commentBox=await post.locator('.community-comment').boundingBox();
  expect((await post.boundingBox()).y+(await post.boundingBox()).height-commentBox.y-commentBox.height).toBeGreaterThanOrEqual(18);
  const before=await post.boundingBox(),nextBefore=await nextPost.boundingBox();
  const react=post.getByRole('button',{name:'Reagir',exact:true});
  await react.tap();
  const popup=page.getByRole('menu',{name:'Reações de Culto de Domingo',exact:true});
  await expect(popup).toBeVisible();
  expect(await popup.evaluate(element=>element.parentElement===document.body)).toBe(true);
  expect((await post.boundingBox()).height).toBeCloseTo(before.height,1);
  expect((await nextPost.boundingBox()).y).toBeCloseTo(nextBefore.y,1);
  const bounds=await popup.boundingBox(),header=await page.locator('.app-header').boundingBox(),nav=await page.locator('.app-nav').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(12);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width-12);
  expect(bounds.y).toBeGreaterThanOrEqual(header.y+header.height);expect(bounds.y+bounds.height).toBeLessThanOrEqual(nav.y);
  const fire=popup.getByRole('menuitemcheckbox',{name:'Reagir com 🔥 ao aviso Culto de Domingo',exact:true});
  await fire.tap();await expect(popup).toHaveCount(0);await expect(react).toBeFocused();
  await expect.poll(()=>app.state.reactions?.filter(row=>row.post_id==='post-1'&&row.emoji==='🔥').length).toBe(1);
  await expect(post.locator('.community-social-summary')).toContainText('1 reação');
  await react.click();await expect(fire).toHaveAttribute('aria-checked','true');await expect(fire).toBeFocused();
  await page.keyboard.press('Home');await expect(popup.getByRole('menuitemcheckbox').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(popup.getByRole('menuitemcheckbox').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');await expect(popup).toHaveCount(0);
  await expect.poll(()=>app.state.reactions?.filter(row=>row.post_id==='post-1').length).toBe(2);
  await react.click();await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(react).toBeFocused();
  await react.click();await page.keyboard.press('Tab');await expect(popup).toHaveCount(0);await expect(post.getByRole('button',{name:'Comentar',exact:true})).toBeFocused();
  await react.click();await post.getByRole('heading',{name:'Culto de Domingo',exact:true}).click();await expect(popup).toHaveCount(0);
  await react.click();await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop+=20;});await expect(popup).toHaveCount(0);
  await post.getByRole('button',{name:'Comentar',exact:true}).click();
  const form=post.locator('.community-comment-form');
  expect((await post.boundingBox()).y+(await post.boundingBox()).height-(await form.getByRole('button',{name:'Enviar',exact:true}).boundingBox()).y-(await form.getByRole('button',{name:'Enviar',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(18);
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});
test('practical training changes instruments and runs its timer and real metronome',async({browser})=>{
 const app=await fixture(browser);
 try{
  const page=await app.open(admin);await navigate(page,'Treinar');
  const training=page.locator('.practical-training');
  await training.getByRole('button',{name:'Teclado',exact:true}).click();
  await expect(training.getByText('Aqueça com cinco notas',{exact:true})).toBeVisible();
  await training.getByRole('button',{name:'Voz',exact:true}).click();
  await expect(training.getByText('Respire por 4 tempos',{exact:true})).toBeVisible();
  await training.getByRole('button',{name:'Começar prática',exact:true}).click();
  const start=await page.evaluate(()=>Date.now());await page.clock.setFixedTime(start+3500);
  await training.getByRole('button',{name:'Pausar prática',exact:true}).click();
  await expect(training.getByLabel('Tempo de prática',{exact:true})).toContainText('0:03');
  await training.getByRole('button',{name:'Reiniciar',exact:true}).click();
  await expect(training.getByRole('button',{name:'Começar prática',exact:true})).toBeVisible();
  await training.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
  await expect(training.getByRole('button',{name:'Parar metrônomo',exact:true})).toHaveAttribute('aria-pressed','true');
  await training.getByRole('button',{name:'Aumentar andamento',exact:true}).click();await expect(training.getByLabel('Andamento do metrônomo',{exact:true})).toHaveText('75 BPM');
  await training.getByRole('button',{name:'Parar metrônomo',exact:true}).click();
  await expect(training.locator('iframe')).toHaveCount(0);
  await training.locator('summary').click();
  await expect(training.getByText('🎸 Afinador Cromático',{exact:true})).toBeVisible();
  expect(await training.locator('iframe').first().getAttribute('src')).not.toContain('undefined');
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});
test('notification inbox activates a device, preserves read receipts and opens the correct event',async({browser})=>{
 const app=await fixture(browser),requests=[];
 app.state.members=app.state.members.map(person=>({...person,pin:'NOTIFICATION_TEST_PIN'}));
 try{
  const page=await app.open(member);
  const items=[{id:'11111111-1111-4111-8111-111111111111',type:'event_changed',targetId:'event-1',title:'Escala atualizada',body:'Confira as músicas do culto.',url:'/?tab=escala&event=event-1',created_at:'2026-10-24T12:00:00Z',read_at:null}];
  await page.route('**/api/notifications',route=>{const body=route.request().postDataJSON();requests.push(body);if(body.action==='mark_read')for(const item of items)if(body.ids.includes(item.id))item.read_at=new Date().toISOString();return route.fulfill({json:{ok:true,items,publicKey:'B'+ 'A'.repeat(86),pushConfigured:true}});});
  await page.addInitScript(()=>{
   let subscribed=false;
   const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'B'+'A'.repeat(86),auth:'A'.repeat(22)}};},async unsubscribe(){subscribed=false;return true;}};
   Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default',async requestPermission(){this.permission='granted';return 'granted';}}});
   Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{addEventListener(){},removeEventListener(){},async getRegistration(){return {active:true,pushManager:{async getSubscription(){return subscribed?subscription:null;},async subscribe(){subscribed=true;return subscription;}}};}}});
  });
  await app.reload(page);await page.getByRole('button',{name:'Notificações',exact:true}).click();
  const inbox=page.getByRole('dialog',{name:'Notificações',exact:true});
  await expect(inbox.getByText('Escala atualizada',{exact:true})).toBeVisible();
  await inbox.getByRole('button',{name:'Ativar notificações',exact:true}).click();await expect(inbox.getByText('Notificações ativadas neste aparelho.',{exact:true})).toBeVisible();
  expect(requests.filter(body=>body.action==='subscribe')).toHaveLength(1);
  await inbox.getByRole('button',{name:'Ver escala',exact:true}).click();
  await expect(inbox).toHaveCount(0);await expect(page.locator('.gL2').getByText('Culto de Teste',{exact:true})).toBeVisible();
  await expect.poll(()=>items[0].read_at!==null).toBe(true);
  expect(requests.every(body=>body.memberId===member.id)).toBe(true);expect(app.failures).toEqual([]);
 }finally{await app.close();}
});
test('opening a push target waits for an unfinished event editor instead of discarding it',async({browser})=>{
 const app=await fixture(browser);
 try{
  const page=await app.open(admin);await page.getByRole('button',{name:'Escala',exact:true}).click();
  await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();await page.getByRole('button',{name:'Editar',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Editar evento',exact:true});
  await editor.getByLabel('Nome do evento',{exact:true}).fill('Rascunho não salvo');
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'LOUVESYNC_OPEN_NOTIFICATION',url:location.origin+'/?tab=escala&event=event-1'}})));
  await expect(editor).toBeVisible();await expect(editor.getByLabel('Nome do evento',{exact:true})).toHaveValue('Rascunho não salvo');
  await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
  await expect(page.locator('.gL2').getByText('Culto de Teste',{exact:true})).toBeVisible();
  expect(app.failures).toEqual([]);
 }finally{await app.close();}
});
async function bibleTransport(page) {
  const state={offline:false},handler=createBibleHandler();
  await page.route('**/api/bible?**',async route=>{
    if(state.offline)return route.abort('failed');
    const url=new URL(route.request().url());
    const res={code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:'GET',query:Object.fromEntries(url.searchParams)},res);
    return route.fulfill({status:res.code,json:res.body});
  });
  return state;
}

for(const theme of ['light','dark'])test(`Bible saves, highlights and shares verses with a floating chapter center in ${theme}`,async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(admin,undefined,{theme,device:{...devices['iPhone 13'],viewport:{width:390,height:844}},standalone:true});
    const transport=await bibleTransport(page);await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
    await page.getByRole('button',{name:'Bíblia',exact:true}).click();
    const screen=page.locator('.bible-screen'),reader=screen.locator('.ui-bible-reading'),dock=screen.getByRole('navigation',{name:'Central de capítulos',exact:true});
    const image=screen.getByRole('button',{name:'Mover ilustração da Bíblia',exact:true}).locator('img');
    await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);
    await expect(reader.locator('.ui-bible-verse')).toHaveCount(51);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});
      expect(await screen.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await page.screenshot({path:test.info().outputPath(`bible-3d-${theme}-${width}.png`),scale:'css'});
    }
    await page.setViewportSize({width:390,height:844});
    await screen.getByRole('combobox',{name:'Capítulo',exact:true}).selectOption('3');await expect(reader.locator('.ui-bible-verse')).toHaveCount(36);
    await expect(reader.locator('[data-verse="1"]')).toContainText('Nicodemos, chefe dos judeus');
    const target=reader.locator('[data-verse="16"]');await target.evaluate(element=>element.scrollIntoView({block:'center'}));await target.getByRole('button').click();
    const actions=page.getByRole('dialog',{name:'João 3:16',exact:true});
    await actions.getByRole('button',{name:'Salvar versículo',exact:true}).click();await expect(actions.getByRole('button',{name:'Remover dos salvos',exact:true})).toHaveAttribute('aria-pressed','true');
    await actions.getByRole('button',{name:'Marcar em amarelo',exact:true}).click();await expect(actions.getByRole('button',{name:'Marcar em amarelo',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:test.info().outputPath(`bible-actions-${theme}.png`),scale:'css'});
    await actions.getByRole('button',{name:'Compartilhar',exact:true}).click();await expect(actions.getByRole('status')).toContainText('Versículo copiado');
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('João 3:16 · Bíblia Livre (2018)');
    await actions.getByRole('button',{name:'Continuar leitura',exact:true}).click();
    await expect(target).toHaveAttribute('data-highlight','yellow');await expect(target).toHaveAttribute('data-saved','true');
    await expect(target.getByRole('button')).toBeFocused();
    const before=await dock.boundingBox();await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop+=350;});const after=await dock.boundingBox();
    expect(Math.abs(before.y-after.y)).toBeLessThan(1);expect(after.y+after.height).toBeLessThan((await page.locator('.app-nav .gNav').boundingBox()).y-8);
    await page.getByRole('button',{name:'Mais',exact:true}).click();await expect(page.locator('.bible-chapter-dock')).toBeHidden();await page.keyboard.press('Escape');await expect(dock).toBeVisible();
    transport.offline=true;await app.reload(page);await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(reader.locator('[data-verse="16"]')).toHaveAttribute('data-highlight','yellow');
    const collectionButton=screen.getByRole('button',{name:/Seus versículos/});await collectionButton.evaluate(element=>element.scrollIntoView({block:'center'}));await collectionButton.click();
    const collection=page.getByRole('dialog',{name:'Seus versículos',exact:true});await expect(collection.locator('.bible-collection-list > li')).toHaveCount(1);
    await page.screenshot({path:test.info().outputPath(`bible-collection-${theme}.png`),scale:'css'});
    await collection.getByRole('button',{name:/^João 3:16/}).click();await expect(target.getByRole('button')).toBeFocused();
    await page.screenshot({path:test.info().outputPath(`bible-reading-${theme}.png`),scale:'css'});
    await target.getByRole('button').click();await actions.getByRole('button',{name:'Remover dos salvos',exact:true}).click();await actions.getByRole('button',{name:'Continuar leitura',exact:true}).click();
    await expect(target).toHaveAttribute('data-saved','false');await expect(target).toHaveAttribute('data-highlight','yellow');
    await collectionButton.evaluate(element=>element.scrollIntoView({block:'center'}));await collectionButton.click();await expect(collection).toContainText('Seus versículos salvos ficam aqui');
    await collection.getByRole('button',{name:/^Marcados/}).click();await expect(collection.locator('.bible-collection-list > li')).toHaveCount(1);
    await collection.getByRole('button',{name:'Remover marcação de João 3:16',exact:true}).click();await expect(collection).toContainText('Suas marcações ficam aqui');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('Bible chapter center crosses books, stays clear of the last verse and restores other page spacing',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(admin,undefined,{device:{viewport:{width:320,height:740}}});await bibleTransport(page);await page.getByRole('button',{name:'Bíblia',exact:true}).click();
    const dock=page.getByRole('navigation',{name:'Central de capítulos',exact:true});
    const pick=async(book,chapter)=>{await dock.getByRole('button',{name:/Escolher capítulo/}).click();const dialog=page.getByRole('dialog',{name:'Escolher capítulo',exact:true});await dialog.getByRole('combobox',{name:'Livro para abrir',exact:true}).selectOption(book);await dialog.getByRole('combobox',{name:'Capítulo para abrir',exact:true}).selectOption(String(chapter));await dialog.getByRole('button',{name:'Ler capítulo',exact:true}).click();};
    await pick('genesis',50);await expect(page.getByRole('heading',{name:'Gênesis 50',exact:true})).toBeVisible();await dock.getByRole('button',{name:'Próximo capítulo',exact:true}).click();await expect(page.getByRole('heading',{name:'Êxodo 1',exact:true})).toBeVisible();
    await dock.getByRole('button',{name:'Capítulo anterior',exact:true}).click();await expect(page.getByRole('heading',{name:'Gênesis 50',exact:true})).toBeVisible();
    await pick('genesis',1);await expect(dock.getByRole('button',{name:'Capítulo anterior',exact:true})).toBeDisabled();await pick('revelation',22);await expect(dock.getByRole('button',{name:'Próximo capítulo',exact:true})).toBeDisabled();
    await expect(page.locator('.ui-bible-verse')).toHaveCount(21);await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    const last=await page.locator('.bible-credits').boundingBox();expect(last.y+last.height).toBeLessThan((await dock.boundingBox()).y-8);
    await page.getByRole('button',{name:'Início',exact:true}).click();await expect(dock).toHaveCount(0);expect(await page.locator('[data-main-scroll]').evaluate(element=>element.style.getPropertyValue('--bible-dock-height'))).toBe('');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('Bible sharing handles native share, cancellation and denied clipboard without losing the selected verse',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();await bibleTransport(page);await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(page.locator('.ui-bible-verse')).toHaveCount(51);
    await page.locator('[data-verse="1"]').evaluate(element=>element.scrollIntoView({block:'center'}));await page.locator('[data-verse="1"] button').click();const dialog=page.getByRole('dialog',{name:'João 1:1',exact:true});
    await page.evaluate(()=>{window.shareCalls=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shareCalls.push(data);}});});
    await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.shareCalls.length)).toBe(1);expect((await page.evaluate(()=>window.shareCalls[0])).text).toContain('No princípio era a Palavra');
    await page.evaluate(()=>{window.copyCalls=0;Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError');}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{window.copyCalls++;}}});});
    await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();await expect(dialog.getByRole('status')).toBeEmpty();expect(await page.evaluate(()=>window.copyCalls)).toBe(0);
    await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});document.execCommand=()=>false;});
    await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();await expect(dialog.getByRole('textbox',{name:'Versículo para compartilhar',exact:true})).toHaveValue(/João 1:1/);await expect(dialog).toContainText('Selecione e copie');expect(app.failures).toEqual([]);
    await expect(dialog.getByRole('button',{name:'Compartilhar',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('[data-verse="1"] button')).toBeFocused();
  }finally{await app.close();}
});

test('Bible reports storage failures and keeps saved verses scoped to each profile',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();await bibleTransport(page);await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(page.locator('.ui-bible-verse')).toHaveCount(51);
    await page.locator('[data-verse="1"]').evaluate(element=>element.scrollIntoView({block:'center'}));await page.locator('[data-verse="1"] button').click();const dialog=page.getByRole('dialog',{name:'João 1:1',exact:true});
    await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ls_bible_library_'))throw new DOMException('quota','QuotaExceededError');return window.originalSetItem.call(this,key,value);};});
    await dialog.getByRole('button',{name:'Salvar versículo',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Não foi possível guardar');await expect(dialog.getByRole('button',{name:'Salvar versículo',exact:true})).toHaveAttribute('aria-pressed','false');
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});await dialog.getByRole('button',{name:'Salvar versículo',exact:true}).click();await expect(dialog.getByRole('button',{name:'Remover dos salvos',exact:true})).toBeVisible();
    const saved=await page.evaluate(()=>localStorage.getItem('ls_bible_library_v1_user-admin'));const other=await app.open(member);await bibleTransport(other);await other.evaluate(value=>localStorage.setItem('ls_bible_library_v1_user-admin',value),saved);
    await other.getByRole('button',{name:'Bíblia',exact:true}).click();await other.getByRole('button',{name:/Seus versículos/}).click();await expect(other.getByRole('dialog',{name:'Seus versículos',exact:true})).toContainText('Seus versículos salvos ficam aqui');expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('Bible plan uses the selected book and opening a passage does not mark it read',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();const requests=[];
    await page.route('**/api/bible?**',route=>{const url=new URL(route.request().url());requests.push(url.href);return route.fulfill({json:{book:url.searchParams.get('book'),chapter:Number(url.searchParams.get('chapter')),translation:BIBLE_EDITION.id,edition:BIBLE_EDITION.revision,language:BIBLE_EDITION.language,verses:[{number:1,text:'Versículo de teste'}]}});});
    await page.getByRole('button',{name:'Bíblia',exact:true}).click();await page.getByRole('button',{name:'Planos de leitura',exact:true}).click();
    await page.getByRole('button',{name:'Hebreus 11:1',exact:true}).click();await expect(page.getByRole('heading',{name:'Hebreus 11',exact:true})).toBeVisible();
    await expect.poll(()=>requests.some(url=>url.includes('book=hebrews')&&url.includes('chapter=11'))).toBe(true);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls_bible_plans')||'{}'))).toEqual({});expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('Bible reads the pinned edition, ignores old translation caches and keeps new chapters offline',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();let offline=false;const handler=createBibleHandler();
    await page.route('**/api/bible?**',async route=>{
      if(offline)return route.abort('failed');
      const url=new URL(route.request().url());const res={code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await handler({method:'GET',query:Object.fromEntries(url.searchParams)},res);
      return route.fulfill({status:res.code,json:res.body});
    });
    await page.evaluate(()=>localStorage.setItem('ls_bible_john_1',JSON.stringify([{number:1,text:'TEXTO ANTIGO INCORRETO'}])));
    await page.getByRole('button',{name:'Bíblia',exact:true}).click();
    const reader=page.locator('.ui-bible-reading');await expect(reader).toContainText('Bíblia Livre (2018)');
    await expect(reader.locator('[data-verse="1"]')).toContainText('No princípio era a Palavra');await expect(reader.locator('.ui-bible-verse')).toHaveCount(51);
    await expect(reader).not.toContainText('TEXTO ANTIGO INCORRETO');
    await page.getByRole('combobox',{name:'Capítulo',exact:true}).selectOption('3');
    await expect(reader.locator('[data-verse="16"]')).toContainText('Porque Deus amou ao mundo de tal maneira');
    await expect(reader.locator('.ui-bible-verse')).toHaveCount(36);
    await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]').length,bibleCacheKey('john',3))).toBe(36);
    await expect(reader.getByRole('link',{name:'BLIVRE · fonte e créditos',exact:true})).toHaveAttribute('href','https://ebible.org/porbr2018/');
    offline=true;await page.getByRole('button',{name:'Início',exact:true}).click();await page.getByRole('button',{name:'Bíblia',exact:true}).click();
    await expect(reader).toContainText('Leitura disponível offline.');await expect(reader.locator('[data-verse="16"]')).toContainText('Porque Deus amou ao mundo de tal maneira');
    await page.getByRole('button',{name:'Aumentar fonte',exact:true}).click();await expect(reader.locator('.ui-bible-verse').first()).toHaveCSS('font-size','20px');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`instrument artwork and rounded inventory and music filters work in ${theme}`,async({browser})=>{
  const app=await fixture(browser);
  const instruments=[['Baixo elétrico','bass'],['Saxofone alto','saxophone'],['Flauta transversal','flute'],['Cavaquinho','cavaquinho'],['Ukulele','ukulele']];
  app.state.equipment=instruments.map(([name],index)=>({id:'instrument-'+index,name,status:'Disponível'}));
  try{
    const page=await app.open(admin,undefined,{theme,device:{viewport:{width:390,height:844}}});await navigate(page,'Patrimônio');
    const inventory=page.getByRole('region',{name:'Patrimônio',exact:true});
    const selected=inventory.getByRole('group',{name:'Filtrar por status'}).getByRole('button',{name:'Todos',exact:true});
    await expect(selected).toHaveCSS('border-top-left-radius','12px');await expect(selected).toHaveCSS('border-bottom-right-radius','12px');
    for(const [name,asset] of instruments){const image=inventory.getByRole('article',{name,exact:true}).locator('img');await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',`/images/equipment/${asset}.webp`);await expect.poll(()=>image.evaluate(element=>element.complete&&element.naturalWidth>0)).toBe(true);}
    for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:test.info().outputPath(`expanded-inventory-${theme}-${width}.png`),scale:'css'});expect(await inventory.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);}
    await navigate(page,'Músicas');const filters=page.getByRole('group',{name:'Filtrar por categoria'});
    await expect(filters.getByRole('button',{name:'Todos',exact:true})).toHaveCSS('border-bottom-left-radius','12px');
    await filters.getByRole('button',{name:'Adoração',exact:true}).click();await expect(filters.getByRole('button',{name:'Adoração',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:test.info().outputPath(`rounded-music-${theme}.png`),scale:'css'});
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('two devices share rehearsal song, arrangement, running timer and stage alerts',async({browser})=>{
  const app=await fixture(browser);
  try{
    const first=await app.open(admin),second=await app.open(member);
    for(const page of [first,second])await navigate(page,'Ensaio');
    await first.getByRole('button',{name:'Teste ceia',exact:true}).click();
    await expect(second.getByRole('heading',{name:'Tocando agora: Teste ceia',exact:true})).toBeVisible();
    for(const page of [first,second])await page.getByText('Direção musical',{exact:true}).click();
    await first.getByRole('button',{name:'Worship',exact:true}).click();await expect(second.getByRole('button',{name:'Worship',exact:true})).toHaveAttribute('aria-pressed','true');
    for(const page of [first,second])await page.getByRole('button',{name:'Tempo de ensaio',exact:true}).click();
    await first.getByRole('button',{name:'Iniciar cronômetro',exact:true}).click();await expect(second.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
    const late=await app.open(member,'2026-10-24T12:00:12-03:00');
    await navigate(late,'Ensaio');
    await expect(late.getByLabel('Tempo compartilhado do ensaio',{exact:true})).toHaveText('00:12');

    await second.getByRole('button',{name:'Avisar equipe',exact:true}).click();
    await second.getByRole('button',{name:'🔊 Mais Volume!',exact:true}).click();await expect(first.getByText('Alerta de Palco: Membro Teste',{exact:true})).toBeVisible();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`compact studio preserves notes, plays the metronome and clears the menu in ${theme} mode`,async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(admin,undefined,{theme});
    await page.setViewportSize({width:320,height:740});
    await navigate(page,'Ensaio');
    await expect(page.getByRole('heading',{name:'Estúdio',exact:true})).toBeVisible();
    await expect(page.locator('.ls')).toHaveClass(/home-theme/);
    await expect(page.locator('.app-nav [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.app-nav [aria-current="page"]')).toHaveAccessibleName('Mais');
    await expect(page.getByRole('tab',{name:'Gravar',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('button',{name:'Teste adoracao',exact:true}).click();
    await page.getByRole('tab',{name:/^Anotar/}).click();
    await page.getByRole('textbox',{name:'Anotações do ensaio',exact:true}).fill('Repetir a ponte duas vezes.');
    await page.getByRole('tab',{name:'Cifra',exact:true}).click();
    await expect(page.locator('.ui-rehearsal-lyrics')).toContainText('Letra para');
    await page.getByRole('button',{name:'Ativar metrônomo',exact:true}).click();
    await expect(page.getByRole('button',{name:'Parar metrônomo',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.ui-metronome-dot[data-active="true"]')).toHaveCount(1);
    await page.getByRole('button',{name:'Parar metrônomo',exact:true}).click();
    await page.getByRole('tab',{name:/^Anotar/}).click();
    await expect(page.getByRole('textbox',{name:'Anotações do ensaio',exact:true})).toHaveValue('Repetir a ponte duas vezes.');
    await page.getByRole('button',{name:'Salvar anotação',exact:true}).click();
    await expect.poll(()=>app.state.notes['song-0']?.note_text).toBe('Repetir a ponte duas vezes.');
    await page.getByRole('button',{name:'Próxima música: Teste ceia',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Tocando agora: Teste ceia',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Gravar',exact:true}).click();
    expect(await page.locator('.rehearsal-studio').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.locator('[data-main-scroll]').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const end=await page.locator('.studio-direction').boundingBox(),nav=await page.locator('.app-nav .gNav').boundingBox();
    expect(nav.y-end.y-end.height).toBeGreaterThanOrEqual(10);
    await page.locator('[data-main-scroll]').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:test.info().outputPath('compact-studio-'+theme+'.png'),scale:'css'});
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const uploadFails of [false,true])test(`compact studio records real browser audio and ${uploadFails?'preserves a local copy on upload failure':'shares a playable take'}`,async({browser})=>{
  const app=await fixture(browser);
  if(uploadFails)app.state.audioUploadError='Storage indisponível';
  try{
    const page=await app.open();
    await page.evaluate(()=>{
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
        const audio=new AudioContext(),tone=audio.createOscillator(),destination=audio.createMediaStreamDestination();
        tone.connect(destination);tone.start();await audio.resume();
        window.__recordingStream=destination.stream;window.__recordingAudio=audio;
        return destination.stream;
      }});
    });
    await navigate(page,'Ensaio');
    await page.getByRole('button',{name:'Teste ceia',exact:true}).click();
    await page.getByRole('button',{name:'Iniciar gravação',exact:true}).click();
    await expect(page.getByRole('button',{name:'Finalizar gravação',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Escolher evento do ensaio',exact:true})).toBeDisabled();
    await expect.poll(()=>page.locator('.studio-waveform > i').count()).toBeGreaterThan(2);
    await expect(page.locator('.studio-record-time')).not.toHaveText('00:00');
    const download=uploadFails?page.waitForEvent('download'):null;
    await page.getByRole('button',{name:'Finalizar gravação',exact:true}).click();
    await expect.poll(()=>app.state.audioUploads?.[0]?.size||0).toBeGreaterThan(0);
    expect(app.state.audioUploads[0].bucket).toBe('rehearsal-audio');
    if(uploadFails){
      expect((await download).suggestedFilename()).toBe('ensaio-event-1.webm');
      await expect(page.getByRole('status').filter({hasText:'Gravação baixada neste aparelho'})).toBeVisible();
      expect(app.state.takes||[]).toHaveLength(0);
    }else{
      await expect.poll(()=>app.state.takes?.length||0).toBe(1);
      expect(app.state.takes[0].event_id).toBe('event-1');
      expect(app.state.takes[0].name).toContain('Teste ceia');
      await expect(page.getByRole('status').filter({hasText:'Gravação salva para a equipe.'})).toBeVisible();
      const audio=page.locator('.studio-take audio');
      await expect.poll(()=>audio.evaluate(el=>Number.isFinite(el.duration)&&el.duration>0)).toBe(true);
    }
    expect(await page.evaluate(()=>window.__recordingStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
    await page.evaluate(()=>window.__recordingAudio.close());
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('starting the actual app offline ignores a cached ministry session and preserves the visitor Bible cache',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  try{
    await context.addInitScript(({profile,songs,cacheKey})=>{localStorage.setItem('ls_profile',JSON.stringify(profile));localStorage.setItem('ls_actor_session',JSON.stringify({memberId:profile.id,pin:'TEST_PIN_'+profile.id}));localStorage.setItem('ls_songs',JSON.stringify(songs));localStorage.setItem(cacheKey,JSON.stringify([{number:1,text:'Texto em cache local para leitura.'}]));},{profile:member,songs,cacheKey:bibleCacheKey('john',1)});
    const page=await context.newPage();await page.route('**/api/community',route=>route.abort());await page.route('**/api/bible?**',route=>route.abort());await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());await page.goto('http://127.0.0.1:5174/');
    await expect(page.locator('.church-audience')).toHaveText('Visitante');await expect(page.getByRole('button',{name:'Mais',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Bíblia',exact:true}).click();await expect(page.locator('.ui-bible-reading')).toContainText('Texto em cache local para leitura.');await expect(page.locator('.ui-bible-reading')).toContainText('Leitura disponível offline.');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls_songs')).length)).toBe(3);expect(await page.evaluate(()=>localStorage.getItem('ls_actor_session'))).toBeNull();
  }finally{await context.close();}
});

for (const viewport of [{name:'mobile',width:360,height:740},{name:'desktop',width:1440,height:1000}]) {
  test('event editor stays anchored while scrolling, filtering and reordering on '+viewport.name,async({browser})=>{
    const app=await fixture(browser);
    app.state.songs.push(...Array.from({length:20},(_,index)=>({...songs[0],id:'extra-'+index,title:'Música extra '+index})));
    try {
      const page=await app.open();
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await page.getByRole('button',{name:'Escala',exact:true}).click();
      await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
      await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Editar',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Editar evento',exact:true});
      await expect(dialog).toBeVisible();
      expect(await page.locator('#root').evaluate(root=>root.inert)).toBe(true);
      expect(await dialog.getAttribute('data-update-blocking')).toBe('true');
      const header=dialog.locator('.ui-dialog-header'),footer=dialog.locator('footer');
      const initial={header:await header.boundingBox(),footer:await footer.boundingBox()};
      const background=await page.locator('[data-main-scroll]').evaluate(element=>element.scrollTop);
      const expectAnchored=async()=>{
        for(const [name,element] of [['header',header],['footer',footer]]) {
          const box=await element.boundingBox();
          expect(Math.abs(box.y-initial[name].y)).toBeLessThan(1);
          expect(Math.abs(box.height-initial[name].height)).toBeLessThan(1);
        }
        expect(await page.locator('[data-main-scroll]').evaluate(element=>element.scrollTop)).toBe(background);
        expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      };
      await dialog.getByLabel('Nome do evento',{exact:true}).fill('Culto revisado');
      await dialog.getByRole('tab',{name:'Setlist',exact:true}).click();
      const content=dialog.locator('.ui-dialog-content');
      await content.hover();await page.mouse.wheel(0,600);
      await expect.poll(()=>content.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
      await expectAnchored();
      await header.hover();await page.mouse.wheel(0,-600);
      await expectAnchored();
      await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).fill('sem resultado');
      await expect(dialog.getByText('Nenhuma música encontrada',{exact:true})).toBeVisible();
      await expectAnchored();
      await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).fill('Música extra 0');
      await dialog.getByRole('button',{name:'Selecionar Música extra 0',exact:true}).click();
      await dialog.getByRole('button',{name:'Subir Teste jubilo',exact:true}).click();
      await dialog.getByRole('button',{name:'Subir Teste jubilo',exact:true}).click();
      await dialog.getByRole('button',{name:'Remover Teste ceia',exact:true}).click();
      await expectAnchored();
      await dialog.getByRole('tab',{name:'Equipe',exact:true}).click();
      await dialog.getByRole('button',{name:member.name,exact:true}).click();
      await dialog.getByRole('tab',{name:'Detalhes',exact:true}).click();
      await expect(dialog.getByLabel('Nome do evento',{exact:true})).toHaveValue('Culto revisado');
      await expectAnchored();
      if(viewport.name==='mobile') {
        await page.setViewportSize({width:viewport.width,height:440});
        await expect.poll(async()=>Math.round((await footer.boundingBox()).y+(await footer.boundingBox()).height)).toBeLessThanOrEqual(440);
        await expect(dialog.getByRole('button',{name:'Salvar Alterações',exact:true})).toBeVisible();
        await dialog.getByLabel('Nome do evento',{exact:true}).focus();
        await page.keyboard.press('End');await page.keyboard.type(' no celular');
      } else {
        const bounds=await dialog.boundingBox();
        expect(bounds.width).toBeLessThanOrEqual(720);
        expect(Math.abs(bounds.x-(viewport.width-bounds.width)/2)).toBeLessThan(1);
      }
      await dialog.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
      await expect(dialog).toHaveCount(0);
      expect(await page.locator('#root').evaluate(root=>root.inert)).toBe(false);
      expect(app.state.events[0].label).toBe('Culto revisado'+(viewport.name==='mobile'?' no celular':''));
      expect(app.state.events[0].event_songs.filter(row=>row.song_id).sort((a,b)=>a.order_index-b.order_index).map(row=>row.song_id)).toEqual(['song-2','song-0','extra-0']);
      expect(app.state.events[0].event_songs.every(row=>Number.isSafeInteger(row.id))).toBe(true);
      expect(app.state.events[0].event_members.map(row=>row.member_id)).toEqual([admin.id]);
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}
test('event editor contains keyboard focus and closes cleanly with Escape',async({browser})=>{
  const app=await fixture(browser);
  try {
    const page=await app.open();
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    const open=page.getByRole('button',{name:'Novo',exact:true});
    await open.click();
    const dialog=page.getByRole('dialog',{name:'Novo evento',exact:true});
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button',{name:'Fechar editor de evento',exact:true})).toBeFocused();
    await dialog.getByRole('tab',{name:'Detalhes',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('tab',{name:'Setlist',exact:true})).toBeFocused();
    await expect(dialog.getByRole('tab',{name:'Setlist',exact:true})).toHaveAttribute('aria-selected','true');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(await page.locator('#root').evaluate(root=>root.inert)).toBe(false);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('event Excel download and WhatsApp copy use categories, assigned vocalists and event keys',async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_songs[0].singer_member_id=member.id;
  app.state.events[0].event_songs[0].sequence=encodeSequence('Intro','Eb');
  app.state.events[0].event_songs[1].singer_member_id=admin.id;
  try {
    const page=await app.open();
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const panel=page.locator('.gL2');
    await panel.getByRole('button',{name:'Compartilhar',exact:true}).click();
    const downloading=page.waitForEvent('download');
    await panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true}).click();
    const download=await downloading;
    expect(download.suggestedFilename()).toBe('setlist_2026-10-25.xlsx');
    await download.saveAs(test.info().outputPath('setlist.xlsx'));
    const parts=unzipSync(fs.readFileSync(test.info().outputPath('setlist.xlsx')));
    const worksheet=strFromU8(parts['xl/worksheets/sheet1.xml']);
    for(const value of ['Categoria','Adoração:','Santa Ceia:','Júbilo:','Teste adoracao','Membro Teste','Admin Teste','Vocalista não definido','Eb'])expect(worksheet).toContain(value);
    expect(worksheet).not.toContain('Fixture');
    await panel.getByRole('button',{name:'Copiar setlist para WhatsApp',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('*Adoração:* Teste adoracao (Membro Teste) — Eb');
    const text=await page.evaluate(()=>navigator.clipboard.readText());
    expect(text).toContain('*Santa Ceia:* Teste ceia (Admin Teste) — C');
    expect(text).toContain('*Júbilo:* Teste jubilo (Vocalista não definido) — C');
    expect(text).not.toContain('Fixture');expect(text).not.toMatch(/^\d+\./m);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('native Excel handoff keeps updates blocked until cancel or failure and preserves workbook bytes',async({browser})=>{
  const app=await fixture(browser);
  try {
    const page=await app.open(admin,'2026-10-24T12:00:00-03:00',{nativeExcel:'current'});
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const panel=page.locator('.gL2');
    await panel.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true}).click();
    await expect(panel.getByRole('button',{name:'Preparando planilha…',exact:true})).toBeDisabled();
    await expect(panel).toHaveAttribute('data-update-blocking','true');
    await expect.poll(()=>page.evaluate(()=>!!window.__excelRequest)).toBe(true);
    const request=await page.evaluate(()=>window.__excelRequest);
    expect(request.plugin).toBe('LouveFiles');expect(request.method).toBe('saveExcel');
    expect(request.options.filename).toBe('setlist_2026-10-25.xlsx');
    const worksheet=strFromU8(unzipSync(Buffer.from(request.options.data,'base64'))['xl/worksheets/sheet1.xml']);
    expect(worksheet).toContain('Adoração:');expect(worksheet).toContain('Teste adoracao');
    await page.evaluate(()=>window.__finishExcel(null,true));
    await expect(panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true})).toBeEnabled();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect(panel).toHaveAttribute('data-update-blocking','false');
    await panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true}).click();
    await expect(panel.getByRole('button',{name:'Preparando planilha…',exact:true})).toBeDisabled();
    await page.evaluate(()=>window.__finishExcel('Armazenamento indisponível',false));
    await expect(panel.getByRole('alert')).toHaveText('Armazenamento indisponível');
    await expect(panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true})).toBeEnabled();
    await expect(panel).toHaveAttribute('data-update-blocking','false');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('older Android shells explain how to get Excel support instead of silently failing',async({browser})=>{
  const app=await fixture(browser);
  try {
    const page=await app.open(admin,'2026-10-24T12:00:00-03:00',{nativeExcel:'legacy'});
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const panel=page.locator('.gL2');
    await panel.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true}).click();
    await expect(panel.getByRole('alert')).toContainText('Atualize o aplicativo Android para salvar planilhas Excel.');
    await expect(panel.getByRole('button',{name:'📥 Exportar para Excel',exact:true})).toBeEnabled();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('WhatsApp copy works without Clipboard API and confirms the new format was copied',async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_songs[0].singer_member_id=member.id;
  try {
    const page=await app.open();
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.evaluate(()=>{
      window.__readClipboard=navigator.clipboard.readText.bind(navigator.clipboard);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    });
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const panel=page.locator('.gL2');
    await panel.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await panel.getByRole('button',{name:'Copiar setlist para WhatsApp',exact:true}).click();
    await expect(panel.getByRole('status')).toContainText('Setlist copiado com as categorias e os vocais do evento.');
    await expect.poll(()=>page.evaluate(()=>window.__readClipboard())).toContain('*Adoração:* Teste adoracao (Membro Teste) — C');
    await expect(panel.getByRole('textbox',{name:'Setlist para WhatsApp'})).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('denied WhatsApp copy offers the complete new text for manual copying',async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_songs[0].singer_member_id=member.id;
  try {
    const page=await app.open();
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))}});
      document.execCommand=()=>false;
    });
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    const panel=page.locator('.gL2');
    await panel.getByRole('button',{name:'Compartilhar',exact:true}).click();
    await panel.getByRole('button',{name:'Copiar setlist para WhatsApp',exact:true}).click();
    const manual=panel.getByRole('textbox',{name:'Setlist para WhatsApp',exact:true});
    await expect(manual).toHaveAttribute('readonly','');
    await expect(manual).toHaveValue(/\*Adoração:\* Teste adoracao \(Membro Teste\) — C/);
    await expect(manual).not.toHaveValue(/Fixture|^\d+\./m);
    await expect(panel.getByRole('status')).toContainText('Selecione e copie o texto abaixo.');
    await expect(panel).toHaveAttribute('data-update-blocking','true');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('event saves with bigint item IDs, and another device can reopen and clear its music selections',async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_members[0].confirmed=true;
  app.state.events[0].event_songs.splice(1,0,{id:4,song_id:null,item_type:'note',note_text:'Oração inicial',order_index:1.5});
  const edit=async page=>{
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    return page.getByRole('dialog',{name:'Editar evento',exact:true});
  };
  try {
    const first=await app.open();
    const dialog=await edit(first);
    await dialog.getByLabel('Nome do evento',{exact:true}).fill('Culto com pedidos');
    await dialog.getByRole('tab',{name:'Setlist',exact:true}).click();
    await dialog.getByRole('button',{name:'Subir Teste jubilo',exact:true}).click();
    await dialog.getByRole('button',{name:'Subir Teste jubilo',exact:true}).click();
    await dialog.getByText('Pedidos e Santa Ceia',{exact:true}).click();
    await dialog.getByRole('combobox',{name:'Música da Santa Ceia',exact:true}).selectOption('song-1');
    await dialog.getByRole('combobox',{name:'Músicas pedidas',exact:true}).selectOption('song-2');
    await dialog.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    expect(app.state.events[0].label).toBe('Culto com pedidos');
    expect(Object.hasOwn(app.state.events[0],'requested_songs')).toBe(false);
    expect(Object.hasOwn(app.state.events[0],'santa_ceia_song')).toBe(false);
    expect(app.state.events[0].event_members[0].confirmed).toBe(true);
    expect(app.state.events[0].event_songs.every(row=>Number.isSafeInteger(row.id))).toBe(true);
    expect(app.state.events[0].event_songs.find(row=>row.note_text==='Oração inicial').id).toBe(4);
    const savedIds=app.state.events[0].event_songs.map(row=>row.id);
    const second=await app.open();
    const reopened=await edit(second);
    await reopened.getByRole('tab',{name:'Setlist',exact:true}).click();
    await expect(reopened.getByRole('list',{name:'Músicas do setlist'}).locator('li')).toHaveCount(3);
    await expect(reopened.getByRole('list',{name:'Músicas do setlist'}).locator('li').first()).toContainText('Teste jubilo');
    await reopened.getByText('Pedidos e Santa Ceia',{exact:true}).click();
    await expect(reopened.getByRole('combobox',{name:'Música da Santa Ceia',exact:true})).toHaveValue('song-1');
    await expect(reopened.getByRole('button',{name:'Remover pedido Teste jubilo',exact:true})).toBeVisible();
    await expect(second.getByText(/louvesync:event-preferences:v1:/)).toHaveCount(0);
    await reopened.getByRole('combobox',{name:'Música da Santa Ceia',exact:true}).selectOption('');
    await reopened.getByRole('button',{name:'Remover pedido Teste jubilo',exact:true}).click();
    await reopened.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    await expect(reopened).toHaveCount(0);
    expect(app.state.events[0].event_songs.map(row=>row.id)).toEqual(savedIds);
    await second.reload();
    await second.getByRole('button',{name:'Escala',exact:true}).click();
    await second.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await expect(second.locator('.gL2').getByText(/Oração inicial/)).toBeVisible();
    await second.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await second.getByRole('button',{name:'Editar',exact:true}).click();
    const cleared=second.getByRole('dialog',{name:'Editar evento',exact:true});
    await cleared.getByRole('tab',{name:'Setlist',exact:true}).click();
    await cleared.getByText('Pedidos e Santa Ceia',{exact:true}).click();
    await expect(cleared.getByRole('combobox',{name:'Música da Santa Ceia',exact:true})).toHaveValue('');
    await expect(cleared.getByRole('button',{name:'Remover pedido Teste jubilo',exact:true})).toHaveCount(0);
    expect(app.state.events[0].event_members[0].confirmed).toBe(true);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('PDF degrees follow assigned ministers in B and A across devices, stage, rehearsal and printing',async({browser})=>{
  const app=await fixture(browser);
  Object.assign(app.state.songs[0],{title:'Tua Unção',key:'C',lyrics:'',vocal_keys:{[admin.id]:'B',[member.id]:'A'}});
  app.state.events[0].event_songs[0].singer_member_id=admin.id;
  try {
    const first=await app.open(admin),second=await app.open(member);
    for(const page of [first,second]){
      await page.getByRole('button',{name:'Escala',exact:true}).click();
      await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    }
    await second.locator('.gL2').getByText('Tua Unção',{exact:true}).click();
    await expect(second.getByRole('combobox',{name:'Tom da cifra',exact:true})).toHaveValue('B');
    await expect(second.getByRole('combobox',{name:'Vocal para o tom',exact:true})).toHaveValue(admin.id);
    await expect(second.locator('.lyrics-content b').first()).toHaveText('G#m');
    await expect(second.locator('.lyrics-content')).toContainText('B/D#');

    await first.getByRole('combobox',{name:'Vocal principal de Tua Unção',exact:true}).selectOption(member.id);
    await expect(second.getByRole('combobox',{name:'Vocal para o tom',exact:true})).toHaveValue(member.id);
    await expect(second.getByRole('combobox',{name:'Tom da cifra',exact:true})).toHaveValue('A');
    await expect(second.locator('.lyrics-content b').first()).toHaveText('F#m');
    await expect(second.locator('.lyrics-content')).toContainText('A/C#');

    await first.locator('.gL2').getByText('Tua Unção',{exact:true}).click();
    await first.getByRole('combobox',{name:'Vocal para o tom',exact:true}).selectOption(admin.id);
    await expect(first.getByRole('combobox',{name:'Tom da cifra',exact:true})).toHaveValue('B');
    await expect(first.locator('.lyrics-content b').first()).toHaveText('G#m');
    await first.getByRole('combobox',{name:'Vocal para o tom',exact:true}).selectOption(member.id);
    await first.getByRole('combobox',{name:'Tom da cifra',exact:true}).selectOption('E');
    await first.getByRole('button',{name:'Salvar tom deste vocal',exact:true}).click();
    await expect(second.getByRole('combobox',{name:'Tom da cifra',exact:true})).toHaveValue('E');
    await expect(second.locator('.lyrics-content b').first()).toHaveText('C#m');
    await second.getByRole('button',{name:'Modo Palco 🖥️',exact:true}).click();
    await expect(second.locator('.stage-wrap b').first()).toHaveText('C#m');
    await second.keyboard.press('Escape');
    // Browser Back closes the stage through the same route as Android Back.
    if(await second.locator('.stage-wrap').count())await second.goBack();
    await expect(second.locator('.stage-wrap')).toHaveCount(0);
    await second.emulateMedia({media:'print'});
    await expect(second.locator('#print-cifra pre')).toContainText('[E/G#]');
    await expect(second.locator('#print-cifra pre')).not.toContainText('{key:');
    await expect(second.locator('#print-cifra pre')).not.toContainText('[6m]');
    await second.emulateMedia({media:'screen'});
    await second.getByRole('button',{name:'✎ Editar',exact:true}).click();
    await expect(second.getByRole('textbox',{name:'Editar cifra',exact:true})).toHaveValue(/\[6m\]/);
    await second.getByRole('button',{name:'Descartar',exact:true}).click();

    await first.reload();
    await navigate(first,'Ensaio');
    await first.getByRole('button',{name:'Tua Unção',exact:true}).click();
    await first.getByRole('tab',{name:'Cifra',exact:true}).click();
    await expect(first.locator('.ui-rehearsal-lyrics b').first()).toHaveText('C#m');
    await expect(first.locator('.ui-rehearsal-lyrics')).toContainText('E/G#');
    expect(app.state.songs[0].lyrics).toBe('');
    expect(app.state.songs[0].vocal_keys).toEqual({[admin.id]:'B',[member.id]:'E'});
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('the event catalog groups and colors every category while search and selection preserve event order',async({browser})=>{
  const app=await fixture(browser);
  app.state.songs.push(...[
    {id:'hino-a',title:'A Face Adorada',cat:'hinario'},
    {id:'hino-b',title:'Em fervente oração',cat:'hinario'},
    {id:'oferta',title:'Sete vezes mais',cat:'oferta'},
    {id:'corinho',title:'Corinho de teste',cat:'corinho'},
    {id:'sem-cat',title:'Sem categoria de teste',cat:null},
    {id:'especial',title:'Música especial',cat:'Especial'},
  ].map(song=>({...songs[0],...song})));
  try{
    const page=await app.open();
    await page.getByRole('button',{name:'Escala',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await page.getByRole('button',{name:'Mais ações do evento',exact:true}).click();
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Editar evento',exact:true});
    await dialog.getByRole('tab',{name:'Setlist',exact:true}).click();
    const catalog=dialog.locator('.ui-song-catalog');
    expect(await catalog.locator('.ui-category-heading h4').allTextContents()).toEqual(['Júbilo','Hinário','Adoração','Oferta','Corinhos','Santa Ceia','Sem categoria','Especial']);
    const hinos=catalog.getByRole('region',{name:'Hinário',exact:true});
    expect(await hinos.getByRole('button').allTextContents()).toEqual(['A Face AdoradaFixtureC','Em fervente oraçãoFixtureC']);
    for(const [name,color] of [['Júbilo','rgb(0, 201, 167)'],['Hinário','rgb(255, 107, 53)'],['Adoração','rgb(123, 63, 242)']]){
      const group=catalog.getByRole('region',{name,exact:true});
      await expect(group.locator('.ui-category-dot')).toHaveCSS('background-color',color);
      await expect(group.getByRole('button').first()).toHaveCSS('border-left-color',color);
    }
    await hinos.getByRole('button',{name:'Selecionar A Face Adorada',exact:true}).click();
    await expect(hinos.getByRole('button',{name:'Selecionar A Face Adorada',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(hinos.locator('.ui-category-heading')).toContainText('1 no setlist');
    expect(await dialog.getByRole('list',{name:'Músicas do setlist'}).locator('li strong').allTextContents()).toEqual(['Teste adoracao','Teste ceia','Teste jubilo','A Face Adorada']);
    await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).fill('especial');
    expect(await catalog.locator('.ui-category-heading h4').allTextContents()).toEqual(['Especial']);
    await catalog.getByRole('button',{name:'Selecionar Música especial',exact:true}).click();
    await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).fill('nenhuma corresponde');
    await expect(catalog.locator('.ui-category-group')).toHaveCount(0);
    await expect(catalog.getByText('Nenhuma música encontrada',{exact:true})).toBeVisible();
    await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).fill('');
    await dialog.getByRole('searchbox',{name:'Buscar música no repertório'}).blur();
    await catalog.getByRole('region',{name:'Júbilo',exact:true}).evaluate(element=>element.scrollIntoView({block:'start'}));
    await page.screenshot({path:test.info().outputPath('event-categories.png')});
    await dialog.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    expect(app.state.events[0].event_songs.filter(row=>row.song_id).sort((a,b)=>a.order_index-b.order_index).map(row=>row.song_id)).toEqual(['song-0','song-1','song-2','hino-a','especial']);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark']){
  test(`equipment editor keeps fields and actions above app chrome and preserves failed saves in ${theme} theme`,async({browser})=>{
    const app=await fixture(browser);let finishSave;
    try{
      const page=await app.open(admin,undefined,{device:{...devices['iPhone 13'],viewport:{width:390,height:844}},theme,standalone:true,visualViewportHeight:797});
      await page.addStyleTag({content:':root { --app-safe-top:47px; --app-safe-bottom:34px; } *,*::before,*::after { animation:none!important; transition:none!important; }'});
      await navigate(page,'Patrimônio');
      await page.getByRole('button',{name:'Adicionar equipamento',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Novo equipamento',exact:true}),content=dialog.locator('.ui-dialog-content');
      await expect(dialog.getByLabel('Nome do equipamento',{exact:true})).toBeInViewport({ratio:1});
      const heading=dialog.getByRole('heading',{name:'Novo equipamento',exact:true});
      expect(await heading.evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
      await dialog.getByLabel('Nome do equipamento',{exact:true}).fill('Microfone cadastrado');
      await dialog.getByLabel('Marca/fabricante',{exact:true}).fill('Marca de teste');
      await dialog.getByLabel('Número de série',{exact:true}).fill('SERIE-2026');
      app.state.equipmentSaveError='Falha simulada de conexão';
      await dialog.getByRole('button',{name:'Salvar',exact:true}).click();
      await expect(dialog.getByRole('alert')).toContainText('Falha simulada de conexão');
      await expect(dialog.getByLabel('Nome do equipamento',{exact:true})).toHaveValue('Microfone cadastrado');
      expect(app.state.equipment).toHaveLength(1);
      await dialog.getByLabel('Nome do equipamento',{exact:true}).focus();
      await page.evaluate(()=>{Object.defineProperties(window.visualViewport,{height:{configurable:true,value:370},offsetTop:{configurable:true,value:38}});window.visualViewport.dispatchEvent(new Event('resize'));});
      await expect.poll(async()=>Math.round((await page.locator('.ui-dialog-layer').boundingBox()).height)).toBe(370);
      const footerBefore=await dialog.locator('footer').boundingBox();
      await content.evaluate(element=>{element.scrollTop=element.scrollHeight;});
      await dialog.getByLabel('Status',{exact:true}).selectOption('Em uso');
      await dialog.getByLabel('Responsável pela custódia',{exact:true}).selectOption(member.id);
      await expect.poll(async()=>Math.round((await page.locator('.ui-dialog-layer').boundingBox()).height)).toBe(370);
      const save=dialog.getByRole('button',{name:'Salvar',exact:true}),saveBox=await save.boundingBox();
      expect(saveBox.y+saveBox.height).toBeLessThanOrEqual(38+370-12);
      expect(Math.abs((await dialog.locator('footer').boundingBox()).y-footerBefore.y)).toBeLessThan(1);
      expect(await save.evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
      await page.screenshot({path:test.info().outputPath('equipment-'+theme+'-keyboard.png'),scale:'css'});
      app.state.equipmentSaveError=null;app.state.equipmentSaveGate=new Promise(resolve=>{finishSave=resolve;});
      await save.click();await expect(dialog.getByRole('button',{name:'Salvando…',exact:true})).toBeDisabled();
      await expect(dialog.getByRole('button',{name:'Fechar cadastro de equipamento',exact:true})).toBeDisabled();
      finishSave();await expect(dialog).toHaveCount(0);
      await page.evaluate(()=>{delete window.visualViewport.height;delete window.visualViewport.offsetTop;window.visualViewport.dispatchEvent(new Event('resize'));});
      expect(app.state.equipmentRequests).toHaveLength(2);
      expect(Object.keys(app.state.equipmentRequests[1]).sort()).toEqual(['brand','custodian_id','id','name','serial_number','status']);
      await app.reload(page);await navigate(page,'Patrimônio');
      const row=page.getByRole('article',{name:'Microfone cadastrado',exact:true});
      await row.getByRole('button',{name:'Editar',exact:true}).click();
      const edit=page.getByRole('dialog',{name:'Editar equipamento',exact:true});
      await expect(edit.getByLabel('Número de série',{exact:true})).toHaveValue('SERIE-2026');
      await expect(edit.getByLabel('Status',{exact:true})).toHaveValue('Em uso');
      await expect(edit.getByLabel('Responsável pela custódia',{exact:true})).toHaveValue(member.id);
      await edit.getByRole('button',{name:'Cancelar',exact:true}).click();expect(app.failures).toEqual([]);
    }finally{finishSave?.();await app.close();}
  });
}

for(const viewport of [{name:'mobile',width:320,height:740},{name:'desktop-dark',width:1280,height:900}]){
  test('member editor stays above app chrome and saves a complete form on '+viewport.name,async({browser})=>{
    const app=await fixture(browser);
    try{
      const page=await app.open();
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      if(viewport.name==='desktop-dark')await page.getByRole('button',{name:'Tema',exact:true}).click();
      await navigate(page,'Admin');
      const open=page.getByRole('button',{name:'Adicionar membro',exact:true});
      await open.click();
      const dialog=page.getByRole('dialog',{name:'Novo membro',exact:true});
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(element=>element.parentElement.parentElement===document.body)).toBe(true);
      expect(await page.locator('#root').evaluate(element=>element.inert)).toBe(true);
      await expect(dialog).toHaveAttribute('data-update-blocking','true');
      const header=dialog.locator('.ui-dialog-header'),footer=dialog.locator('footer'),content=dialog.locator('.ui-dialog-content');
      const initial={header:await header.boundingBox(),footer:await footer.boundingBox()};
      const background=await page.locator('[data-main-scroll]').evaluate(element=>element.scrollTop);
      await dialog.getByRole('button',{name:'Cadastrar membro',exact:true}).click();
      expect(app.state.memberRequests).toHaveLength(0);
      await expect(dialog.getByLabel('Nome completo',{exact:true})).toBeFocused();
      await dialog.getByLabel('Nome completo',{exact:true}).fill('Pessoa de Teste');
      await dialog.getByLabel('Função ou instrumento',{exact:true}).fill('Vocal 2');
      await dialog.getByLabel('PIN de acesso',{exact:true}).fill('TESTE26');
      await dialog.getByRole('checkbox',{name:'Administrador',exact:false}).check();
      await expect(dialog.getByRole('checkbox',{name:'Painel administrativo',exact:true})).toBeChecked();
      await expect(dialog.getByRole('checkbox',{name:'Painel administrativo',exact:true})).toBeDisabled();
      await dialog.getByRole('checkbox',{name:'Administrador',exact:false}).uncheck();
      await dialog.getByRole('checkbox',{name:'Patrimônio',exact:true}).uncheck();
      await dialog.getByLabel('Categoria vocal',{exact:true}).selectOption('jubilo');
      await dialog.getByRole('checkbox',{name:'Indisponível: Dom',exact:true}).check();
      await dialog.getByRole('checkbox',{name:'Indisponível: Sáb',exact:true}).check();
      await content.evaluate(element=>{element.scrollTop=element.scrollHeight;});
      for(const [name,element] of [['header',header],['footer',footer]]){
        expect(Math.abs((await element.boundingBox()).y-initial[name].y)).toBeLessThan(1);
      }
      expect(await page.locator('[data-main-scroll]').evaluate(element=>element.scrollTop)).toBe(background);
      expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await page.screenshot({path:test.info().outputPath('member-'+viewport.name+'-availability.png')});
      await content.evaluate(element=>{element.scrollTop=0;});
      await page.screenshot({path:test.info().outputPath('member-'+viewport.name+'.png')});
      if(viewport.name==='mobile'){
        await page.setViewportSize({width:viewport.width,height:420});
        await dialog.getByLabel('PIN de acesso',{exact:true}).focus();
        await expect.poll(async()=>Math.round((await footer.boundingBox()).y+(await footer.boundingBox()).height)).toBeLessThanOrEqual(420);
        const button=dialog.getByRole('button',{name:'Cadastrar membro',exact:true});
        expect(await button.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));})).toBe(true);
      }
      let release;
      app.state.memberSaveGate=new Promise(resolve=>{release=resolve;});
      app.state.memberSaveError='Falha de conexão simulada';
      await dialog.getByRole('button',{name:'Cadastrar membro',exact:true}).click();
      await expect(dialog.getByRole('button',{name:'Salvando…',exact:true})).toBeDisabled();
      await expect(dialog.getByRole('button',{name:'Fechar cadastro de membro',exact:true})).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      release();app.state.memberSaveGate=null;
      await expect(dialog.getByRole('alert')).toContainText('Falha de conexão simulada');
      await expect(dialog.getByLabel('Nome completo',{exact:true})).toHaveValue('Pessoa de Teste');
      expect(app.state.members.some(member=>member.name==='Pessoa de Teste')).toBe(false);
      app.state.memberSaveError=null;
      await dialog.getByRole('button',{name:'Cadastrar membro',exact:true}).click();
      await expect(dialog).toHaveCount(0);
      expect(await page.locator('#root').evaluate(element=>element.inert)).toBe(false);
      const saved=app.state.members.find(member=>member.name==='Pessoa de Teste');
      expect(saved).toMatchObject({pin:'TESTE26',instrument:'Vocal 2',vocal_category:'jubilo',avatar:'PD',status:'ativo',is_admin:false});
      expect(saved.permissions).not.toContain('patrimonio');expect(saved.unavailable_days).toEqual([0,6]);expect(saved.unavailableDays).toBeUndefined();
      await page.getByRole('button',{name:'Editar Pessoa de Teste',exact:true}).click();
      const edit=page.getByRole('dialog',{name:'Editar membro',exact:true});
      await expect(edit.getByLabel('Nome completo',{exact:true})).toHaveValue('Pessoa de Teste');
      await expect(edit.getByRole('checkbox',{name:'Indisponível: Sáb',exact:true})).toBeChecked();
      await expect(edit.getByRole('checkbox',{name:'Patrimônio',exact:true})).not.toBeChecked();
      await page.keyboard.press('Escape');
      await expect(edit).toHaveCount(0);
      expect(app.failures).toEqual([]);
    }finally{await app.close();}
  });
}


async function openPermissionEvent(page){
  await page.getByRole('button',{name:'Escala',exact:true}).click();
  const button=page.getByRole('button',{name:'Ver detalhes →',exact:true}).first();
  await button.evaluate(element=>element.scrollIntoView({block:'center'}));await button.click();
  return page.getByRole('dialog',{name:'Culto de Teste',exact:true});
}

test('member requests own event key, leader approves atomically and audit identifies the decision',async({browser})=>{
  const app=await fixture(browser);
  app.state.events[0].event_songs[0].singer_member_id=member.id;
  app.state.events[0].event_songs[0].sequence=encodeSequence('Intro de teste','C');
  app.state.events[0].event_songs[1].singer_member_id=admin.id;
  try{
    const page=await app.open(member,undefined,{changes:true}),leader=await app.open(admin,undefined,{changes:true});
    let sheet=await openPermissionEvent(page);
    await expect(sheet.getByRole('button',{name:'Solicitar tom',exact:true})).toHaveCount(1);
    const own=sheet.locator('.event-song-card').filter({hasText:'Teste adoracao'});
    await own.getByRole('button',{name:'Solicitar tom',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Troca de tom',exact:true});
    await dialog.getByLabel('Novo tom',{exact:true}).selectOption('D');await dialog.getByLabel('Motivo',{exact:false}).fill('Extensão vocal mais confortável');
    await dialog.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect(own.locator('.event-song-key')).toHaveText('C');await expect(own).toContainText('aguardando aprovação');
    expect(app.state.events[0].event_songs.find(row=>row.song_id==='song-0').sequence).toContain('"key":"C"');
    const leadSheet=await openPermissionEvent(leader);await leadSheet.getByRole('button',{name:/^Solicitações/}).click();
    const request=leadSheet.getByRole('article',{name:'Troca de tom de Membro Teste',exact:true});
    await expect(request).toContainText('Extensão vocal mais confortável');await request.getByLabel('Observação da liderança (opcional)',{exact:true}).fill('Tom aprovado para este culto');await request.getByRole('button',{name:'Aprovar',exact:true}).click();
    await expect(request).toHaveCount(0);
    await sheet.getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click();
    sheet=await openPermissionEvent(page);
    await expect(sheet.locator('.event-song-card').filter({hasText:'Teste adoracao'}).locator('.event-song-key')).toHaveText('D');
    expect(app.state.songs.find(song=>song.id==='song-0').key).toBe('C');expect(app.state.songs.find(song=>song.id==='song-0').vocal_keys).toEqual({});
    expect(app.state.events[0].event_members.find(row=>row.member_id===member.id).confirmed).toBeNull();
    await leadSheet.getByRole('button',{name:'Histórico',exact:true}).click();
    const log=leadSheet.getByRole('region',{name:'Histórico de alterações',exact:true});await expect(log).toContainText('Admin Teste');await expect(log).toContainText('Setlist');
    await log.locator('li').filter({hasText:'Setlist'}).first().locator('summary').click();await expect(log).toContainText('Intro de teste');await expect(log).toContainText('key');
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('member song suggestions can be rejected or cancelled and never replace the active setlist early',async({browser})=>{
  const app=await fixture(browser);app.state.songs.push({...songs[0],id:'replacement',title:'Nova música de teste'});
  try{
    const page=await app.open(member,undefined,{changes:true}),leader=await app.open(admin,undefined,{changes:true});
    const sheet=await openPermissionEvent(page);
    await sheet.locator('.event-song-card').first().getByRole('button',{name:'Sugerir música',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Troca de música',exact:true});await dialog.getByLabel('Música sugerida',{exact:true}).selectOption('replacement');await dialog.getByLabel('Motivo',{exact:false}).fill('Combina com o tema do culto');await dialog.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect(sheet.getByRole('button',{name:'Abrir cifra de Teste adoracao',exact:true})).toBeVisible();
    const leadSheet=await openPermissionEvent(leader);await leadSheet.getByRole('button',{name:/^Solicitações/}).click();
    await leadSheet.getByRole('article',{name:'Troca de música de Membro Teste',exact:true}).getByRole('button',{name:'Recusar',exact:true}).click();await expect(leadSheet.getByText('Nenhum pedido pendente',{exact:true})).toBeVisible();
    expect(app.state.events[0].event_songs.some(row=>row.song_id==='replacement')).toBe(false);
    await sheet.getByRole('button',{name:/^Meus pedidos/}).click();await sheet.getByRole('button',{name:'Atualizar solicitações',exact:true}).click();await sheet.getByRole('button',{name:'Todas',exact:true}).click();await expect(sheet.getByText('Recusada',{exact:true})).toBeVisible();
    await sheet.getByRole('button',{name:/^Setlist/}).click();await sheet.locator('.event-song-card').first().getByRole('button',{name:'Sugerir música',exact:true}).click();
    const second=page.getByRole('dialog',{name:'Troca de música',exact:true});await second.getByLabel('Música sugerida',{exact:true}).selectOption('replacement');await second.getByLabel('Motivo',{exact:false}).fill('Outra proposta para revisão');await second.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(second).toHaveCount(0);
    await sheet.getByRole('button',{name:/^Meus pedidos/}).click();await sheet.getByRole('button',{name:'Cancelar solicitação',exact:true}).click();await expect(sheet.getByRole('button',{name:'Cancelar solicitação',exact:true})).toHaveCount(0);
    expect(app.state.events[0].event_songs.some(row=>row.song_id==='replacement')).toBe(false);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`event permissions layout preserves artwork, readable setlist and compact actions in ${theme}`,async({browser})=>{
  const app=await fixture(browser);app.state.events[0].event_songs[0].singer_member_id=member.id;
  try{
    for(const width of [320,390]){
      const page=await app.open(member,undefined,{changes:true,theme,device:{viewport:{width,height:844}}});
      const sheet=await openPermissionEvent(page);await expect.poll(()=>sheet.locator('.event-stage-art').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
      expect(await sheet.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      await expect(sheet.getByRole('button',{name:'Compartilhar',exact:true})).toBeVisible();
      await page.screenshot({path:test.info().outputPath(`event-permissions-${theme}-${width}.png`),scale:'css'});
      await sheet.getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click();await navigate(page,'Solicitações');
      await expect(page.getByRole('heading',{name:'Minhas solicitações',exact:true})).toBeVisible();
    }
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});


test('member catalog edits wait for leadership and session caches contain no other member PINs',async({browser})=>{
  const app=await fixture(browser);app.state.members=app.state.members.map(person=>({...person,pin:'SYNTHETIC_'+person.id}));
  try{
    const page=await app.open(member,undefined,{changes:true}),leader=await app.open(admin,undefined,{changes:true});
    await navigate(page,'Músicas');
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ls_members')).every(person=>!Object.hasOwn(person,'pin')))).toBe(true);
    await page.getByRole('button',{name:'Editar Teste adoracao',exact:true}).click();
    const editor=page.locator('.gL2');await editor.locator('textarea').first().fill('[C]Letra corrigida proposta pelo membro');
    await editor.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
    const proposal=page.getByRole('dialog',{name:'Edição de música',exact:true});await proposal.getByLabel('Motivo',{exact:true}).fill('Correção da cifra revisada');await proposal.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(proposal).toHaveCount(0);
    expect(app.state.songs.find(song=>song.id==='song-0').lyrics).toBe(songs[0].lyrics);
    await navigate(leader,'Solicitações');const request=leader.getByRole('article',{name:'Edição de música de Membro Teste',exact:true});await request.locator('summary').click();await expect(request).toContainText('Letra corrigida proposta pelo membro');await request.getByRole('button',{name:'Aprovar',exact:true}).click();await expect(request).toHaveCount(0);
    expect(app.state.songs.find(song=>song.id==='song-0').lyrics).toContain('Letra corrigida proposta pelo membro');
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('ls_actor_session'))).toBeNull();
    await page.getByRole('button',{name:/Membro Teste/}).click();await page.getByLabel('Senha',{exact:true}).fill('WRONG');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByText('PIN incorreto ou membro inativo.',{exact:true})).toBeVisible();
    await page.getByLabel('Senha',{exact:true}).fill('SYNTHETIC_'+member.id);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.app-header')).toBeVisible();
    expect(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem('ls_profile')),'pin'))).toBe(false);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});


test('administrators can reset their own PIN without losing the current session or exposing it in profiles',async({browser})=>{
  const app=await fixture(browser);app.state.members=app.state.members.map(person=>({...person,pin:'SYNTHETIC_'+person.id}));
  try{
    const page=await app.open(admin,undefined,{activity:true});await navigate(page,'Admin');
    await page.getByRole('button',{name:'Editar Admin Teste',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Editar membro',exact:true});await expect(editor.getByLabel('Novo PIN (opcional)',{exact:true})).toHaveValue('');
    await editor.getByLabel('Novo PIN (opcional)',{exact:true}).fill('RESET_SYNTHETIC_ADMIN_PIN');await editor.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(editor).toHaveCount(0);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls_actor_session')).pin)).toBe('RESET_SYNTHETIC_ADMIN_PIN');
    expect(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem('ls_profile')),'pin'))).toBe(false);
    await expect.poll(()=>app.state.activityRequests.some(request=>request.action==='heartbeat'&&request.pin==='RESET_SYNTHETIC_ADMIN_PIN')).toBe(true);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});


test('member screen access and unavailable weekdays survive saves, another device and reload',async({browser})=>{
  const app=await fixture(browser);
  try{
    const leader=await app.open(admin),teammate=await app.open(member);
    await navigate(leader,'Admin');await leader.getByRole('button',{name:'Editar Membro Teste',exact:true}).click();
    const editor=leader.getByRole('dialog',{name:'Editar membro',exact:true});
    await expect(editor.getByRole('checkbox',{name:'Maestro',exact:true})).toBeChecked();
    await editor.getByRole('checkbox',{name:'Maestro',exact:true}).uncheck();await editor.getByRole('checkbox',{name:'Patrimônio',exact:true}).uncheck();
    await editor.getByRole('checkbox',{name:'Indisponível: Dom',exact:true}).check();await editor.getByRole('checkbox',{name:'Indisponível: Sáb',exact:true}).check();
    await editor.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(editor).toHaveCount(0);
    const saved=app.state.members.find(person=>person.id===member.id);expect(saved.unavailable_days).toEqual([0,6]);expect(saved.permissions).not.toContain('ia');
    await navigate(teammate,'Músicas');await teammate.getByRole('button',{name:'Mais',exact:true}).click();
    await expect(teammate.getByRole('region',{name:'Mais',exact:true}).getByRole('button',{name:'Maestro',exact:true})).toHaveCount(0);await expect(teammate.getByRole('region',{name:'Mais',exact:true}).getByRole('button',{name:'Patrimônio',exact:true})).toHaveCount(0);
    await teammate.reload();await teammate.getByRole('button',{name:'Mais',exact:true}).click();await expect(teammate.getByRole('region',{name:'Mais',exact:true}).getByRole('button',{name:'Maestro',exact:true})).toHaveCount(0);
    await leader.reload();await navigate(leader,'Admin');await leader.getByRole('button',{name:'Editar Membro Teste',exact:true}).click();
    const reopened=leader.getByRole('dialog',{name:'Editar membro',exact:true});await expect(reopened.getByRole('checkbox',{name:'Indisponível: Dom',exact:true})).toBeChecked();await expect(reopened.getByRole('checkbox',{name:'Maestro',exact:true})).not.toBeChecked();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('scheduling excludes unavailable instrumentalists and vocals and keeps Saturday rehearsal availability independent',async({browser})=>{
  const app=await fixture(browser);
  app.state.members.find(person=>person.id===member.id).unavailable_days=[0];
  app.state.members.find(person=>person.id===admin.id).unavailable_days=[6];
  app.state.members.push({...member,id:'bass-blocked',name:'Baixista indisponível',instrument:'Baixo',unavailable_days:[0]});
  try{
    const page=await app.open(admin);await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Novo',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Novo evento',exact:true});await editor.getByLabel('Data',{exact:true}).fill('2026-11-22');await editor.getByLabel('Nome do evento',{exact:true}).fill('Culto com disponibilidade');
    await editor.getByRole('tab',{name:'Equipe',exact:true}).click();await expect(editor.getByRole('button',{name:'Membro Teste',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Baixista indisponível',exact:true})).toBeDisabled();await expect(editor).toContainText('Indisponível neste dia (domingo)');
    await editor.getByRole('tab',{name:'Setlist',exact:true}).click();await editor.getByRole('button',{name:'Auto-gerar',exact:true}).click();await editor.getByRole('button',{name:'Criar Compromisso',exact:true}).click();await expect(editor).toHaveCount(0);
    const sunday=app.state.events.find(event=>event.label==='Culto com disponibilidade');expect(sunday.event_members.map(person=>person.member_id)).toEqual([admin.id]);
    const saturday=app.state.events.find(event=>event.label==='Ensaio (Sáb)'&&event.date==='2026-11-21');expect(saturday).toBeDefined();expect(saturday.event_members||[]).toHaveLength(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`Maestro uses the new character and keeps text and quota after a provider failure in ${theme}`,async({browser})=>{
  const app=await fixture(browser);
  try{
    app.state.maestroFailure=401;
    const page=await app.open(member,undefined,{theme,device:{viewport:{width:390,height:844}}});await navigate(page,'Maestro');
    const screen=page.getByRole('region',{name:'Maestro',exact:true});await expect.poll(()=>screen.locator('.maestro-hero img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    await expect(screen.getByRole('heading',{name:'Olá, eu sou o Maestro.'})).toBeInViewport();await page.screenshot({path:test.info().outputPath('maestro-hero-'+theme+'.png'),scale:'css'});
    const input=screen.getByRole('textbox',{name:'Mensagem para o Maestro',exact:true});await input.fill('Como organizar nosso ensaio?');await screen.getByRole('button',{name:'Enviar mensagem ao Maestro',exact:true}).click();
    await expect(screen.getByRole('alert')).toContainText('configuração');await expect(input).toHaveValue('Como organizar nosso ensaio?');await expect(screen).toContainText('0/10 respostas');
    app.state.maestroFailure=null;await screen.getByRole('button',{name:'Enviar mensagem ao Maestro',exact:true}).click();await expect(screen).toContainText('Vamos preparar o ensaio com oração');await expect(screen).toContainText('1/10 respostas');await expect(input).toHaveValue('');
    expect(app.state.maestroOutbound.every(call=>call.url==='https://api.x.ai/v1/chat/completions'&&call.model==='grok-4.3')).toBe(true);expect(app.state.maestroRequests[0].memberId).toBe(member.id);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.locator('[data-main-scroll]').evaluate(element=>{element.scrollTop=element.scrollHeight;});
      expect(await screen.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      const composer=await screen.locator('.maestro-compose').boundingBox(),nav=await page.locator('.app-nav .gNav').boundingBox();expect(composer.y+composer.height).toBeLessThan(nav.y-8);
      await page.screenshot({path:test.info().outputPath('maestro-character-'+theme+'-'+width+'.png'),scale:'css'});
    }
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`church visitors browse public meetings and submit a private anonymous prayer with real PostgreSQL in ${theme}`,async({browser})=>{
  const app=await fixture(browser);
  app.state.churchEvents=[{id:'20000000-0000-4000-8000-000000000001',title:'Culto da comunidade',starts_at:'2026-10-25T21:00:00Z',location:'Templo principal',category:'Culto',published:true},{id:'20000000-0000-4000-8000-000000000002',title:'Rascunho reservado',starts_at:'2026-10-26T21:00:00Z',published:false}];
  try{
    const page=await app.open(null,undefined,{community:true,theme,device:{viewport:{width:390,height:844}}});
    await expect(page.getByRole('region',{name:'Boas-vindas',exact:true})).toBeVisible();await expect(page.getByText('Culto da comunidade',{exact:true})).toBeVisible();
    expect((app.state.databaseReads||[]).filter(action=>['fetchSongs','fetchEvents','fetchMembers'].includes(action))).toEqual([]);
    const nav=page.getByRole('navigation',{name:'Navegação da comunidade'});
    await nav.getByRole('button',{name:'Agenda',exact:true}).click();await expect(page.getByText('Rascunho reservado',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Ver detalhes de Culto da comunidade',exact:true}).click();await expect(page.getByRole('dialog',{name:'Culto da comunidade',exact:true})).toContainText('Templo principal');await page.getByRole('button',{name:'Fechar detalhes do encontro',exact:true}).click();
    await nav.getByRole('button',{name:'Oração',exact:true}).click();const prayer=page.getByRole('region',{name:'Pedido de oração',exact:true});
    await expect(prayer.getByRole('radio',{name:'Somente a liderança responsável',exact:true})).toBeChecked();await prayer.getByLabel('Seu nome (opcional)').fill('Nome que deve ficar privado');await prayer.getByRole('checkbox',{name:'Enviar sem meu nome',exact:true}).check();
    const message=prayer.getByRole('textbox',{name:'Seu pedido de oração',exact:true});await message.fill('Pedido privado de oração pela minha família.');app.state.prayerFailure=true;await prayer.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(prayer.getByRole('alert')).toContainText('preservado');await expect(message).toHaveValue('Pedido privado de oração pela minha família.');
    app.state.prayerFailure=false;await prayer.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(prayer.getByRole('status')).toContainText('Pedido recebido');await expect(message).toHaveValue('');
    const saved=(await app.communityQuery('select display_name,anonymous,member_id,message,published,status from louvesync_prayer_requests')).rows;expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({display_name:'',anonymous:true,member_id:null,published:false,status:'pending'});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.locator('.church-scroll').evaluate(node=>{node.scrollTop=0;});await page.screenshot({path:test.info().outputPath(`church-prayer-${theme}-${width}.png`),scale:'css'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.locator('.church-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;});const submit=await prayer.getByRole('button',{name:'Enviar pedido de oração',exact:true}).boundingBox(),bar=await nav.boundingBox();expect(submit.y+submit.height).toBeLessThan(bar.y-8);
      await nav.getByRole('button',{name:'Início',exact:true}).click();await page.screenshot({path:test.info().outputPath(`church-welcome-${theme}-${width}.png`),scale:'css'});await nav.getByRole('button',{name:'Oração',exact:true}).click();
    }
    await app.reload(page);await expect(page.getByText('Pedido privado de oração pela minha família.',{exact:true})).toHaveCount(0);expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('church administrators publish meetings for visitors without exposing internal scales and can withdraw publication',async({browser})=>{
  const app=await fixture(browser);
  try{
    const visitor=await app.open(null,undefined,{community:true}),leader=await app.open(admin);await navigate(leader,'Admin');await leader.getByRole('button',{name:'Comunidade da igreja',exact:true}).click();const adminPage=leader.getByRole('region',{name:'Gestão da comunidade',exact:true});
    await adminPage.getByRole('button',{name:'Novo encontro',exact:true}).click();const editor=leader.getByRole('dialog',{name:'Encontro da igreja',exact:true});await editor.getByLabel('Nome do encontro',{exact:true}).fill('Encontro para toda a igreja');await editor.getByLabel('Data e horário',{exact:true}).fill('2026-10-25T18:00');await editor.getByLabel('Local',{exact:true}).fill('Templo principal');await editor.getByRole('checkbox',{name:'Publicar na agenda da igreja',exact:true}).check();await editor.getByRole('button',{name:'Salvar encontro',exact:true}).click();await expect(editor).toHaveCount(0);
    await visitor.evaluate(()=>window.dispatchEvent(new Event('online')));await visitor.getByRole('navigation',{name:'Navegação da comunidade'}).getByRole('button',{name:'Agenda',exact:true}).click();await expect(visitor.getByText('Encontro para toda a igreja',{exact:true})).toBeVisible();await expect(visitor.getByText('Culto de Teste',{exact:true})).toHaveCount(0);const saved=(await app.communityQuery('select published,created_by,starts_at from louvesync_church_events')).rows;expect(saved).toHaveLength(1);expect(saved[0].published).toBe(true);expect(saved[0].created_by).toBe(admin.id);
    await adminPage.getByRole('button',{name:'Editar encontro Encontro para toda a igreja',exact:true}).click();await editor.getByRole('checkbox',{name:'Publicar na agenda da igreja',exact:true}).uncheck();await editor.getByRole('button',{name:'Salvar encontro',exact:true}).click();await expect(editor).toHaveCount(0);await visitor.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(visitor.getByText('Encontro para toda a igreja',{exact:true})).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('church membership selected by an admin redirects another device and cannot grant itself ministry management',async({browser})=>{
  const app=await fixture(browser);
  try{
    const leader=await app.open(admin,undefined,{community:true}),teammate=await app.open(member);await navigate(leader,'Admin');await leader.getByRole('button',{name:'Editar Membro Teste',exact:true}).click();const editor=leader.getByRole('dialog',{name:'Editar membro',exact:true});await editor.getByLabel('Tipo de acesso',{exact:true}).selectOption('church_member');await expect(editor.getByRole('checkbox',{name:'Administrador',exact:true})).toHaveCount(0);await expect(editor.getByRole('checkbox',{name:'Ativo na escala',exact:true})).toHaveCount(0);await editor.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(editor).toHaveCount(0);
    await expect(teammate.getByRole('navigation',{name:'Navegação da comunidade'})).toBeVisible();await expect(teammate.getByRole('button',{name:'Escala',exact:true})).toHaveCount(0);await teammate.reload();await expect(teammate.locator('.church-audience')).toHaveText('Visitante');await app.login(teammate);await expect(teammate.locator('.church-audience')).toHaveText('Membro');
    const blocked=await teammate.evaluate(async actor=>{const response=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin_list',memberId:actor.id,pin:actor.pin,is_admin:true})});return response.status;},{...app.state.members.find(person=>person.id===member.id),pin:app.state.members.find(person=>person.id===member.id).pin||'TEST_PIN_'+member.id});expect(blocked).toBe(403);
    expect((await app.communityQuery('select access_type,schedule_enabled,is_admin,role from members where id=$1',[member.id])).rows[0]).toMatchObject({access_type:'church_member',schedule_enabled:false,is_admin:false,role:'Membro'});
    await leader.getByRole('button',{name:'Editar Membro Teste',exact:true}).click();await editor.getByLabel('Tipo de acesso',{exact:true}).selectOption('ministry');await editor.getByLabel('Função ou instrumento',{exact:true}).fill('Vocal');await editor.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(editor).toHaveCount(0);await teammate.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(teammate.getByRole('button',{name:'Escala',exact:true})).toBeVisible();expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

test('church prayers shared with consent appear publicly only after admin review and disappear when archived',async({browser})=>{
  const app=await fixture(browser);
  try{
    const visitor=await app.open(null,undefined,{community:true});await visitor.getByRole('navigation',{name:'Navegação da comunidade'}).getByRole('button',{name:'Oração',exact:true}).click();const form=visitor.getByRole('region',{name:'Pedido de oração',exact:true});await form.getByLabel('Seu nome (opcional)').fill('Visitante Teste');await form.getByRole('textbox',{name:'Seu pedido de oração',exact:true}).fill('Pedimos oração por nossa comunidade nesta semana.');await form.getByRole('radio',{name:'Compartilhar com a comunidade',exact:true}).check();await form.getByRole('button',{name:'Enviar pedido de oração',exact:true}).click();await expect(form.getByRole('status')).toContainText('Pedido recebido');await expect(visitor.getByRole('heading',{name:'Oramos juntos',exact:true})).toHaveCount(0);
    const leader=await app.open(admin);await navigate(leader,'Admin');await leader.getByRole('button',{name:'Comunidade da igreja',exact:true}).click();const adminPage=leader.getByRole('region',{name:'Gestão da comunidade',exact:true});await adminPage.getByRole('button',{name:'Pedidos de oração',exact:true}).click();await adminPage.getByRole('checkbox',{name:'Publicar para a comunidade após revisão',exact:true}).check();await adminPage.getByRole('button',{name:'Salvar acompanhamento',exact:true}).click();await expect(adminPage.getByRole('status')).toContainText('Acompanhamento salvo');await visitor.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(visitor.getByRole('heading',{name:'Oramos juntos',exact:true})).toBeVisible();await expect(visitor.getByText('Pedimos oração por nossa comunidade nesta semana.',{exact:true})).toBeVisible();
    await adminPage.getByLabel('Andamento',{exact:true}).selectOption('archived');await adminPage.getByRole('button',{name:'Salvar acompanhamento',exact:true}).click();await expect.poll(async()=>(await app.communityQuery('select status from louvesync_prayer_requests')).rows[0].status).toBe('archived');await visitor.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(visitor.getByText('Pedimos oração por nossa comunidade nesta semana.',{exact:true})).toHaveCount(0);expect(app.failures).toEqual([]);
  }finally{await app.close();}
});

for(const theme of ['light','dark'])test(`schedule response badges and song categories remain distinct and Maestro bubbles contrast in ${theme}`,async({browser})=>{
  const app=await fixture(browser);app.state.members.push({...member,id:'pending',name:'Pendente Teste'});app.state.events[0].event_members=[{member_id:admin.id,confirmed:true},{member_id:member.id,confirmed:false},{member_id:'pending',confirmed:null}];
  try{
    const page=await app.open(admin,undefined,{theme,device:{viewport:{width:390,height:844}}});await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('article',{name:'Culto de Teste',exact:true}).getByRole('button',{name:'Ver detalhes →',exact:true}).click();const details=page.getByRole('dialog',{name:'Culto de Teste',exact:true});await details.getByRole('button',{name:/^Equipe/}).click();
    const colors=await details.locator('.event-person .rsvp-badge').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));expect(new Set(colors).size).toBe(3);await expect(details.locator('.event-person .rsvp-badge[data-response=yes]')).toContainText('Confirmado');await expect(details.locator('.event-person .rsvp-badge[data-response=no]')).toContainText('Recusou');await expect(details.locator('.event-person .rsvp-badge[data-response=pending]')).toContainText('Pendente');await page.screenshot({path:test.info().outputPath(`schedule-team-contrast-${theme}.png`),scale:'css'});
    await details.getByRole('button',{name:/^Setlist/}).click();await expect(details.locator('.song-category-badge')).toHaveCount(songs.length);await page.screenshot({path:test.info().outputPath(`schedule-category-contrast-${theme}.png`),scale:'css'});await details.getByRole('button',{name:'Fechar detalhes do evento',exact:true}).click();await navigate(page,'Maestro');
    const maestro=page.getByRole('region',{name:'Maestro',exact:true});await expect(maestro.locator('.maestro-hero img')).toHaveAttribute('src','/images/maestro/toy.webp');await maestro.getByRole('textbox',{name:'Mensagem para o Maestro',exact:true}).fill('Como organizar a equipe?');await maestro.getByRole('button',{name:'Enviar mensagem ao Maestro',exact:true}).click();await expect(maestro).toContainText('Vamos preparar o ensaio com oração');const bubbles=await maestro.locator('.maestro-message>div').evaluateAll(nodes=>nodes.map(node=>({author:node.parentElement.dataset.author,bg:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color})));expect(bubbles.find(b=>b.author==='u').bg).not.toBe(bubbles.find(b=>b.author==='a').bg);expect(bubbles.find(b=>b.author==='u').color).not.toBe(bubbles.find(b=>b.author==='a').color);await page.screenshot({path:test.info().outputPath(`maestro-bubble-contrast-${theme}.png`),scale:'css'});expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
