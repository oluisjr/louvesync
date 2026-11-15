import { useEffect, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import { communityEvents, churchDate, churchTime } from '../lib/community.js';
import { communityRequest } from '../lib/community-client.js';
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
  const [page,setPage]=useState('welcome'),[filter,setFilter]=useState('all');
  const [data,setData]=useState({events:[],prayers:[]}),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState(()=>newDraft(profile)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState(null);
  const scroll=useRef(null),heading=useRef(null),submitController=useRef(null),lastPage=useRef(page);
  useEffect(()=>()=>submitController.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let disposed=false;
    const load=async()=>{try{const result=await communityRequest({action:'public'},{signal:controller.signal});if(!disposed){setData({events:result.events||[],prayers:result.prayers||[]});setLoadError('');}}catch(failure){if(!disposed&&!controller.signal.aborted)setLoadError(failure.message);}finally{if(!disposed)setLoading(false);}};
    void load();const resume=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);const timer=setInterval(resume,60000);
    return()=>{disposed=true;controller.abort();clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[revision]);
  useEffect(()=>{scroll.current?.scrollTo({top:0});if(lastPage.current!==page)heading.current?.focus({preventScroll:true});lastPage.current=page;},[page]);
  const events=communityEvents(data.events,{filter}),next=communityEvents(data.events)[0];
  const change=patch=>{setDraft(previous=>({...previous,...patch}));setReceipt(null);};
  const submit=async event=>{
    event.preventDefault();if(busy||submitController.current)return;setBusy(true);setError('');setReceipt(null);const controller=new AbortController();submitController.current=controller;
    try{const result=await communityRequest({action:'submit_prayer',...draft},{credentials,signal:controller.signal});if(result.id!==draft.id)throw new Error('O envio não foi confirmado. Tente novamente.');setReceipt(result);setDraft(newDraft(profile));}
    catch(failure){if(!controller.signal.aborted)setError(failure.message);}finally{if(!controller.signal.aborted)setBusy(false);submitController.current=null;}
  };
  const navigate=destination=>setPage(destination);
  return <div className={'church-community'+(dark?' dark':'')} data-theme={dark?'dark':'light'} data-update-blocking={!!draft.message||busy}>
    <div className="church-shell"><header className="church-header"><img src="/brand/v2/mark-color.png" alt="" width="40" height="40"/><div><strong>Louve</strong><span>VIDA EM COMUNIDADE</span></div><button type="button" aria-label={dark?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>setDark(!dark)}><Icon name={dark?'sun':'moon'} size={19}/></button><span className="church-audience">{profile?'Membro':'Visitante'}</span>{profile&&<button type="button" aria-label="Sair da minha conta" onClick={onLogout}><Icon name="logout" size={18}/></button>}</header>
      <main ref={scroll} className="church-scroll" data-main-scroll aria-label="Comunidade da igreja">
        {loadError&&<div className="church-alert" role="alert">{loadError}<button type="button" onClick={()=>{setLoading(true);setRevision(value=>value+1);}}>Tentar novamente</button></div>}
        {page==='welcome'&&<section aria-label="Boas-vindas">
          <div className="church-welcome-hero"><span className="church-eyebrow">UM LUGAR PARA VOCÊ</span><h1 ref={heading} tabIndex={-1}>{profile?'Bem-vindo, '+profile.name.split(' ')[0]+'.':'Que bom ter você aqui.'}</h1><p>Um lugar para viver a fé em comunidade.</p><span className="church-welcome-note"><Icon name="heart" size={19}/>Você é sempre bem-vindo.</span><img src="/images/community/church.webp" alt="Igreja com portas abertas em arte 3D" width="280" height="345"/></div>
          <div className="church-entry-actions">{profile?<span className="church-member-banner"><Icon name="users" size={19}/>Você faz parte desta comunidade.</span>:<button className="church-login-cta" type="button" onClick={onLogin}><Icon name="lock" size={20}/><span>Fazer login</span><Icon name="right" size={19}/></button>}</div>
          <div className="church-section-heading"><h2>Nosso próximo encontro</h2><button type="button" onClick={()=>navigate('events')}>Ver agenda<Icon name="right" size={14}/></button></div>
          {loading?<p role="status" className="church-empty">Carregando os próximos encontros…</p>:next?<EventCard event={next} featured/>:<div className="church-empty"><Icon name="calendar" size={28}/><strong>Novos encontros em breve</strong><p>Acompanhe aqui a agenda publicada pela igreja.</p></div>}
          <button type="button" className="church-prayer-shortcut" onClick={()=>navigate('prayer')}><span><Icon name="heart" size={25}/></span><div><strong>Podemos orar por você?</strong><p>Compartilhe seu pedido com a gente.</p></div><Icon name="right" size={21}/></button>
        </section>}
        {page==='events'&&<section aria-label="Agenda da igreja"><div className="church-page-heading"><div><span className="church-eyebrow">JUNTOS NA MESMA FÉ</span><h1 ref={heading} tabIndex={-1}>Eventos<br/>da igreja</h1><p>Encontre seu próximo momento em comunidade.</p></div><img src="/images/community/calendar.webp" alt="" width="110" height="120"/></div><div className="church-filters" role="group" aria-label="Filtrar agenda">{[['all','Todos'],['week','Esta semana']].map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
          {loading?<p role="status" className="church-empty">Carregando agenda…</p>:events.length?<div className="church-events-list">{events.map((event,index)=><EventCard key={event.id} event={event} featured={index===0}/>)}</div>:<div className="church-empty"><Icon name="calendar" size={30}/><strong>Nenhum encontro neste período</strong><p>Os próximos encontros aparecerão aqui.</p></div>}
        </section>}
        {page==='prayer'&&<section aria-label="Pedido de oração"><div className="church-prayer-heading"><span className="church-eyebrow">CUIDADO E ACOLHIMENTO</span><h1 ref={heading} tabIndex={-1}>Como podemos<br/>orar por você?</h1><p>Você não precisa caminhar sozinho.</p><img src="/images/community/prayer.webp" alt="Mãos em oração sobre uma Bíblia em arte 3D" width="225" height="205"/></div>
          <form className="church-prayer-form" onSubmit={submit}><fieldset disabled={busy}><div className="church-form-card"><label><span>Seu nome <small>(opcional)</small></span><input value={draft.name} disabled={draft.anonymous} maxLength={100} onChange={event=>change({name:event.target.value})} placeholder="Como podemos chamar você?" autoComplete="name"/></label><label>Seu pedido de oração<textarea value={draft.message} required minLength={10} maxLength={2000} rows={4} onChange={event=>change({message:event.target.value})} placeholder="Escreva aqui o que deseja compartilhar…"/></label><span className="church-counter">{draft.message.length}/2000</span></div>
            <fieldset className="church-privacy"><legend>Quem pode ver?</legend><label><input type="radio" name="visibility" checked={draft.visibility==='team'} onChange={()=>change({visibility:'team'})}/><span>Somente a liderança responsável<Icon name="lock" size={16}/></span></label><label><input type="radio" name="visibility" checked={draft.visibility==='community'} onChange={()=>change({visibility:'community'})}/><span>Compartilhar com a comunidade<Icon name="users" size={16}/></span></label></fieldset>
            <p className="church-helper">{draft.visibility==='team'?'Seu pedido é privado e será acompanhado pela liderança responsável.':'Após revisão da liderança, membros e visitantes poderão ver este pedido.'}</p><label className="church-anonymous"><input type="checkbox" checked={draft.anonymous} onChange={event=>change({anonymous:event.target.checked})}/>Enviar sem meu nome</label>{draft.anonymous&&<p className="church-helper">O pedido não será vinculado ao seu cadastro.</p>}
            <label className="church-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={draft.website} onChange={event=>change({website:event.target.value})}/></label>
            {error&&<p className="church-alert" role="alert">{error}</p>}{receipt&&<p className="church-success" role="status"><Icon name="check"/>Pedido recebido. Nossa equipe vai acompanhar você em oração.<small>Protocolo: {receipt.id.slice(0,8)}</small></p>}
            <button className="church-primary church-submit" type="submit" disabled={busy||draft.message.trim().length<10}><Icon name="send" size={20}/>{busy?'Enviando…':'Enviar pedido de oração'}</button><p className="church-footnote"><Icon name="lock" size={13}/>Seu pedido será acolhido com respeito e cuidado.</p>
          </fieldset></form>{data.prayers.length>0&&<div className="church-prayer-wall"><h2>Oramos juntos</h2>{data.prayers.map(prayer=><article key={prayer.id}><strong>{prayer.anonymous||!prayer.display_name?'Pedido anônimo':prayer.display_name}</strong><p>{prayer.message}</p><small>{churchDate(prayer.created_at)}</small></article>)}</div>}
        </section>}
        {page==='bible'&&<section aria-label="Bíblia da comunidade"><h1 ref={heading} tabIndex={-1} className="church-sr-only">Bíblia</h1><BibleView dark={dark} profileId={profile?.id||'visitor'}/></section>}

      </main><nav className="church-navigation" aria-label="Navegação da comunidade">{destinations.map(([id,label,icon])=><button type="button" key={id} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon name={icon} size={23}/><span>{label}</span></button>)}</nav>
    </div>
  </div>;
}
