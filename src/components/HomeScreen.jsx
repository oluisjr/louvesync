import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { localDate } from '../lib/domain.js';
import { performanceKey } from '../lib/chords.js';
import { homeMonthDates, homeView, homeVocalCategories } from '../lib/home-view.js';
import { Icon } from './Interface.jsx';
import InteractiveArtwork from './InteractiveArtwork.jsx';
import { SetlistBadge } from './SetlistConfirmation.jsx';
import '../home.css';

const eventTypes = {culto:'Culto',ensaio:'Ensaio',ebd:'EBD',consagracao:'Consagração',outro:'Evento'};
const dateLabel = date => new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});

function Confirmation({ event, profile, today, busy, disabled, onConfirm }) {
  if (!(event.members || []).includes(profile?.id) || event.date < today) return null;
  const response = event.confirmations?.[profile.id];
  const pending = response == null;
  return <div className="home-pending" data-state={pending?'pending':response?'confirmed':'declined'} aria-live="polite">
    <p><Icon name={pending?'bell':response?'check':'info'} size={17}/>{pending?'Sua participação está pendente.':response?'Presença confirmada.':'Você informou que não poderá ir.'}</p>
    {pending && <div className="home-confirm-actions"><button type="button" disabled={disabled} onClick={()=>onConfirm(event,true)}><Icon name="check" size={17}/>{busy?'Salvando…':'Confirmar'}</button><button type="button" disabled={disabled} onClick={()=>onConfirm(event,false)}><Icon name="close" size={17}/>Recusar</button></div>}
  </div>;
}

function SongList({ songs, event, onSelectSong }) {
  return <ol className="home-song-list">{songs.map((song,index)=><li key={`${song.id}-${index}`}><button type="button" aria-label={`Abrir cifra de ${song.title}`} onClick={()=>onSelectSong(song,event)}><span className="home-song-number" aria-hidden="true">{index+1}</span><span className="home-song-copy"><strong>{song.title || 'Sem título'}</strong><small>{song.artist || 'Ministério'}</small></span><span className="home-song-key">{performanceKey(song,event)}</span></button></li>)}</ol>;
}

export default memo(function HomeScreen({ profile, dark, songs, events, members, Avatar, selectedDate, onDateChange, onNavTo, onSelectSong, onSetAddOpen, onConfirm, onOpenEvent, onCreateEvent, spawnConfetti }) {
  const headingId = useId();
  const today = localDate();
  const [teamView,setTeamView] = useState('assigned');
  const [saving,setSaving] = useState(null);
  const view = useMemo(()=>homeView({events,songs,members,profileId:profile?.id,today,selectedDate}),[events,songs,members,profile?.id,today,selectedDate]);
  const dates = useMemo(()=>homeMonthDates(view.date),[view.date]);
  const vocalCategories = homeVocalCategories(profile);
  const calendar = useRef(null);
  const gesture = useRef({active:false,moved:false});
  const allowed = tab => !(['membros','admin'].includes(tab)&&!profile?.is_admin) && (!profile?.permissions || profile.permissions.includes(tab));
  const primary = view.primary;
  const currentTeam = teamView === 'assigned' ? view.assigned : view.activeMembers;
  const openEvent = event => { if (allowed(event.type==='ensaio'?'ensaio':'escala')) onOpenEvent(event); };
  const respond = async (event,value) => {
    if (saving) return;
    setSaving(event.id);
    try { const saved=await onConfirm(event.id,value);if(saved!==false&&value)spawnConfetti(); }
    finally { setSaving(null); }
  };
  useEffect(()=>{
    const list=calendar.current;
    const selected=list?.querySelector('[aria-pressed="true"]');
    if (selected) list.scrollTo({left:selected.offsetLeft-list.offsetLeft-(list.clientWidth-selected.clientWidth)/2});
  },[view.date]);
  const openLabel = primary?.type==='ensaio'?'Abrir Ensaio':'Ver escala';
  const primaryIsNext = primary && view.upcoming[0]?.id === primary.id;
  const badge = primary ? `${primaryIsNext?'Próximo ':''}${eventTypes[primary.type] || 'Evento'}` : '';

  return <section className="app-page home-page" data-theme={dark?'dark':'light'} aria-labelledby={headingId}>
    <header className="home-greeting"><div><span className="home-eyebrow">✦ Bem-vindo de volta</span><h1 id={headingId}>{profile?.name?.split(' ')[0] || 'Usuário'}</h1><p>{profile?.role || 'Membro'}</p></div><time dateTime={today}>{dateLabel(today)}</time></header>
    <div className="home-stats" aria-label="Resumo do ministério">{[
      {value:view.stats.songs,label:'Músicas',tone:'purple'},
      {value:view.stats.members,label:'Membros',tone:'green'},
      {value:view.stats.services,label:'Cultos',tone:'amber'},
      {value:view.stats.confirmed,label:'Confirm.',tone:'pink'},
    ].map(stat=><div key={stat.label} className="gL1" data-tone={stat.tone}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>

    {primary ? <article className="gL1 home-hero" aria-label={primary.label}>
      <div className="home-hero-top"><div className="home-hero-copy"><span className="home-eyebrow"><Icon name="calendar" size={17}/>{badge}</span><h2>{primary.label}</h2><p className="home-event-date"><time dateTime={`${primary.date}T${primary.time || '00:00'}`}>{dateLabel(primary.date)} · {String(primary.time || '').slice(0,5)}</time></p>{primary.theme&&<p className="home-event-theme"><Icon name="book" size={14}/>{primary.theme}</p>}{allowed(primary.type==='ensaio'?'ensaio':'escala')&&<button type="button" className="home-primary-action" onClick={()=>openEvent(primary)}>{openLabel}<Icon name="right" size={15}/></button>}</div>
        <InteractiveArtwork className="home-stage" src="/images/home/worship-stage.webp" alt="Palco com teclado, violão, microfone, caixas e cruz dourada" label="Mover ilustração do palco" width="984" height="730" eager/>
      </div>
      <Confirmation event={primary} profile={profile} today={today} busy={saving===primary.id} disabled={!!saving} onConfirm={respond}/>
    </article> : <section className="gL1 home-empty"><Icon name="calendar" size={28}/><h2>{events.length?'Nenhum evento neste dia':'Nenhum compromisso agendado'}</h2><p>{dateLabel(view.date)}</p>{profile?.is_admin&&<button type="button" className="home-primary-action" onClick={()=>onCreateEvent(view.date)}><Icon name="plus" size={17}/>Criar evento neste dia</button>}</section>}

    {!!view.otherPending.length && <section className="gL1 home-other-pending" aria-label="Outras confirmações pendentes"><h2><Icon name="bell" size={17}/>Outras confirmações</h2>{view.otherPending.map(event=><article key={event.id}><strong>{event.label}</strong><small>{dateLabel(event.date)} · {String(event.time || '').slice(0,5)}</small><Confirmation event={event} profile={profile} today={today} busy={saving===event.id} disabled={!!saving} onConfirm={respond}/></article>)}</section>}

    {view.featured&&<button type="button" aria-label={`Estudar ${view.featured.title}`} className="gL1 home-featured" onClick={()=>onSelectSong(view.featured)}><span className="home-eyebrow"><Icon name="music" size={18}/>Música da semana</span><strong className="home-featured-title">{view.featured.title}</strong><span className="home-featured-meta">{view.featured.artist || 'Ministério'} · Tom {view.featured.key || 'N/A'}</span>{view.featured.featured_note&&<span className="home-featured-note">“{view.featured.featured_note}”</span>}<span className="home-featured-action">Estudar cifra <Icon name="right" size={16}/></span></button>}

    {!!vocalCategories.length&&<aside className="home-reminder"><strong><Icon name="mic" size={16}/>Lembrete para Vocais</strong><p>Você é responsável por alimentar o repertório com novas músicas de <b>{vocalCategories.join(', ')}</b>.</p></aside>}

    <section className="gL1 home-calendar" aria-label="Agenda do mês"><div className="home-section-heading"><h2><Icon name="calendar" size={17}/>Agenda do mês</h2><div><span>{new Date(view.date+'T12:00:00').toLocaleDateString('pt-BR',{month:'long'})}</span><button type="button" onClick={()=>onDateChange(today)}>Hoje</button></div></div>
      <div ref={calendar} className="home-calendar-dates" role="group" aria-label="Dias da agenda" onPointerDown={event=>{
        gesture.current={active:event.pointerType==='mouse'&&event.button===0,moved:false,id:event.pointerId,x:event.clientX,left:event.currentTarget.scrollLeft};
      }} onPointerMove={event=>{
        const active=gesture.current;if(!active.active||active.id!==event.pointerId)return;
        const distance=event.clientX-active.x;
        if(Math.abs(distance)>6){active.moved=true;if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.scrollLeft=active.left-distance;}
      }} onPointerUp={event=>{gesture.current.active=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{gesture.current.active=false;}} onPointerLeave={()=>{if(!gesture.current.moved)gesture.current.active=false;}} onKeyDown={()=>{gesture.current.moved=false;}} onClickCapture={event=>{if(gesture.current.moved){event.preventDefault();event.stopPropagation();}}}>
        {dates.map(date=>{const parsed=new Date(date+'T12:00:00'),hasEvent=events.some(event=>event.date===date);return <button type="button" key={date} data-date={date} data-istoday={date===today} data-has-event={hasEvent} aria-label={parsed.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} aria-pressed={date===view.date} aria-current={date===today?'date':undefined} onClick={()=>onDateChange(date)}><span>{parsed.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span><strong>{parsed.getDate()}</strong><i aria-hidden="true"/>{date===today&&<small>Hoje</small>}</button>;})}
      </div>
    </section>

    {primary&&primary.type!=='ensaio'&&<section className="gL1 home-setlist" aria-label="Repertório do evento"><div className="home-section-heading"><h2><Icon name="music" size={18}/>{primary.type==='culto'?'Setlist do culto':'Setlist do evento'}</h2><span>{view.eventSongs.length} música{view.eventSongs.length===1?'':'s'}</span></div><SetlistBadge event={primary} songs={songs}/>{view.eventSongs.length?<SongList songs={view.eventSongs} event={primary} onSelectSong={onSelectSong}/>:<p className="home-helper">Nenhuma música definida para este evento.</p>}</section>}

    {!!view.additional.length&&<section className="home-additional" aria-label="Outros eventos do dia">{view.additional.map(event=>{
      const eventSongs=event.type==='ensaio'?[]:(event.songs||[]).map(id=>songs.find(song=>song.id===id)).filter(Boolean);
      return <article className="gL1 home-secondary-event" key={event.id} aria-label={event.label}><div className="home-section-heading"><span className="home-eyebrow">{eventTypes[event.type] || 'Evento'}</span><time>{String(event.time || '').slice(0,5)}</time></div><h2>{event.label}</h2>{event.theme&&<p className="home-helper">{event.theme}</p>}{allowed(event.type==='ensaio'?'ensaio':'escala')&&<button type="button" className="home-inline-action" onClick={()=>openEvent(event)}>{event.type==='ensaio'?'Abrir Ensaio':'Ver escala'}<Icon name="right" size={15}/></button>}{!!eventSongs.length&&<details><summary>Repertório · {eventSongs.length} músicas</summary><SongList songs={eventSongs} event={event} onSelectSong={onSelectSong}/></details>}<Confirmation event={event} profile={profile} today={today} busy={saving===event.id} disabled={!!saving} onConfirm={respond}/></article>;
    })}</section>}

    <div className="home-quick-actions">{allowed('ia')&&<button type="button" className="home-maestro" onClick={()=>onNavTo('ia')}><Icon name="sparkles" size={22}/><strong>Maestro</strong><span>IA de adoração</span></button>}{allowed('repertorio')&&<button type="button" className="home-add-song" onClick={()=>onSetAddOpen(true)}><Icon name="plus" size={23}/><strong>Adicionar</strong><span>Nova música</span></button>}</div>

    <section className="gL1 home-team" aria-label="Equipe"><div className="home-section-heading"><h2><Icon name="users" size={18}/>Equipe</h2>{allowed('membros')&&<button type="button" onClick={()=>onNavTo('membros')}>Ver todos <Icon name="right" size={15}/></button>}</div><div className="home-team-tabs" role="group" aria-label="Integrantes da equipe"><button type="button" aria-pressed={teamView==='assigned'} onClick={()=>setTeamView('assigned')}>Escalados <span>{view.assigned.length}</span></button><button type="button" aria-pressed={teamView==='active'} onClick={()=>setTeamView('active')}>Equipe ativa <span>{view.activeMembers.length}</span></button></div><div className="home-team-members">{currentTeam.length?currentTeam.map(member=><div key={member.id} className="home-team-member" aria-label={`${member.name}, ${member.instrument || 'Integrante'}`}><Avatar m={member} size={42} ring/><strong>{member.name?.split(' ')[0]}</strong><span>{member.instrument || member.role || 'Integrante'}</span></div>):<p className="home-helper">{teamView==='assigned'?'Nenhum integrante escalado para este dia.':'Nenhum integrante ativo.'}</p>}</div></section>
  </section>;
});
