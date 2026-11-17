import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import { churchDate, churchTime, prayerStatuses } from '../lib/community.js';
import { communityRequest } from '../lib/community-client.js';
import '../church-community.css';
import '../church-admin.css';

function PrayerReview({request,onReview,busy}) {
  const [status,setStatus]=useState(request.status),[published,setPublished]=useState(request.published);
  return <article className="church-review-card"><header><strong>{request.anonymous||!request.display_name?'Pedido anônimo':request.display_name}</strong><span data-private={request.visibility==='team'}><Icon name={request.visibility==='team'?'lock':'users'} size={13}/>{request.visibility==='team'?'Privado':'Compartilhamento autorizado'}</span></header><p>{request.message}</p><small>{churchDate(request.created_at)} · {churchTime(request.created_at)}</small><form onSubmit={event=>{event.preventDefault();onReview({...request,status,published:status!=='archived'&&published});}}><label>Andamento<select aria-label="Andamento" value={status} disabled={busy} onChange={event=>setStatus(event.target.value)}>{Object.entries(prayerStatuses).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{request.visibility==='community'&&<label className="church-admin-check"><input type="checkbox" checked={published} disabled={busy||status==='archived'} onChange={event=>setPublished(event.target.checked)}/>Publicar para a comunidade após revisão</label>}<button type="submit" disabled={busy}>Salvar acompanhamento</button></form></article>;
}
export default function ChurchAdmin({credentials,dark,onOpenSchedule}) {
  const [data,setData]=useState({events:[],prayers:[]}),[tab,setTab]=useState('events'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const mounted=useRef(false),controller=useRef(null),lock=useRef(false);
  const load=useCallback(async()=>{try{const result=await communityRequest({action:'admin_list'},{credentials,signal:controller.current?.signal});if(mounted.current){setData({events:result.events,prayers:result.prayers});setError('');}}catch(failure){if(mounted.current&&!controller.current?.signal.aborted)setError(failure.message);}finally{if(mounted.current)setLoading(false);}},[credentials]);
  useEffect(()=>{mounted.current=true;controller.current=new AbortController();void load();return()=>{mounted.current=false;controller.current?.abort();};},[load]);
  const review=async request=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try{const result=await communityRequest({action:'review_prayer',id:request.id,status:request.status,published:request.published,reviewed_at:request.reviewed_at},{credentials,signal:controller.current.signal});if(mounted.current){setNotice(result.pendingOffline?'Acompanhamento salvo neste aparelho. Publicação e status aguardam confirmação do servidor.':'Acompanhamento salvo.');await load();}}
    catch(failure){if(mounted.current)setError(failure.message);}finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  return <section className="church-admin" data-theme={dark?'dark':'light'} aria-label="Gestão da comunidade"><header><span className="church-eyebrow">VIDA EM COMUNIDADE</span><h2>Comunidade da igreja</h2><p>Consulte os próximos encontros e acompanhe os pedidos de oração.</p></header><div className="church-admin-tabs" role="group" aria-label="Gestão da igreja"><button type="button" aria-pressed={tab==='events'} onClick={()=>setTab('events')}>Agenda pública</button><button type="button" aria-pressed={tab==='prayers'} onClick={()=>setTab('prayers')}>Pedidos de oração</button><button type="button" aria-label="Atualizar comunidade" disabled={busy} onClick={()=>void load()}><Icon name="reset" size={17}/></button></div>
    {error&&<p className="church-alert" role="alert">{error}</p>}{notice&&<p className="church-success" role="status">{notice}</p>}{loading&&<p role="status">Carregando comunidade…</p>}
    {tab==='events'&&<><p className="church-admin-helper">A agenda acompanha os eventos da escala. Visitantes e membros veem apenas nome, dia e horário. Para criar ou alterar um encontro, use a tela Escala.</p>{onOpenSchedule&&<button type="button" className="ui-button ui-button-primary" onClick={onOpenSchedule}><Icon name="calendar" size={17}/>Abrir escala</button>}{data.events.map(event=><article className="church-admin-event" key={event.id}><div><h3>{event.title}</h3><p>{churchDate(event.starts_at)} · {event.time_defined===false?'Horário a definir':churchTime(event.starts_at)}</p></div></article>)}{!loading&&!data.events.length&&<p className="church-empty">Nenhum próximo encontro na escala.</p>}</>}
    {tab==='prayers'&&<><p className="church-admin-helper"><Icon name="lock" size={15}/>Somente administradores acessam esta lista. Um pedido privado nunca pode ser publicado.</p>{data.prayers.map(request=><PrayerReview key={request.id+':'+request.reviewed_at} request={request} busy={busy} onReview={review}/>)}{!loading&&!data.prayers.length&&<p className="church-empty">Nenhum pedido recebido por enquanto.</p>}</>}

  </section>;
}
