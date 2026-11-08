import { useState } from 'react';
import { Dialog, Icon, Section } from './Interface.jsx';
import { useActivityQuery, useVisibleView } from '../hooks/useActivity.js';

const dateText = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Person({ member, name, children }) {
  return <div className="ui-activity-person"><span className="ui-activity-avatar" style={{ '--person-color': member?.color || '#7b3ff2' }}>{member?.avatar || name?.slice(0, 2).toUpperCase() || '?'}</span><div><strong>{member?.name || name || 'Membro removido'}</strong>{children}</div></div>;
}

function QueryState({ query }) {
  if (query.loading) return <p className="ui-helper" role="status">Consultando registros…</p>;
  if (query.error) return <div className="ui-activity-error" role="alert"><p>{query.error}</p>{query.data && <p>Os dados abaixo podem estar desatualizados.</p>}<button className="ui-button ui-button-soft ui-button-small" onClick={query.refresh}>Tentar novamente</button></div>;
  return null;
}

export function ActivityMonitor({ activity, members, dark }) {
  const query = useActivityQuery(activity.credentials, 'online');
  const online = query.data?.members || [];
  return <div className="ui-scope ui-activity-monitor" data-theme={dark ? 'dark' : 'light'}>
    <Section icon="users" title="Membros on-line" description="App aberto em primeiro plano e conectado." action={<div className="ui-activity-summary">{query.data && !query.error && <span className="ui-badge" aria-live="polite">{online.length} on-line</span>}<button className="ui-icon-button" aria-label="Atualizar membros on-line" onClick={query.refresh}><Icon name="reset" size={17}/></button></div>}>
      <QueryState query={query}/>
      {query.data && <>
        {!online.length && !query.error && <p className="ui-helper">Nenhum membro conectado neste momento.</p>}
        <div className="ui-activity-list" aria-label="Membros on-line">{online.map(person => <Person key={person.memberId} member={members.find(member => member.id === person.memberId)} name={person.name}><small>{query.error ? 'Último estado conhecido' : <><span className="ui-online-dot"/>Conectado</>}</small></Person>)}</div>
        <p className="ui-helper ui-activity-footnote">Atualizado às {new Date(query.data.serverTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Uma queda de conexão pode levar até 75 segundos para aparecer.</p>
      </>}
    </Section>
  </div>;
}

function ViewersDialog({ activity, targetType, targetId, title, members, audience, dark, onClose }) {
  const query = useActivityQuery(activity.credentials, 'viewers', targetType, targetId);
  const viewers = query.data?.viewers || [];
  const seen = new Set(viewers.map(view => view.memberId));
  const waiting = members.filter(member => (audience ? audience.includes(member.id) : member.status === 'ativo') && !seen.has(member.id));
  return <Dialog compact dark={dark} icon="eye" title={targetType === 'event' ? 'Visualizações da escala' : 'Visualizações do aviso'} description={title} closeLabel="Fechar visualizações" onClose={onClose} footer={<button className="ui-button ui-button-primary ui-button-wide" onClick={onClose}>Fechar</button>}>
    <QueryState query={query}/>
    {query.data && <>
      <div className="ui-activity-summary"><span className="ui-badge">{viewers.length} {viewers.length === 1 ? 'pessoa visualizou' : 'pessoas visualizaram'}</span><button className="ui-button ui-button-quiet ui-button-small" onClick={query.refresh}>Atualizar</button></div>
      {!viewers.length && !query.error && <p className="ui-helper">Ainda não há visualizações registradas para este conteúdo.</p>}
      <div className="ui-activity-readers">{viewers.map(view => <Person key={view.memberId} member={members.find(member => member.id === view.memberId)} name={view.name}>
        <small>{view.viewCount > 1 ? 'Última visualização' : 'Visualizou em'}: <time dateTime={view.lastViewedAt}>{dateText(view.lastViewedAt)}</time></small>
        {view.viewCount > 1 && <small>Primeira: <time dateTime={view.firstViewedAt}>{dateText(view.firstViewedAt)}</time> · {view.viewCount} visualizações</small>}
      </Person>)}</div>
      {!!waiting.length && <details className="ui-activity-waiting"><summary>Sem registro de visualização ({waiting.length})</summary>{waiting.map(member => <Person key={member.id} member={member}><small>Sem registro</small></Person>)}</details>}
      <p className="ui-helper ui-activity-footnote">Os registros começam com a ativação deste recurso. Acessos offline aparecem após a sincronização. Visualizar não confirma presença nem garante a leitura completa.</p>
    </>}
  </Dialog>;
}

export function ViewersButton({ activity, targetType, targetId, title, members, audience, dark }) {
  const [open, setOpen] = useState(false);
  return <div className="ui-scope ui-viewers-control" data-theme={dark ? 'dark' : 'light'}>
    <button className="ui-button ui-button-soft ui-button-small" aria-label={`Ver visualizações de ${title}`} onClick={() => setOpen(true)}><Icon name="eye" size={16}/>Quem visualizou</button>
    {open && <ViewersDialog activity={activity} targetType={targetType} targetId={targetId} title={title} members={members} audience={audience} dark={dark} onClose={() => setOpen(false)}/>}
  </div>;
}

export function ObservedPost({ post, onView, enabled, children, ...props }) {
  const ref = useVisibleView(onView, post.id, { enabled });
  return <article ref={ref} aria-label={post.title} {...props}>{children}</article>;
}
