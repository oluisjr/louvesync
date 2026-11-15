import { useState } from 'react';
import { Icon } from './Interface.jsx';
import { canManageMinistry, changeKinds, changeStatuses } from '../lib/change-requests.js';
import { useChangeRequests } from '../hooks/useChangeRequests.js';

const dateText = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fieldNames = { title: 'Título', artist: 'Artista', lyrics: 'Letra', bpm: 'BPM', time_signature: 'Compasso', cat: 'Categoria', tags: 'Marcadores', yturl: 'YouTube', media_url: 'Mídia', key: 'Tom' };
const show = value => value == null || value === '' ? 'Não informado' : typeof value === 'object' ? JSON.stringify(value) : String(value);

function Proposal({ request, songs }) {
  const before = request.before_record || {}, next = request.proposal || {};
  if (request.kind === 'key') return <div className="request-difference"><span>{before.key || before.songKey || 'Original'}</span><span aria-hidden="true">→</span><strong>{next.key}</strong><small>Tom neste evento</small></div>;
  if (request.kind === 'song') return <div className="request-song-difference"><span>{before.title || songs.find(song => song.id === request.source_song_id)?.title || 'Música anterior'}</span><Icon name="arrow-right" size={16}/><strong>{next.title || songs.find(song => song.id === next.songId)?.title || next.songId}</strong></div>;
  return <details className="request-fields"><summary>Ver dados propostos</summary>{Object.entries(next).map(([key, value]) => <div key={key}><strong>{fieldNames[key] || key}</strong>{request.kind === 'song_edit' && <p className="request-before">Antes: {show(before[key])}</p>}<p>Proposto: {show(value)}</p></div>)}</details>;
}

function RequestCard({ request, leader, songs, events, send, onSaved, disabled }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const decide = async decision => {
    if (busy) return; setBusy(true); setError('');
    try {
      await send({ action: decision === 'cancelled' ? 'cancel' : 'decide', requestId: request.id, ...(decision !== 'cancelled' ? { decision, decisionNote: note } : {}) });
      window.dispatchEvent(new Event('louvesync:changes'));
      void Promise.resolve(onSaved?.()).catch(() => {});
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const title = songs.find(song => song.id === request.source_song_id)?.title || request.before_record?.title || request.proposal?.title || 'Música';
  return <article className="change-request-card" data-status={request.status} data-update-blocking={busy} aria-label={`${changeKinds[request.kind]} de ${request.actor_name}`}>
    <header><span className="request-type">{changeKinds[request.kind]}</span><span className="request-status">{changeStatuses[request.status]}</span></header>
    <h4>{title}</h4>
    <p className="request-author"><strong>{request.actor_name}</strong> · {dateText(request.created_at)}</p>
    {request.event_id && <p className="request-event">{events?.find(event => event.id === request.event_id)?.label || 'Escala do evento'}</p>}
    <Proposal request={request} songs={songs}/>
    <blockquote>{request.reason}</blockquote>
    {request.status === 'pending' ? <>
      {leader ? <><label className="request-note">Observação da liderança (opcional)<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2}/></label><div className="request-decisions"><button type="button" className="request-approve" disabled={busy || disabled} onClick={() => decide('approved')}><Icon name="check" size={16}/>{busy ? 'Salvando…' : 'Aprovar'}</button><button type="button" disabled={busy || disabled} onClick={() => decide('rejected')}>Recusar</button></div></> : <><p className="request-waiting"><Icon name="timer" size={15}/>Aguardando aprovação da liderança</p><button type="button" className="request-cancel" disabled={busy || disabled} onClick={() => decide('cancelled')}>Cancelar solicitação</button></>}
    </> : <p className="request-decision">{request.decided_name || 'Responsável'} · {dateText(request.decided_at)}{request.decision_note && <span>{request.decision_note}</span>}</p>}
    {error && <p role="alert" className="request-error">{error}</p>}
  </article>;
}

export default function ChangeRequestsPanel({ credentials, profile, eventId, songs, events, onSaved }) {
  const [filter, setFilter] = useState('pending');
  const query = useChangeRequests(credentials, { eventId, pending: filter === 'pending' });
  const requests = query.data?.requests || [], rows = requests.filter(request => filter === 'all' || request.status === 'pending');
  return <section className="change-requests-panel" aria-label={canManageMinistry(profile) ? 'Solicitações da equipe' : 'Meus pedidos'}>
    <div className="request-panel-heading"><div><h3>{canManageMinistry(profile) ? 'Solicitações da equipe' : 'Meus pedidos'}</h3><p>{query.data ? `${query.data.pendingCount} pendente${query.data.pendingCount === 1 ? '' : 's'}` : 'Consultando o servidor'}</p></div><button type="button" className="event-icon-button" aria-label="Atualizar solicitações" onClick={query.refresh} disabled={query.loading}><Icon name="reset" size={18}/></button></div>
    <div className="request-filters" role="group" aria-label="Filtrar solicitações"><button type="button" aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Pendentes</button><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button></div>
    {query.error && <p role="alert" className="request-error">{query.error} Os registros exibidos podem estar desatualizados.</p>}
    {query.loading && <p role="status" className="request-helper">Consultando solicitações…</p>}
    {!query.loading && !query.error && !rows.length && <div className="request-empty"><Icon name="check" size={26}/><strong>{filter === 'pending' ? 'Nenhum pedido pendente' : 'Nenhuma solicitação ainda'}</strong><p>As alterações aprovadas aparecem no setlist para toda a equipe.</p></div>}
    {rows.map(request => <RequestCard key={request.id + request.status} request={request} leader={canManageMinistry(profile)} songs={songs} events={events} send={query.send} onSaved={onSaved} disabled={!!query.error || query.loading}/>)}
    {query.data?.hasMore && <button className="event-button" type="button" disabled={query.loading} onClick={query.loadMore}>Carregar mais solicitações</button>}
  </section>;
}

