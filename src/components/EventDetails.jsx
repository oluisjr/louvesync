import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Interface.jsx';
import { MentionText } from './MentionInput.jsx';
import { CategoryBadge, ResponseBadge } from './ScheduleLabels.jsx';
import { ViewersButton } from './Activity.jsx';
import SetlistConfirmation, { SetlistBadge } from './SetlistConfirmation.jsx';
import ChangeRequestDialog from './ChangeRequestDialog.jsx';
import ChangeRequestsPanel from './ChangeRequestsPanel.jsx';
import AppAuditPanel from './AppAuditPanel.jsx';
import EventVocalChoice from './EventVocalChoice.jsx';
import EventInstrumentChoices from './EventInstrumentChoices.jsx';
import { isIndividualVocal } from '../lib/event-vocals.js';
import { useVisibleView } from '../hooks/useActivity.js';
import { useChangeRequests } from '../hooks/useChangeRequests.js';
import { canManageMinistry, canRequestOwnKey } from '../lib/change-requests.js';
import { canSeeScreen } from '../lib/member-settings.js';
import { performanceKey } from '../lib/chords.js';
import { downloadSetlistExcel, setlistWhatsAppText } from '../lib/setlist-export.js';
import { copyTextToClipboard } from '../lib/clipboard.js';
import '../event-details.css';

const keys = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

function SongAdjustment({ song, event, activeKey, onSave, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault(); const values = new FormData(e.currentTarget); setBusy(true); setError('');
    try { await onSave(song.id, values.get('key'), isIndividualVocal(event.singerBySong?.[song.id]), values.get('bpm'), values.get('time'), event.singerBySong?.[song.id], event.id); onClose(); }
    catch (failure) { setError(failure.message || 'Não foi possível salvar o ajuste.'); setBusy(false); }
  };
  return <form className="event-song-adjustment" onSubmit={submit} data-update-blocking="true">
    <label>Tom na escala<select name="key" id={'adj-key-' + song.id} defaultValue={activeKey}>{[...new Set([...keys, ...keys.map(key => key + 'm'), activeKey].filter(Boolean))].map(key => <option key={key}>{key}</option>)}</select></label>
    <div><label>BPM<input type="number" name="bpm" id={'adj-bpm-' + song.id} min="20" max="300" defaultValue={song.bpm || 80}/></label><label>Compasso<select name="time" id={'adj-ts-' + song.id} defaultValue={song.time_signature || '4/4'}>{['2/4', '3/4', '4/4', '6/8', '9/8', '12/8'].map(time => <option key={time}>{time}</option>)}</select></label></div>
    {error && <p className="request-error" role="alert">{error}</p>}
    <button className="event-button event-primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar Ajustes'}</button>
  </form>;
}

export default function EventDetails({ ev, dark, songs, members, profile, categories, onClose, onSelectSong, onConfirm, onEditEv, onReqDelEv, onSetInstrument, onSetSinger, onUpdateSongOptions, activity, setlistOnline, setlistSavingId, onSetlistConfirmation, onRecordAttendance, onChangeSaved }) {
  const titleId = useId(), panel = useRef(null);
  const [tab, setTab] = useState('setlist'), [menu, setMenu] = useState(null), [adjust, setAdjust] = useState(null), [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [shareText, setShareText] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState('');
  const query = useChangeRequests(activity.credentials, { eventId: ev.id, pending: true });
  const leader = canManageMinistry(profile), team = members.filter(member => ev.members?.includes(member.id));
  const isMine = ev.members?.includes(profile.id), myConfirmation = ev.confirmations?.[profile.id];
  const items = (ev.items?.length ? ev.items : (ev.songs || []).map(song_id => ({ id: song_id, type: 'song', song_id }))).map(item => ({ ...item, song: songs.find(song => song.id === item.song_id) })).filter(item => item.type !== 'song' || item.song);
  const date = new Date(ev.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const pending = query.data?.requests.filter(request => request.status === 'pending') || [];
  useVisibleView(() => activity.recordView('event', ev.id), ev.id, { immediate: true, enabled: true, allowInertRoot: true });
  useEffect(() => {
    const root = document.getElementById('root'), previous = document.activeElement, inert = root?.inert;
    if (root) root.inert = true;
    panel.current?.focus({ preventScroll: true });
    return () => { if (root) root.inert = inert; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const keyDown = e => {
    if (e.key === 'Escape' && !busy && !draft) { e.stopPropagation(); if (menu) setMenu(null); else if (adjust) setAdjust(null); else onClose(); }
    if (e.key !== 'Tab') return;
    const buttons = [...panel.current.querySelectorAll('button:not(:disabled),input,select:not(:disabled),textarea,summary,[tabindex="0"]')].filter(item => item.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  const share = async type => {
    setBusy(true); setError(''); setStatus('');
    try {
      if (type === 'excel') { await downloadSetlistExcel(ev, songs, members); }
      else {
        const text = setlistWhatsAppText(ev, songs, members), result = await copyTextToClipboard(text);
        if (!result) setShareText(text);
        setStatus(result ? 'Setlist copiado com as categorias e os vocais do evento.' : 'Selecione e copie o texto abaixo.');
      }
    } catch (failure) { setError(failure.message || 'Não foi possível compartilhar. Tente novamente.'); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="event-details-layer" data-theme={dark ? 'dark' : 'light'}>
    <div className="event-details-scrim" onClick={() => { if (!busy && !draft && !adjust) onClose(); }} aria-hidden="true"/>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="gL2 event-details" data-update-blocking={busy || !!draft || !!adjust || !!shareText} onKeyDown={keyDown}>
      <div className="event-handle" aria-hidden="true"/>
      <header className="event-hero"><div className="event-hero-copy"><span className="event-eyebrow">Escala do ministério</span><h2 id={titleId}>{ev.label}</h2><p className="event-date"><Icon name="calendar" size={15}/>{date} · {String(ev.time || '').slice(0, 5)}</p>{ev.theme && <p className="event-theme"><Icon name="book" size={14}/>{ev.theme}</p>}<SetlistBadge event={ev} songs={songs}/></div><img className="event-stage-art" src="/images/events/stage-3d.webp" alt="" width="190" height="190"/><button className="event-icon-button event-close" type="button" aria-label="Fechar detalhes do evento" onClick={onClose} disabled={busy}><Icon name="close" size={20}/></button></header>
      <div className="event-content">
        <div className="event-toolbar"><button type="button" aria-expanded={menu === 'share'} className="event-button" onClick={() => setMenu(menu === 'share' ? null : 'share')}><Icon name="share" size={17}/>Compartilhar</button><button type="button" aria-pressed={tab === 'team'} className="event-button" onClick={() => { setTab(tab === 'team' ? 'setlist' : 'team'); setMenu(null); }}><Icon name="users" size={17}/>Equipe <span>{team.length}</span></button><button type="button" className="event-icon-button" aria-label="Mais ações do evento" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><span aria-hidden="true">•••</span></button></div>
        {menu === 'share' && <div className="event-action-menu"><button type="button" onClick={() => share('whatsapp')} disabled={busy}>Copiar setlist para WhatsApp</button><button type="button" onClick={() => share('excel')} disabled={busy || !ev.songs?.length}>{busy ? 'Preparando planilha…' : '📥 Exportar para Excel'}</button></div>}
        {menu === 'more' && <div className="event-action-menu">{profile.is_admin && <><button type="button" onClick={() => onEditEv(ev)}><Icon name="edit" size={16}/>Editar</button><button type="button" className="event-danger" onClick={() => onReqDelEv(ev)}><Icon name="trash" size={16}/>Excluir</button></>}{leader && <><button type="button" disabled={!canSeeScreen(profile,'presencas')} onClick={() => onRecordAttendance(ev)}><Icon name="check" size={16}/>Registrar presença</button><ViewersButton activity={activity} targetType="event" targetId={ev.id} title={ev.label} context={`${date} · ${ev.time}`} members={members} audience={ev.members} dark={dark}/></>}{!leader && <p>A liderança gerencia este evento.</p>}</div>}
        {status && <p className="request-helper" role="status">{status}</p>}{error && <p role="alert" className="request-error">{error}</p>}{shareText && <div className="event-share-text"><label>Texto para compartilhar<textarea readOnly aria-label="Setlist para WhatsApp" value={shareText} rows={6} onFocus={e => e.target.select()}/></label><button type="button" className="event-button" onClick={() => setShareText('')}>Fechar texto</button></div>}
        {ev.notes&&<section className="event-team-note" aria-label="Mensagem para a equipe"><strong>Mensagem para a equipe</strong><p><MentionText text={ev.notes} mentionIds={ev.mention_member_ids} members={members}/></p></section>}
        {isMine && <div className="event-rsvp" data-response={myConfirmation===true?'yes':myConfirmation===false?'no':'pending'}><span>Sua participação<ResponseBadge value={myConfirmation} label={myConfirmation===true?'Confirmada':myConfirmation===false?'Recusada':'Ainda não respondida'}/></span><button type="button" aria-pressed={myConfirmation === true} onClick={() => onConfirm(ev.id, true)}><Icon name="check" size={15}/>Confirmar</button><button type="button" aria-pressed={myConfirmation === false} onClick={() => onConfirm(ev.id, false)}>Recusar</button></div>}
        {leader && <SetlistConfirmation event={ev} songs={songs} members={members} online={setlistOnline} savingId={setlistSavingId} onConfirm={onSetlistConfirmation} showBadge={false}/>}
        <div className="event-tabs" role="group" aria-label="Detalhes do evento"><button type="button" aria-pressed={tab === 'setlist'} onClick={() => setTab('setlist')}>Setlist <span>{ev.songs?.length || 0}</span></button><button type="button" aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>{leader ? 'Solicitações' : 'Meus pedidos'}{pending.length > 0 && <span className="event-count">{pending.length}</span>}</button>{leader && <button type="button" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>Histórico</button>}</div>
        {tab === 'setlist' && <>
          <div className="event-section-heading"><h3>Repertório do evento</h3><span>{ev.songs?.length || 0} músicas</span></div>
          {!leader && <p className="event-permission-note"><Icon name="info" size={16}/>Você pode propor músicas e solicitar o tom das músicas em que canta. A liderança aprova as alterações.</p>}
          {query.error && <p className="request-error" role="alert">Não foi possível consultar seus pedidos. <button type="button" onClick={query.refresh}>Tentar novamente</button></p>}
          {!items.length && <div className="request-empty"><Icon name="music" size={26}/><strong>Sem músicas definidas</strong></div>}
          {items.map((item, index) => {
            if (item.type !== 'song') return <p key={item.id || index} className="event-note"><Icon name="note" size={16}/>{item.text}</p>;
            const song = item.song, key = performanceKey(song, ev), ownKey = canRequestOwnKey(profile, ev, song.id);
            const request = pending.find(request => request.source_song_id === song.id && request.actor_id === profile.id), category = categories[song.cat] || { label: song.cat || 'Sem categoria', color: '#7B3FF2' };
            return <article key={item.id || song.id} className="event-setlist-song event-song-card" style={{ '--song-category': category.color }}>
              <div className="event-song-heading"><span className="event-song-number">{String((ev.songs || []).indexOf(song.id) + 1).padStart(2, '0')}</span><button type="button" className="event-setlist-song-open" disabled={!canSeeScreen(profile,'repertorio')} aria-label={'Abrir cifra de ' + song.title} onClick={() => onSelectSong(song, ev, key)}><strong>{song.title || 'Sem título'}</strong><span className="event-setlist-meta"><CategoryBadge category={song.cat} label={category.label}/><span aria-hidden="true">·</span><span>{song.artist || 'Ministério'}</span></span></button><span className="event-song-key" aria-label={'Tom vigente ' + key}>{key || '—'}</span></div>
              <EventVocalChoice event={ev} song={song} members={members} editable={leader} onSetSinger={onSetSinger}/>
              {request && <p className="event-pending-note"><Icon name="timer" size={15}/>{request.kind === 'key' ? `Pedido de tom ${key} → ${request.proposal.key}` : 'Pedido de troca de música'} · aguardando aprovação</p>}
              <div className="event-song-actions">{leader ? <button type="button" onClick={() => setAdjust(adjust === song.id ? null : song.id)}><Icon name="settings" size={15}/>Ajustar</button> : <><button type="button" disabled={pending.some(r => r.source_song_id === song.id && r.actor_id === profile.id && r.kind === 'song')} onClick={() => setDraft({ kind: 'song', song, event: ev })}><Icon name="music" size={15}/>Sugerir música</button>{ownKey ? <button type="button" disabled={pending.some(r => r.source_song_id === song.id && r.actor_id === profile.id && r.kind === 'key')} onClick={() => setDraft({ kind: 'key', song, event: ev })}><Icon name="edit" size={15}/>Solicitar tom</button> : <span className="event-key-lock"><Icon name="lock" size={13}/>Tom do vocal escalado</span>}</>}</div>
              {adjust === song.id && <SongAdjustment song={song} event={ev} activeKey={key} onSave={onUpdateSongOptions} onClose={() => setAdjust(null)}/>}
            </article>;
          })}
        </>}
        {tab === 'requests' && <ChangeRequestsPanel credentials={activity.credentials} profile={profile} eventId={ev.id} events={[ev]} songs={songs} onSaved={onChangeSaved}/>}
        {tab === 'audit' && leader && <AppAuditPanel credentials={activity.credentials} eventId={ev.id}/>}
        {tab === 'team' && <section className="event-team"><div className="event-section-heading"><h3>Equipe ({team.length})</h3></div><EventInstrumentChoices event={ev} members={members} editable={leader} onChange={onSetInstrument}/><div className="event-team-summary" aria-label="Resumo das respostas">{[[true,'confirmado','confirmados'],[false,'recusou','recusaram'],[null,'pendente','pendentes']].map(([value,singular,plural])=>{const count=team.filter(person=>(ev.confirmations?.[person.id]??null)===value).length;return <ResponseBadge key={plural} value={value} label={count+' '+(count===1?singular:plural)}/>;})}</div>{team.map(member => <div className="event-person" data-rsvp={ev.confirmations?.[member.id]===true?'yes':ev.confirmations?.[member.id]===false?'no':'pending'} key={member.id}><span style={{ background: member.color || '#7B3FF2' }}>{member.avatar || member.name?.slice(0, 2)}</span><div><strong>{member.name}</strong><p>{member.instrument || member.role}</p></div><ResponseBadge value={ev.confirmations?.[member.id]}/></div>)}</section>}
      </div>
    </section>
    {draft && <ChangeRequestDialog key={draft.song.id + draft.kind} dark={dark} draft={draft} songs={songs} credentials={activity.credentials} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); setStatus('Solicitação enviada para a liderança. O setlist vigente foi mantido.'); void query.refresh(); }}/ >}
  </div>, document.body);
}
