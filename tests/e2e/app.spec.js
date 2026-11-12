import { test, expect, devices } from '@playwright/test';
import fs from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { encodeSequence } from '../../src/lib/domain.js';
const names = [...fs.readFileSync('src/lib/supabase.js','utf8').matchAll(/export async function (\w+)/g)].map(match => match[1]);
const admin = { id: 'user-admin', name: 'Admin Teste', instrument: 'Vocal', role: 'Vocal', avatar: 'AT', color: '#7B3FF2', status: 'ativo', is_admin: true };
const member = { ...admin, id: 'user-member', name: 'Membro Teste', is_admin: false };
const songs = ['adoracao', 'ceia', 'jubilo'].map((cat, index) => ({ id: `song-${index}`, title: `Teste ${cat}`, artist: 'Fixture', cat, key: 'C', lyrics: '[C]Letra para [G]teste', bpm: 80, tags: [], time_signature: '4/4', vocal_keys: {} }));
const initialEvents = [{ id: 'event-1', date: '2026-10-25', time: '18:00:00', label: 'Culto de Teste', type: 'culto', event_songs: songs.map((song, index) => ({ id: index + 1, song_id: song.id, order_index: index + 1, item_type: 'song' })), event_members: [{ member_id: admin.id, confirmed: null }, { member_id: member.id, confirmed: null }] }];

test('saved dark theme covers the document before application JavaScript loads',async({browser})=>{
  const context=await browser.newContext();
  try{
    await context.addInitScript(()=>localStorage.setItem('ls_theme','dark'));
    const page=await context.newPage();
    await page.route('**/src/main.jsx',route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/,route=>route.abort());
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('status')).toHaveText('Abrindo LouveSync…');
    for(const selector of ['html','body'])await expect(page.locator(selector)).toHaveCSS('background-color','rgb(10, 4, 20)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#0A0414');
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
      const canvas=theme==='dark'?'rgb(10, 4, 20)':'rgb(245, 240, 255)';
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
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content',changed==='dark'?'#0A0414':'#F5F0FF');
      await expect.poll(()=>page.evaluate(()=>localStorage.getItem('ls_theme'))).toBe(changed);
      await page.reload();
      await expect(page.getByRole('button',{name:'Escala',exact:true})).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',changed);
      await expect(page.locator('body')).toHaveCSS('background-color',changed==='dark'?'rgb(10, 4, 20)':'rgb(245, 240, 255)');
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
      expect(Math.abs(844-menu.y-menu.height-34)).toBeLessThan(1);
      await page.getByRole('button',{name:'Novo',exact:true}).click();
      const layer=page.locator('.ui-dialog-layer');
      await expect.poll(async()=>Math.round((await layer.boundingBox()).height)).toBe(844);
      await expect(page.getByRole('dialog',{name:'Novo evento',exact:true})).toBeVisible();
      const footer=await layer.locator('footer').boundingBox();
      expect(Math.round(footer.y+footer.height)).toBe(844);
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Músicas',exact:true}).click();
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
      await expect(page.getByText('PIN incorreto. Tente novamente.',{exact:true})).toBeVisible();
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
    const checkEnd=async last=>{
      await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
      await expect(last).toBeInViewport();
      await expect.poll(async()=>{
        await main.evaluate(element=>{element.scrollTop=element.scrollHeight;});
        const box=await last.boundingBox();
        return Math.round((await nav.boundingBox()).y-box.y-box.height);
      }).toBeGreaterThanOrEqual(10);
      const item=await last.boundingBox(),menu=await nav.boundingBox();
      expect(menu.y-item.y-item.height).toBeLessThanOrEqual(36);
      expect(Math.abs(700-menu.y-menu.height-8)).toBeLessThan(1);
      const bounds=await main.boundingBox();expect(Math.round(bounds.y+bounds.height)).toBe(700);
    };
    for(const tab of ['Ensaio','Bíblia','Admin']){
      await page.getByRole('button',{name:tab,exact:true}).click();
      await checkEnd(main.locator('.ui-page > .ui-card, .app-page > .gL1').last());
    }
    await page.getByRole('button',{name:'Ensaio',exact:true}).click();
    const last=main.locator('.ui-page > .ui-card').last();
    const height=(await nav.boundingBox()).height;
    await nav.locator('button').evaluateAll(buttons=>buttons.forEach(button=>{button.style.paddingBottom='28px';}));
    await expect.poll(async()=>(await nav.boundingBox()).height).toBeGreaterThan(height);
    await checkEnd(last);
    await page.screenshot({path:test.info().outputPath('compact-footer.png'),scale:'css'});
    await page.getByRole('button',{name:'Músicas',exact:true}).click();
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
  const state = { songs: structuredClone(songs), events: structuredClone(initialEvents), members: structuredClone([admin,member]), memberRequests: [], session: null, notes: {}, nextItemId: 100, posts: [], activitySessions:new Map(), activityViews:new Map(), activityRequests:[], activityNow:Date.parse('2026-10-24T15:00:00Z'), activityFailure:null };
  const code = `
    import { updateEventItems } from '/src/lib/event-storage.js';
    const clone=value=>structuredClone(value);
    const channels=[];
    window.__testDeliver=(name,message)=>channels.filter(c=>c.topic===name).forEach(c=>c.handlers.filter(h=>h.type==='broadcast'&&h.filter.event===message.event).forEach(h=>h.fn({payload:message.payload})));
    export const supabase={channel(name){const c={topic:name,state:'joined',handlers:[],on(type,filter,fn){this.handlers.push({type,filter,fn});return this;},subscribe(fn){queueMicrotask(()=>fn?.('SUBSCRIBED'));return this;},unsubscribe(){},send(message){return window.__testBroadcast(name,message).then(()=> 'ok');}};channels.push(c);return c;},removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1);},from(table){const query={table,op:'select',filters:{},inFilters:{}};return {select(){return this;},eq(k,v){query.filters[k]=v;return this;},in(k,v){query.inFilters[k]=v;return this;},order(){return this;},single(){return this;},maybeSingle(){return this;},upsert(data){query.op='upsert';query.data=data;return this;},insert(data){query.op='insert';query.data=data;return this;},delete(){query.op='delete';return this;},update(data){query.op='update';query.data=data;return this;},then(resolve,reject){return window.__testDb('query',[query]).then(resolve,reject);}};}};
    export async function setEventItems(...args){return updateEventItems(supabase,...args);}
    ${names.filter(name=>name!=='setEventItems').map(name=>`export async function ${name}(...args){return window.__testDb('${name}',args);}`).join('\n')}
  `;
  async function open(profile = admin, time = '2026-10-24T12:00:00-03:00', options = {}) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block', ...options.device }); contexts.push(context);
    await context.addInitScript(profile => { localStorage.setItem('ls_profile', JSON.stringify(profile)); localStorage.removeItem('ls_last_activity'); }, profile);
    if(options.theme)await context.addInitScript(theme=>{if(!localStorage.getItem('ls_theme'))localStorage.setItem('ls_theme',theme);},options.theme);
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
      if (action === 'fetchSongs') return structuredClone(state.songs);
      if (action === 'fetchEvents') return structuredClone(state.events);
      if (action === 'fetchMembers') return structuredClone(state.members);
      if (action === 'upsertMember') {
        state.memberRequests.push(structuredClone(args[0]));
        await state.memberSaveGate;
        if(state.memberSaveError)throw new Error(state.memberSaveError);
        const unsupported=Object.keys(args[0]).find(key=>!['id','name','role','instrument','avatar','color','status','is_admin','pin','vocal_category'].includes(key));
        if(unsupported)throw new Error('Unknown members column: '+unsupported);
        const index=state.members.findIndex(member=>member.id===args[0].id);
        if(index<0)state.members.push(structuredClone(args[0]));else state.members[index]=structuredClone(args[0]);
        return args[0];
      }
      if (action === 'setPresence') { state.events[0].event_members.find(row => row.member_id === args[1]).confirmed = args[2]; return; }
      if (action === 'upsertSong') { const index = state.songs.findIndex(song => song.id === args[0].id); if(index<0)state.songs.push(args[0]);else state.songs[index]=args[0];return args[0]; }
      if (action === 'saveVocalKey') { const song=state.songs.find(song=>song.id===args[0]);song.vocal_keys[args[1]]=args[2];return song.vocal_keys; }
      if (action === 'setSingerForSong') { const event=state.events.find(event=>event.id===args[0]);event.event_songs.filter(row=>row.song_id===args[1]).forEach(row=>{row.singer_member_id=args[2];});return; }
      if (action === 'upsertEvent') {
        const unknown=Object.keys(args[0]).find(key=>!['id','date','time','type','label','theme'].includes(key));
        if(unknown)throw new Error("Could not find the '"+unknown+"' column of 'events' in the schema cache");
        const index=state.events.findIndex(event=>event.id===args[0].id);if(index<0)state.events.push(args[0]);else state.events[index]={...state.events[index],...args[0]};return args[0];
      }
      if (action === 'query') {
        const query = args[0];
        if(query.table==='announcements')return {data:structuredClone(state.posts),error:null};
        if (['event_songs', 'event_members'].includes(query.table)) {
          const eventId=query.filters.event_id||query.data?.[0]?.event_id;
          const event=state.events.find(event=>event.id===eventId);
          if(!event)return {data:null,error:{message:'Event not found'}};
          const rows=event[query.table]||[];
          const matches=row=>Object.entries(query.filters).every(([key,value])=>key==='event_id'||row[key]===value)&&Object.entries(query.inFilters).every(([key,values])=>values.includes(row[key]));
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
        return {data:[],error:null};
      }
      return null;
    });
    await context.exposeBinding('__testBroadcast', async (_source, name, message) => { await Promise.all(pages.filter(page=>!page.isClosed()).map(page=>page.evaluate(({name,message})=>window.__testDeliver?.(name,message),{name,message}))); });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/src/lib/supabase.js*', route => route.fulfill({ contentType: 'text/javascript', body: code }));
    if(options.activity)await page.route('**/api/activity',async route=>{
      const body=route.request().postDataJSON();state.activityRequests.push(structuredClone(body));
      const actor=state.members.find(row=>row.id===body.memberId&&row.pin===body.pin);
      const reply=(status,json)=>route.fulfill({status,json});
      if(!actor)return reply(401,{error:'Sessão inválida.'});
      if(['online','viewers'].includes(body.action)&&!actor.is_admin)return reply(403,{error:'Acesso exclusivo do administrador.'});
      if(state.activityFailure)return reply(503,{code:'ACTIVITY_SETUP_REQUIRED',error:state.activityFailure});
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
    });
    await page.route('**/version.json', route => route.fulfill({ json: {version:'test'} }));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
    await page.clock.setFixedTime(new Date(time));
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.getByRole('button', {name:'Escala',exact:true})).toBeVisible();
    return page;
  }
  return { open, failures, state, async close(){for(const context of contexts)await context.close();} };
}

test('admin sees online members across devices, foreground changes, disconnections and logout',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  try{
    const first=await app.open(admin,undefined,{activity:true}),second=await app.open(member,undefined,{activity:true});
    await first.getByRole('button',{name:'Admin',exact:true}).click();
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

test('missing monitoring setup reports unavailable data instead of declaring everyone offline or unread',async({browser})=>{
  const app=await fixture(browser);
  app.state.members=app.state.members.map((member,index)=>({...member,pin:index?'MEMBER_TEST_PIN':'ADMIN_TEST_PIN'}));
  app.state.activityFailure='O monitoramento precisa ser ativado no banco.';
  try{
    const page=await app.open(admin,undefined,{activity:true});
    await page.getByRole('button',{name:'Admin',exact:true}).click();
    await expect(page.locator('.ui-activity-monitor')).toContainText(app.state.activityFailure);
    await expect(page.locator('.ui-activity-monitor')).not.toContainText('0 on-line');
    await page.getByRole('button',{name:'Escala',exact:true}).click();await page.getByRole('button',{name:'Ver detalhes →',exact:true}).click();
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
    await first.getByRole('button',{name:'Ensaio',exact:true}).click();
    await first.getByRole('button',{name:'Tua Unção',exact:true}).click();
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

for(const viewport of [{name:'mobile',width:320,height:740},{name:'desktop-dark',width:1280,height:900}]){
  test('member editor stays above app chrome and saves a complete form on '+viewport.name,async({browser})=>{
    const app=await fixture(browser);
    try{
      const page=await app.open();
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      if(viewport.name==='desktop-dark')await page.getByRole('button',{name:'Tema',exact:true}).click();
      await page.getByRole('button',{name:'Admin',exact:true}).click();
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
      expect(saved.permissions).toBeUndefined();expect(saved.unavailableDays).toBeUndefined();
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
