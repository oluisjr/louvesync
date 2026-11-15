import { Icon } from './Interface.jsx';
import { useChangeRequests } from '../hooks/useChangeRequests.js';

const entities = { events: 'Evento', event_songs: 'Setlist', event_members: 'Equipe / participação', songs: 'Música', members: 'Membro', equipment: 'Patrimônio', announcements: 'Comunicado', announcement_comments: 'Comentário', announcement_reactions: 'Reação', announcement_saves: 'Aviso salvo', rehearsal_sessions: 'Ensaio', rehearsal_notes: 'Anotação de ensaio', rehearsal_takes: 'Gravação', louvesync_attendance_sheets: 'Chamada', louvesync_change_requests: 'Solicitação' };
const fields = { title: 'Título', artist: 'Artista', key: 'Tom', vocal_keys: 'Tons por vocal', singer_member_id: 'Vocal principal', sequence: 'Tom / arranjo', song_id: 'Música', order_index: 'Ordem', confirmed: 'Participação', status: 'Status', proposal: 'Proposta', decided_by: 'Responsável pela decisão', decision_note: 'Observação', lyrics: 'Letra', note_text: 'Anotação', pin: 'PIN redefinido', is_admin: 'Permissão administrativa' };
const value = item => item == null ? '—' : typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item);
export default function AppAuditPanel({ credentials, eventId }) {
  const query = useChangeRequests(credentials, { eventId, audit: true });
  return <section className="app-audit-panel" aria-label="Histórico de alterações">
    <div className="request-panel-heading"><div><h3>Histórico de alterações</h3><p>Autor, horário e valores registrados pelo servidor.</p></div><button type="button" className="event-icon-button" aria-label="Atualizar histórico" onClick={query.refresh} disabled={query.loading}><Icon name="reset" size={18}/></button></div>
    {query.error && <p role="alert" className="request-error">{query.error}</p>}
    {query.loading && <p role="status" className="request-helper">Consultando histórico…</p>}
    {!query.loading && !query.error && !query.data?.entries.length && <p className="request-empty">As próximas alterações aparecerão aqui.</p>}
    <ol className="audit-timeline">{(query.data?.entries || []).map(entry => <li key={entry.id}><span className="audit-dot"><Icon name={entry.action === 'DELETE' ? 'trash' : entry.action === 'INSERT' ? 'plus' : 'edit'} size={13}/></span><div><strong>{entry.actor_name}</strong><p>{entry.action === 'INSERT' ? 'Criou' : entry.action === 'DELETE' ? 'Excluiu' : 'Alterou'} · {entities[entry.entity_type] || entry.entity_type}</p><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time><details><summary>Ver alteração</summary><small>Registro: {entry.entity_id}</small>{entry.request_id && <small>Solicitação: {entry.request_id}</small>}{entry.changed_fields.map(field => <div className="audit-values" key={field}><b>{fields[field] || field}</b>{field !== 'pin' && <><pre>Antes: {value(entry.before_record?.[field])}</pre><pre>Depois: {value(entry.after_record?.[field])}</pre></>}</div>)}</details></div></li>)}</ol>
    {query.data?.hasMore && <button type="button" className="event-button" onClick={query.loadMore} disabled={query.loading}>Carregar mais alterações</button>}
  </section>;
}
