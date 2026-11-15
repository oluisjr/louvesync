import { useId, useRef, useState } from 'react';
import { Dialog, Icon } from './Interface.jsx';
import { changeKinds, changesRequest } from '../lib/change-requests.js';
import { publicSupabaseConfig } from '../lib/supabase.js';
import { performanceKey } from '../lib/chords.js';
import '../event-details.css';

const keys = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

export default function ChangeRequestDialog({ dark, draft, songs, credentials, onClose, onSaved }) {
  const formId = useId(), requestId = useRef(crypto.randomUUID());
  const [value, setValue] = useState(draft.proposal?.key || '');
  const [replacement, setReplacement] = useState(''), [search, setSearch] = useState('');
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const currentKey = draft.event ? performanceKey(draft.song, draft.event) : draft.song.key;
  const choices = songs.filter(song => !draft.event?.songs?.includes(song.id) && `${song.title} ${song.artist}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await changesRequest(credentials, { action: 'request', requestId: requestId.current, kind: draft.kind, songId: draft.song.id, ...(draft.event ? { eventId: draft.event.id } : {}), reason, proposal: draft.kind === 'key' ? { key: value } : draft.kind === 'song' ? { songId: replacement } : draft.proposal }, { connection: publicSupabaseConfig });
      window.dispatchEvent(new Event('louvesync:changes'));
      // A committed request stays successful even if the following data refresh fails.
      void Promise.resolve(onSaved(result.request)).catch(() => {});
    } catch (failure) { setError(failure.message); setBusy(false); }
  };
  return <Dialog dark={dark} title={changeKinds[draft.kind]} description={draft.event ? `${draft.event.label} · ${draft.song.title}` : draft.song.title || 'Catálogo do ministério'} icon="edit" eyebrow="Solicitação à liderança" closeLabel="Fechar solicitação" className="change-request-layer" busy={busy} onClose={onClose} footer={<>
    {error && <p className="ui-message ui-error" role="alert">{error}</p>}
    <div className="ui-dialog-buttons"><button className="ui-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="ui-button ui-button-primary" type="submit" form={formId} disabled={busy || !reason.trim() || (draft.kind === 'key' && (!value || value === currentKey)) || (draft.kind === 'song' && !replacement)}><Icon name="check" size={16}/>{busy ? 'Enviando…' : 'Enviar solicitação'}</button></div>
  </>}>
    <form id={formId} className="ui-form" onSubmit={submit}>
      <p className="request-notice"><Icon name="info" size={18}/>O setlist e o catálogo vigentes só mudam quando a liderança aprova.</p>
      {draft.kind === 'key' && <><p className="ui-helper">Tom atual neste evento: <strong>{currentKey || 'Original'}</strong>. O pedido se aplica apenas à sua participação neste evento.</p><label className="ui-field">Novo tom<select aria-label="Novo tom" required value={value} onChange={event => setValue(event.target.value)}><option value="">Escolha o tom</option>{[...new Set([...keys, ...keys.map(key => key + 'm'), currentKey].filter(Boolean))].map(key => <option key={key} value={key}>{key}</option>)}</select></label></>}
      {draft.kind === 'song' && <><label className="ui-field">Buscar música<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Título ou artista"/></label><label className="ui-field">Música sugerida<select aria-label="Música sugerida" required value={replacement} onChange={event => setReplacement(event.target.value)}><option value="">Escolha uma música do repertório</option>{choices.map(song => <option key={song.id} value={song.id}>{song.title} · {song.artist || 'Ministério'}</option>)}</select></label>{!choices.length && <p className="ui-helper">Nenhuma música disponível com essa busca.</p>}</>}
      {['song_create', 'song_edit'].includes(draft.kind) && <div className="request-proposal"><strong>{draft.proposal.title}</strong><p>{draft.proposal.artist || 'Ministério'} · {draft.proposal.bpm || '—'} BPM · {draft.proposal.time_signature || '4/4'}</p><p>Letra, links e demais dados editados serão enviados para revisão.</p></div>}
      <label className="ui-field">Motivo<textarea aria-label="Motivo" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder={draft.kind === 'key' ? 'Ex.: esse tom fica melhor na minha extensão vocal.' : 'Explique a alteração para a liderança.'}/><small>{reason.length}/500</small></label>
    </form>
  </Dialog>;
}
