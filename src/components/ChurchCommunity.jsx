import { useEffect, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import { communityEvents, churchDate, churchDay, churchTime } from '../lib/community.js';
import { scheduleWeekStart, scheduleWeekDates, scheduleWeekLabel, shiftScheduleWeek } from '../lib/schedule-view.js';
import { communityRequest } from '../lib/community-client.js';
import { useOfflineSync } from '../hooks/useOfflineSync.js';
import OfflineStatus from './OfflineStatus.jsx';
import { cacheRead, cacheWrite, cacheRemove } from '../lib/offline-store.js';
import '../church-community.css';

const newDraft = profile => ({id:crypto.randomUUID(),name:profile?.name||'',message:'',anonymous:false,visibility:'team',website:''});
const destinations=[['welcome','Início','home'],['events','Agenda','calendar'],['prayer','Oração','heart'],['bible','Bíblia','book']];
function EventCard({event,featured=false}) {
  const time=event.time_defined===false?'Horário a definir':churchTime(event.starts_at);
  return <article className={'church-event-card'+(featured?' church-event-featured':'')} aria-label={event.title}>
    {featured&&<div className="church-event-cover"><span>{churchDate(event.starts_at,{weekday:'short',day:undefined,month:undefined})}<strong>{time}</strong></span></div>}
    <div className="church-event-body">{!featured&&<time dateTime={event.starts_at}><span>{churchDate(event.starts_at,{month:'short'})}</span><strong>{time}</strong></time>}<div><h3>{event.title}</h3><p><Icon name="calendar" size={14}/>{churchDate(event.starts_at,{weekday:'long'})}{featured&&' · '+time}</p></div></div>
  </article>;
}
export default function ChurchCommunity({profile,credentials,onLogin,onLogout,dark,setDark,BibleView}) {
  const offline=useOfflineSync(credentials,profile), draftKey='prayer-draft:'+(profile?.id||'visitor');
  const [page,setPage]=useState('welcome'),[selectedWeek,setSelectedWeek]=useState(null);
  const [data,setData]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState(()=>({...newDraft(profile),...cacheRead(draftKey),visibility:'team'})),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState(null);
  useEffect(()=>{if(draft.message)cacheWrite(draftKey,draft);else cacheRemove(draftKey);},[draftKey,draft]);
  const scroll=useRef(null),heading=useRef(null),submitController=useRef(null),lastPage=useRef(page);
  useEffect(()=>()=>submitController.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let disposed=false;
    const load=async()=>{try{const result=await communityRequest({action:'public'},{signal:controller.signal});if(!disposed){setData(result.events||[]);setLoadError('');}}catch(failure){if(!disposed&&!controller.signal.aborted)setLoadError(failure.message);}finally{if(!disposed)setLoading(false);}};
    void load();const resume=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('online',resume);window.addEventListener('louvesync:connected',resume);window.addEventListener('louvesync:synced',resume);document.addEventListener('visibilitychange',resume);const timer=setInterval(resume,60000);
    return()=>{disposed=true;controller.abort();clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('louvesync:connected',resume);window.removeEventListener('louvesync:synced',resume);document.removeEventListener('visibilitychange',resume);};
  },[revision]);
  useEffect(()=>{scroll.current?.scrollTo({top:0});if(lastPage.current!==page)heading.current?.focus({preventScroll:true});lastPage.current=page;},[page]);
  const currentWeek=scheduleWeekStart(churchDay(Date.now()));
  const week=selectedWeek && selectedWeek>=currentWeek ? selectedWeek : currentWeek;
  const upcoming=communityEvents(data),next=upcoming[0];
  const lastWeek=upcoming.length ? scheduleWeekStart(churchDay(upcoming.at(-1).starts_at)) : currentWeek;
  const events=communityEvents(data,{week});
  const change=patch=>{setDraft(previous=>({...previous,...patch}));setReceipt(null);};
  const submit=async event=>{
    event.preventDefault();if(busy||submitController.current)return;setBusy(true);setError('');setReceipt(null);const controller=new AbortController();submitController.current=controller;
    try{const result=await communityRequest({action:'submit_prayer',...draft,visibility:'team'},{credentials,signal:controller.signal});if(result.id!==draft.id)throw new Error('O envio não foi confirmado. Tente novamente.');setReceipt(result);setDraft(newDraft(profile));}
    catch(failure){if(!controller.signal.aborted)setError(failure.message);}finally{if(!controller.signal.aborted)setBusy(false);submitController.current=null;}
  };
  const navigate=destination=>setPage(destination);
  return <div className={'church-community'+(dark?' dark':'')} data-theme={dark?'dark':'light'} data-update-blocking={!!draft.message||busy}>
    <div className="church-shell"><header className="church-header"><img src="/brand/v2/mark-color.png" alt="" width="40" height="40"/><div><strong>Louve</strong><span>VIDA EM COMUNIDADE</span></div><button type="button" aria-label={dark?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>setDark(!dark)}><Icon name={dark?'sun':'moon'} size={19}/></button><span className="church-audience">{profile?'Membro':'Visitante'}</span>{profile&&<button type="button" aria-label="Sair da minha conta" onClick={onLogout}><Icon name="logout" size={18}/></button>}</header>
      <OfflineStatus state={offline} refreshError={loadError} onRefresh={()=>setRevision(value=>value+1)}/>
      <main ref={scroll} className="church-scroll" data-main-scroll aria-label="Comunidade da igreja">
        {page==='welcome'&&<section aria-label="Boas-vindas">
          <div className="church-welcome-hero"><span className="church-eyebrow">UM LUGAR PARA VOCÊ</span><h1 ref={heading} tabIndex={-1}>{profile?'Bem-vindo, '+profile.name.split(' ')[0]+'.':'Que bom ter você aqui.'}</h1><p>Um lugar para viver a fé em comunidade.</p><span className="church-welcome-note"><Icon name="heart" size={19}/>Você é sempre bem-vindo.</span><img src="/images/community/church.webp" alt="Igreja com portas abertas em arte 3D" width="280" height="345"/></div>
          <div className="church-entry-actions">{profile?<span className="church-member-banner"><Icon name="users" size={19}/>Você faz parte desta comunidade.</span>:<button className="church-login-cta" type="button" onClick={onLogin}><Icon name="lock" size={20}/><span>Fazer login</span><Icon name="right" size={19}/></button>}</div>
          <div className="church-section-heading"><h2>Nosso próximo encontro</h2><button type="button" onClick={()=>navigate('events')}>Ver agenda<Icon name="right" size={14}/></button></div>
          {loading?<p role="status" className="church-empty">Carregando os próximos encontros…</p>:next?<EventCard event={next} featured/>:<div className="church-empty"><Icon name="calendar" size={28}/><strong>Novos encontros em breve</strong><p>Acompanhe aqui a agenda publicada pela igreja.</p></div>}
          <button type="button" className="church-prayer-shortcut" onClick={()=>navigate('prayer')}><span><Icon name="heart" size={25}/></span><div><strong>Podemos orar por você?</strong><p>Compartilhe seu pedido com a gente.</p></div><Icon name="right" size={21}/></button>
        </section>}
        {page==='events'&&<section aria-label="Agenda da igreja">
          <div className="church-page-heading"><div><h1 ref={heading} tabIndex={-1}>Eventos da igreja</h1></div><img src="/images/community/calendar.webp" alt="" width="110" height="120"/></div>
          <div className="church-week" role="group" aria-label="Semana da agenda">
            <button type="button" aria-label="Semana anterior" disabled={week===currentWeek} onClick={()=>setSelectedWeek(shiftScheduleWeek(week,-1))}><Icon name="left" size={22}/></button>
            <div aria-live="polite">{week===currentWeek && <span>Esta semana</span>}<h2>{scheduleWeekLabel(scheduleWeekDates(week))}</h2></div>
            <button type="button" aria-label="Próxima semana" disabled={loading || week>=lastWeek} onClick={()=>setSelectedWeek(shiftScheduleWeek(week,1))}><Icon name="right" size={22}/></button>
          </div>
          {loading?<p role="status" className="church-empty">Carregando agenda…</p>:events.length?<div className="church-events-list">{events.map(event=><EventCard key={event.id} event={event}/>)}</div>:<div className="church-empty"><Icon name="calendar" size={30}/><strong>Nenhum encontro nesta semana</strong></div>}
        </section>}
        {page==='prayer'&&<section aria-label="Pedido de oração"><div className="church-prayer-heading"><h1 ref={heading} tabIndex={-1}>Como podemos<br/>orar por você?</h1><p>Seu pedido será recebido em particular pela equipe responsável.</p><img src="/images/community/prayer-character.webp" alt="Personagem em oração junto à Bíblia" width="225" height="205"/></div>
          <form className="church-prayer-form" onSubmit={submit}><fieldset disabled={busy}><div className="church-form-card"><label><span>Seu nome <small>(opcional)</small></span><input value={draft.name} disabled={draft.anonymous} maxLength={100} onChange={event=>change({name:event.target.value})} placeholder="Como podemos chamar você?" autoComplete="name"/></label><label>Seu pedido de oração<textarea value={draft.message} required minLength={10} maxLength={2000} rows={4} onChange={event=>change({message:event.target.value})} placeholder="Escreva aqui o que deseja compartilhar…"/></label><span className="church-counter">{draft.message.length}/2000</span></div>
            <label className="church-anonymous"><input type="checkbox" checked={draft.anonymous} onChange={event=>change({anonymous:event.target.checked})}/>Enviar sem meu nome</label>
            <label className="church-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={draft.website} onChange={event=>change({website:event.target.value})}/></label>
            {error&&<p className="church-alert" role="alert">{error}</p>}{receipt&&<p className="church-success" role="status"><Icon name="check"/>{receipt.pendingOffline?'Pedido salvo neste aparelho. Será enviado à liderança quando a conexão voltar.':'Pedido recebido. Nossa equipe vai acompanhar você em oração.'}<small>Protocolo: {receipt.id.slice(0,8)}</small></p>}
            <button className="church-primary church-submit" type="submit" disabled={busy||draft.message.trim().length<10}><Icon name="send" size={20}/>{busy?'Enviando…':'Enviar pedido de oração'}</button><p className="church-footnote"><Icon name="lock" size={13}/>Seu pedido será acolhido com respeito e cuidado.</p>
          </fieldset></form>
        </section>}
        {page==='bible'&&<section aria-label="Bíblia da comunidade"><h1 ref={heading} tabIndex={-1} className="church-sr-only">Bíblia</h1><BibleView dark={dark} profileId={profile?.id||'visitor'}/></section>}

      </main><nav className="church-navigation" aria-label="Navegação da comunidade">{destinations.map(([id,label,icon])=><button type="button" key={id} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon name={icon} size={23}/><span>{label}</span></button>)}</nav>
    </div>
  </div>;
}
