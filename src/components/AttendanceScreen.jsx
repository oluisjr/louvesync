import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import InteractiveArtwork from './InteractiveArtwork.jsx';
import { attendanceByMember, attendanceCounts, attendanceCsv, attendanceStatuses, validAttendanceDate } from '../lib/attendance.js';
import { attendanceRequest } from '../lib/attendance-client.js';
import { localDate } from '../lib/domain.js';
import { publicSupabaseConfig } from '../lib/supabase.js';
import { broadcastUpdate, onRealtime } from '../lib/realtime.js';
import '../attendance.css';

const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const request = (credentials, payload, options) => attendanceRequest(credentials, payload, { ...options, connection: publicSupabaseConfig });
const entriesOf = sheet => sheet.roster.map(person => ({ memberId: person.memberId, status: person.status, note: person.note }));
const monthStart = () => localDate().slice(0, 8) + '01';

function AttendanceEvent({ eventId, credentials, online, onBack, onDirtyChange, onLeave }) {
  const [data, setData] = useState(null), [entries, setEntries] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [retry, setRetry] = useState(0), [savedMessage, setSavedMessage] = useState('');
  const [search, setSearch] = useState('');
  const lock = useRef(false);
  const sheet = data?.sheet;
  const dirty = !!sheet && !!entries && JSON.stringify(entries) !== JSON.stringify(entriesOf(sheet));
  const counts = attendanceCounts(entries || []);
  useEffect(() => { onDirtyChange(dirty, saving); return () => onDirtyChange(false, false); }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    const leave = event => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty, saving]);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError('');
      try {
        const result = await request(credentials, { action: 'get', eventId }, { signal: controller.signal });
        if (!disposed) { setData(result); setEntries(entriesOf(result.sheet)); setSavedMessage(''); }
      } catch (failure) { if (!disposed) setError(failure.message); }
      finally { if (!disposed) setLoading(false); }
    };
    void load();
    return () => { disposed = true; controller.abort(); };
  }, [credentials, eventId, retry]);
  const change = (id, patch) => { setEntries(previous => previous.map(person => person.memberId === id ? { ...person, ...patch } : person)); setSavedMessage(''); };
  const save = async finalize => {
    if (lock.current || !online || !data?.canRecord || loading) return;
    if (finalize && counts.pending) { setError('Marque todos os integrantes antes de concluir a chamada.'); return; }
    if (entries.some(person => person.status === 'excused' && !person.note.trim())) { setError('Informe o motivo de cada falta justificada.'); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      const result = await request(credentials, { action: 'save', eventId, version: sheet.version, finalize, entries });
      setData(result); setEntries(entriesOf(result.sheet)); setSavedMessage(finalize ? 'Chamada concluída e salva para a liderança.' : 'Rascunho salvo. Quem não foi marcado continua pendente.');
      void broadcastUpdate({ type: 'attendance_changed', eventId }).catch(() => {});
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setSaving(false); }
  };
  const refresh = () => onLeave(() => setRetry(value => value + 1));
  const records = sheet?.roster.map(person => ({ ...person, ...entries?.find(entry => entry.memberId === person.memberId) })) || [];
  const visible = records.filter(person => (person.name + ' ' + person.instrument).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const disabled = saving || loading || !online || !data?.canRecord;
  const errorBlock = error && <div role="alert" className="attendance-message attendance-error"><p>{error}</p><button type="button" onClick={refresh} disabled={saving}>Atualizar chamada</button></div>;
  return <div className="attendance-record" data-update-blocking={dirty || saving}>
    <button className="attendance-back" type="button" disabled={saving} onClick={() => onLeave(onBack)}><Icon name="left" size={16}/>Eventos e frequência</button>
    {loading && <p role="status" className="attendance-message">Carregando chamada…</p>}
    {(!sheet || !records.length) && errorBlock}
    {sheet && !loading && <>
      <header className="attendance-event-heading"><div><span className="attendance-eyebrow">{dateLabel(sheet.date)} · {sheet.time?.slice(0, 5)}</span><h2>{sheet.label}</h2><span className="attendance-state" data-complete={sheet.finalized && !dirty}>{dirty ? 'Alterações não salvas' : sheet.finalized ? 'Chamada concluída' : sheet.version ? 'Chamada parcial' : 'Chamada não registrada'}</span></div><InteractiveArtwork src="/images/more/members.webp" alt="Equipe do ministério" label="Mover ilustração da equipe" width="120" height="104" className="attendance-event-art"/></header>
      <section className="attendance-record-summary" aria-label="Resumo da chamada"><div><strong>{counts.present}<small> / {counts.total}</small></strong><span>presentes de {counts.total} escalados</span></div><div className="attendance-counts"><span data-kind="absent">{counts.absent} {counts.absent === 1 ? 'ausente' : 'ausentes'}</span><span data-kind="excused">{counts.excused} {counts.excused === 1 ? 'justificada' : 'justificadas'}</span><span>{counts.pending} {counts.pending === 1 ? 'não marcado' : 'não marcados'}</span></div><div className="attendance-progress" aria-hidden="true"><span style={{ width: `${counts.rate || 0}%` }}/></div></section>
      {!data.canRecord && <p className="attendance-message">A chamada fica disponível no dia do evento.</p>}
      {!online && <p className="attendance-message" role="status">Sem conexão. Suas marcações continuam nesta tela; conecte-se para salvar.</p>}
      <p className="attendance-help">Marque quem compareceu. A resposta antecipada à escala não preenche a chamada.</p>
      {sheet.version > 0 && <p className="attendance-help">Equipe preservada no primeiro registro. {sheet.recordedBy?.name && `Último registro por ${sheet.recordedBy.name}${sheet.updatedAt ? ' em ' + new Date(sheet.updatedAt).toLocaleString('pt-BR') : ''}.`}</p>}
      <div className="attendance-roster-tools"><label className="attendance-search"><Icon name="search" size={17}/><input type="search" aria-label="Buscar integrante na chamada" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar integrante…"/></label>{!!records.length && <button type="button" disabled={disabled} onClick={() => { setEntries(previous => previous.map(person => ({ ...person, status: 'present' }))); setSavedMessage(''); }}>Todos presentes</button>}</div>
      <div className="attendance-roster" role="list" aria-label="Integrantes escalados">{visible.map(person => <article className="attendance-person" role="listitem" aria-label={person.name} key={person.memberId} data-status={person.status || 'pending'}>
        <div className="attendance-person-heading"><span className="attendance-avatar" aria-hidden="true">{person.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span><div><h3>{person.name}</h3><p>{person.instrument || 'Integrante'}</p></div><span className="attendance-person-state">{attendanceStatuses[person.status] || 'Não marcado'}</span></div>
        <div className="attendance-choices" role="group" aria-label={`Presença de ${person.name}`}>{Object.entries(attendanceStatuses).map(([status, label]) => <button type="button" key={status} data-kind={status} disabled={disabled} aria-label={`Marcar ${person.name} como ${label.toLowerCase()}`} aria-pressed={person.status === status} onClick={() => change(person.memberId, { status: person.status === status ? null : status })}><Icon name={status === 'present' ? 'check' : status === 'absent' ? 'close' : 'note'} size={14}/>{status === 'excused' ? 'Justificada' : label}</button>)}</div>
        <details className="attendance-person-note" open={person.status === 'excused' || !!person.note}><summary>{person.status === 'excused' ? 'Motivo da falta justificada' : 'Observação'}</summary><label><span className="ui-sr-only">Observação de {person.name}</span><textarea aria-label={`Observação de ${person.name}`} value={person.note} onChange={event => change(person.memberId, { note: event.target.value })} maxLength={500} rows={2} disabled={disabled} placeholder={person.status === 'excused' ? 'Informe o motivo comunicado à liderança…' : 'Algo que a liderança precisa lembrar…'}/></label></details>
      </article>)}</div>
      {!records.length && <p className="attendance-message">Este evento ainda não tem integrantes escalados.</p>}
      {!!records.length && !visible.length && <p className="attendance-message">Nenhum integrante encontrado. As demais marcações continuam preservadas.</p>}
      {!!records.length && <footer className="attendance-savebar">{errorBlock}{savedMessage && <p role="status">{savedMessage}</p>}<p>{counts.pending ? `${counts.pending} integrante${counts.pending === 1 ? '' : 's'} ainda sem marcação.` : 'Todos os integrantes foram marcados.'}</p><div>{!sheet.finalized && <button type="button" disabled={disabled} onClick={() => save(false)}><Icon name="save" size={16}/>Salvar rascunho</button>}<button type="button" className="attendance-primary" disabled={disabled || counts.pending > 0} onClick={() => save(true)}><Icon name="check" size={16}/>{saving ? 'Salvando…' : sheet.finalized ? 'Salvar correção' : 'Concluir chamada'}</button></div></footer>}
    </>}
  </div>;
}

export default function AttendanceScreen({ dark, credentials, events, online, initialEventId, onDirtyChange, onLeave }) {
  const [selected, setSelected] = useState(initialEventId || null), [view, setView] = useState('events');
  const [from, setFrom] = useState(monthStart), [to, setTo] = useState(localDate);
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [search, setSearch] = useState('');
  const rangeValid = validAttendanceDate(from) && validAttendanceDate(to) && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const scope = useMemo(() => ({ from, to, credentials }), [from, to, credentials]);
  useEffect(() => {
    if (selected || !rangeValid) return;
    const controller = new AbortController(); let disposed = false;
    const load = async () => {
      setLoading(true); setError('');
      try { const data = await request(credentials, { action: 'list', from, to }, { signal: controller.signal }); if (!disposed) setResult({ scope, data }); }
      catch (failure) { if (!disposed) setError(failure.message); }
      finally { if (!disposed) setLoading(false); }
    };
    void load();
    const off = onRealtime(message => { if (message.type === 'attendance_changed') void load(); });
    return () => { disposed = true; controller.abort(); off(); };
  }, [credentials, from, to, selected, rangeValid, retry, scope]);
  const sheets = result?.scope === scope ? result.data.sheets : [];
  const today = result?.scope === scope ? result.data.today : localDate();
  const completed = sheets.filter(sheet => sheet.finalized), people = attendanceByMember(sheets);
  const summary = attendanceCounts(completed.flatMap(sheet => sheet.roster));
  const byId = new Map(events.filter(event => validAttendanceDate(event.date) && event.date >= from && event.date <= to).map(event => [event.id, event]));
  for (const sheet of sheets) byId.set(sheet.eventId, { ...byId.get(sheet.eventId), id: sheet.eventId, date: sheet.date, time: sheet.time, label: sheet.label, sheet });
  const choices = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([attendanceCsv(sheets)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `presencas_${from}_${to}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="app-page attendance-page" data-theme={dark ? 'dark' : 'light'} aria-label="Presenças do ministério">
    <header className="attendance-heading"><div><span className="attendance-eyebrow">Acompanhamento da equipe</span><h1>Presenças</h1></div><span className="attendance-leader-tag"><Icon name="users" size={14}/>Liderança</span></header>
    {selected ? <AttendanceEvent key={selected} eventId={selected} credentials={credentials} online={online} onBack={() => setSelected(null)} onDirtyChange={onDirtyChange} onLeave={onLeave}/> : <>
      <section className="attendance-overview" aria-label="Frequência no período"><div><span className="attendance-eyebrow">Presença registrada</span><strong>{summary.rate === null ? '—' : summary.rate + '%'}</strong><p>{completed.length} chamada{completed.length === 1 ? '' : 's'} concluída{completed.length === 1 ? '' : 's'} · {summary.present} {summary.present === 1 ? 'presença' : 'presenças'}</p><small>Somente chamadas concluídas entram na frequência.</small></div><InteractiveArtwork src="/images/more/members.webp" alt="Equipe do ministério" label="Mover ilustração de presenças" width="150" height="130"/></section>
      <div className="attendance-range"><label>De<input type="date" aria-label="Presenças a partir de" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Até<input type="date" aria-label="Presenças até" value={to} onChange={event => setTo(event.target.value)}/></label><button type="button" onClick={() => setRetry(value => value + 1)} aria-label="Atualizar presenças"><Icon name="reset" size={17}/></button></div>
      {!rangeValid && <p className="attendance-message" role="alert">Selecione um período válido de até um ano.</p>}
      {error && <p className="attendance-message attendance-error" role="alert">{error}</p>}
      {loading && <p className="attendance-help" role="status">Atualizando presenças…</p>}
      <div className="attendance-tabs" role="group" aria-label="Consultar presenças"><button type="button" aria-pressed={view === 'events'} onClick={() => setView('events')}>Eventos</button><button type="button" aria-pressed={view === 'people'} onClick={() => setView('people')}>Por integrante</button>{!!completed.length && <button type="button" className="attendance-export" onClick={exportCsv}><Icon name="down" size={14}/>CSV</button>}</div>
      {view === 'events' ? <div className="attendance-events" aria-label="Chamadas dos eventos">{rangeValid && choices.map(event => { const counts = event.sheet ? attendanceCounts(event.sheet.roster) : null; return <button type="button" className="attendance-event-choice" key={event.id} disabled={event.date > today} onClick={() => setSelected(event.id)}><span className="attendance-date-tile"><strong>{event.date.slice(8)}</strong><small>{new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></span><span className="attendance-choice-copy"><strong>{event.label}</strong><span>{event.time?.slice(0, 5)} · {event.sheet ? `${counts.present} presentes de ${counts.total} escalados` : `${new Set(event.members || []).size} escalados`}</span><small data-complete={event.sheet?.finalized}>{event.date > today ? 'Disponível no dia do evento' : event.sheet?.finalized ? 'Chamada concluída' : event.sheet ? `Parcial · ${counts.pending} {counts.pending === 1 ? 'não marcado' : 'não marcados'}` : 'Chamada não registrada'}</small></span><Icon name="right" size={17}/></button>; })}{rangeValid && !choices.length && !loading && <p className="attendance-message">Nenhum evento neste período.</p>}</div> : <section className="attendance-people" aria-label="Frequência por integrante"><label className="attendance-search"><Icon name="search" size={17}/><input type="search" aria-label="Buscar integrante na frequência" placeholder="Buscar integrante…" value={search} onChange={event => setSearch(event.target.value)}/></label><p className="attendance-help">Presenças ÷ participações em chamadas concluídas. As faltas justificadas aparecem separadamente.</p>{people.filter(person => person.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(person => <article className="attendance-frequency" key={person.memberId}><div><h2>{person.name}</h2><p>{person.instrument}</p><span>{person.present} presenças · {person.absent} ausências · {person.excused} justificadas</span><small>{person.total} {person.total === 1 ? 'participação' : 'participações'} registrada{person.total === 1 ? '' : 's'}</small></div><strong>{person.rate}%</strong></article>)}{!people.length && <p className="attendance-message">Conclua uma chamada para acompanhar a frequência dos integrantes.</p>}</section>}
    </>}
  </section>;
}
