import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const names = [...fs.readFileSync('src/lib/supabase.js','utf8').matchAll(/export async function (\w+)/g)].map(match => match[1]);
const admin = { id: 'user-admin', name: 'Admin Teste', instrument: 'Vocal', role: 'Vocal', avatar: 'AT', color: '#7B3FF2', status: 'ativo', is_admin: true };
const member = { ...admin, id: 'user-member', name: 'Membro Teste', is_admin: false };
const songs = ['adoracao', 'ceia', 'jubilo'].map((cat, index) => ({ id: `song-${index}`, title: `Teste ${cat}`, artist: 'Fixture', cat, key: 'C', lyrics: '[C]Letra para [G]teste', bpm: 80, tags: [], time_signature: '4/4', vocal_keys: {} }));
const initialEvents = [{ id: 'event-1', date: '2026-10-25', time: '18:00:00', label: 'Culto de Teste', type: 'culto', event_songs: songs.map((song, index) => ({ id: `row-${index}`, song_id: song.id, order_index: index + 1, item_type: 'song' })), event_members: [{ member_id: admin.id, confirmed: null }, { member_id: member.id, confirmed: null }] }];
async function fixture(browser) {
  const pages = [], contexts = [], failures = [];
  const state = { songs: structuredClone(songs), events: structuredClone(initialEvents), session: null, notes: {} };
  const code = `
    const clone=value=>structuredClone(value);
    const channels=[];
    window.__testDeliver=(name,message)=>channels.filter(c=>c.topic===name).forEach(c=>c.handlers.filter(h=>h.type==='broadcast'&&h.filter.event===message.event).forEach(h=>h.fn({payload:message.payload})));
    export const supabase={channel(name){const c={topic:name,state:'joined',handlers:[],on(type,filter,fn){this.handlers.push({type,filter,fn});return this;},subscribe(fn){queueMicrotask(()=>fn?.('SUBSCRIBED'));return this;},unsubscribe(){},send(message){return window.__testBroadcast(name,message).then(()=> 'ok');}};channels.push(c);return c;},removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1);},from(table){const query={table,op:'select',filters:{}};return {select(){return this;},eq(k,v){query.filters[k]=v;return this;},order(){return this;},single(){return this;},maybeSingle(){return this;},upsert(data){query.op='upsert';query.data=data;return this;},insert(data){query.op='insert';query.data=data;return this;},delete(){query.op='delete';return this;},update(data){query.op='update';query.data=data;return this;},then(resolve,reject){return window.__testDb('query',[query]).then(resolve,reject);}};}};
    ${names.map(name=>`export async function ${name}(...args){return window.__testDb('${name}',args);}`).join('\n')}
  `;
  async function open(profile = admin, time = '2026-10-24T12:00:00-03:00') {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' }); contexts.push(context);
    await context.addInitScript(profile => { localStorage.setItem('ls_profile', JSON.stringify(profile)); localStorage.removeItem('ls_last_activity'); }, profile);
    await context.exposeBinding('__testDb', async (_source, action, args) => {
      if (action === 'fetchSongs') return structuredClone(state.songs);
      if (action === 'fetchEvents') return structuredClone(state.events);
      if (action === 'fetchMembers') return [admin, member];
      if (action === 'setPresence') { state.events[0].event_members.find(row => row.member_id === args[1]).confirmed = args[2]; return; }
      if (action === 'upsertSong') { const index = state.songs.findIndex(song => song.id === args[0].id); if(index<0)state.songs.push(args[0]);else state.songs[index]=args[0];return args[0]; }
      if (action === 'saveVocalKey') { const song=state.songs.find(song=>song.id===args[0]);song.vocal_keys[args[1]]=args[2];return song.vocal_keys; }
      if (action === 'upsertEvent') { const index=state.events.findIndex(event=>event.id===args[0].id);if(index<0)state.events.push(args[0]);else state.events[index]={...state.events[index],...args[0]};return args[0]; }
      if (action === 'setEventItems') {
        const event=state.events.find(event=>event.id===args[0]);
        event.event_songs=args[1].map((item,index)=>({id:item.id,song_id:item.song_id,item_type:item.type,note_text:item.text,singer_member_id:item.singer_id,order_index:index+1}));
        event.event_members=args[2].map(member_id=>event.event_members?.find(row=>row.member_id===member_id)||{member_id,confirmed:null});
        return;
      }
      if (action === 'query') {
        const query = args[0];
        if (query.table === 'rehearsal_sessions') { if(query.op==='upsert')state.session={...state.session,...query.data};return {data:state.session,error:null}; }
        if (query.table === 'rehearsal_notes') { if(query.op==='upsert')state.notes[query.data.song_id]=query.data;return {data:state.notes[query.filters.song_id]||null,error:null}; }
        return {data:[],error:null};
      }
      return null;
    });
    await context.exposeBinding('__testBroadcast', async (_source, name, message) => { await Promise.all(pages.filter(page=>!page.isClosed()).map(page=>page.evaluate(({name,message})=>window.__testDeliver?.(name,message),{name,message}))); });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/src/lib/supabase.js*', route => route.fulfill({ contentType: 'text/javascript', body: code }));
    await page.route('**/version.json', route => route.fulfill({ json: {version:'test'} }));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
    await page.clock.setFixedTime(new Date(time));
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('button', {name:'Escala',exact:true})).toBeVisible();
    return page;
  }
  return { open, failures, state, async close(){for(const context of contexts)await context.close();} };
}
test('event presence updates both open event panels and returning from a song restores Escala', async ({browser}) => {
  const app=await fixture(browser);
  try {
    const first=await app.open(admin), second=await app.open(member);
    for(const page of [first,second]) { await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click(); }
    await second.locator('.gL2').getByRole('button',{name:'Confirmar',exact:true}).click();
    await expect(first.locator('.gL2').getByText('Confirmado',{exact:true})).toBeVisible();
    await expect(second.locator('.gL2').getByText('Confirmado',{exact:true})).toBeVisible();
    await first.locator('.gL2').getByText('Teste adoracao',{exact:true}).click();
    await first.getByRole('button',{name:'Voltar',exact:true}).click();
    await expect(first.locator('.nb.on')).toHaveText('Escala');
    await expect(first.locator('.gL2').getByText('Culto de Teste',{exact:true})).toBeVisible();
    expect(app.failures).toEqual([]);
  } finally {await app.close();}
});
test('today calendar navigation completes and ordinary members cannot create or edit events', async ({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open(member);await page.getByRole('button',{name:'Escala',exact:true}).click();
    await expect(page.getByRole('button',{name:'Novo',exact:true})).toHaveCount(0);
    const carousel=page.locator('.hide-scroll').filter({has:page.locator('[style*="scroll-snap-align"]')}).first();
    await carousel.locator(':scope > div').first().locator(':scope > div').first().evaluate(el=>el.click());
    await page.getByRole('button',{name:'Ir para Hoje',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ir para Hoje',exact:true})).toHaveCount(0);
    expect(await carousel.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
    await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Excluir',exact:true})).toHaveCount(0);
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('manual chord editing accepts spaces, vocal transposition renders and PDF contains the transposed text',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();await page.getByRole('button',{name:'Músicas',exact:true}).click();
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
    const page=await app.open();await page.getByRole('button',{name:'Músicas',exact:true}).click();await page.getByRole('button',{name:'Adicionar',exact:true}).click();
    await page.getByRole('button',{name:'⌨️ Digitar cifra manualmente',exact:true}).click();await expect(page.locator('textarea')).toBeVisible();
    await page.reload();await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Novo',exact:true}).click();
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
test('Bible plan uses the selected book and opening a passage does not mark it read',async({browser})=>{
  const app=await fixture(browser);
  try{
    const page=await app.open();const requests=[];
    await page.route('https://bible-api.com/**',route=>{requests.push(route.request().url());return route.fulfill({json:{verses:[{verse:1,text:'Versículo de teste'}]}});});
    await page.getByRole('button',{name:'Bíblia',exact:true}).click();await page.getByRole('button',{name:'Planos de leitura',exact:true}).click();
    await page.getByRole('button',{name:'Hebreus 11:1',exact:true}).click();await expect(page.getByRole('heading',{name:'Hebreus 11',exact:true})).toBeVisible();
    await expect.poll(()=>requests.some(url=>url.includes('/hebrews+11?'))).toBe(true);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls_bible_plans')||'{}'))).toEqual({});expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('two devices share rehearsal song, arrangement, running timer and stage alerts',async({browser})=>{
  const app=await fixture(browser);
  try{
    const first=await app.open(admin),second=await app.open(member);
    for(const page of [first,second])await page.getByRole('button',{name:'Ensaio',exact:true}).click();
    await first.getByRole('button',{name:'Teste ceia',exact:true}).click();
    await expect(second.getByRole('heading',{name:'Tocando agora: Teste ceia',exact:true})).toBeVisible();
    await first.getByRole('button',{name:'Worship',exact:true}).click();await expect(second.getByRole('button',{name:'Worship',exact:true})).toHaveAttribute('aria-pressed','true');
    await first.getByRole('button',{name:'Iniciar cronômetro',exact:true}).click();await expect(second.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
    const late=await app.open(member,'2026-10-24T12:00:12-03:00');
    await late.getByRole('button',{name:'Ensaio',exact:true}).click();
    await expect(late.locator('output')).toHaveText('00:12');

    await second.getByRole('button',{name:'🔊 Mais Volume!',exact:true}).click();await expect(first.getByText('Alerta de Palco: Membro Teste',{exact:true})).toBeVisible();
    expect(app.failures).toEqual([]);
  }finally{await app.close();}
});
test('starting the actual app without Supabase preserves cached offline songs',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  try{
    await context.addInitScript(({profile,songs})=>{localStorage.setItem('ls_profile',JSON.stringify(profile));localStorage.removeItem('ls_last_activity');localStorage.setItem('ls_songs',JSON.stringify(songs));},{profile:member,songs});
    const page=await context.newPage();await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());await page.goto('http://127.0.0.1:5174/');
    await page.getByRole('button',{name:'Músicas',exact:true}).click();await expect(page.getByText('Teste ceia',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls_songs')).length)).toBe(3);
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
      expect(app.state.events[0].event_songs.map(row=>row.song_id)).toEqual(['song-2','song-0','extra-0']);
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
