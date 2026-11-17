import { useState } from 'react';
import { Icon } from './Interface.jsx';
import { ALL_VOCALS, isIndividualVocal, vocalName } from '../lib/event-vocals.js';
import { performanceKey } from '../lib/chords.js';
import '../event-vocals.css';

export default function EventVocalChoice({ event, song, members, editable, onSetSinger, onSetKey }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const singerId = event.singerBySong?.[song.id] || '';
  const choices = members.filter(member => event.members?.includes(member.id) && /vocal|voz/i.test(`${member.instrument || ''} ${member.role || ''}`));
  const save = async action => {
    setBusy(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure.message || 'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  };
  const key = performanceKey(song, event);
  const keys = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
  return <div className="event-vocal-choice">
    <div className="event-vocal-choice-row"><Icon name="mic" size={15}/><span>Vocal principal</span>{editable ? <select aria-label={'Vocal principal de ' + song.title} value={singerId} disabled={busy} onChange={e => { const value = e.target.value; void save(() => onSetSinger(event.id, song.id, value)); }}><option value="">Não definido</option><option value={ALL_VOCALS}>TODOS</option>{choices.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : <strong>{vocalName(singerId, members)}</strong>}</div>
    {singerId === ALL_VOCALS && <p className="event-vocal-collective">Todos cantam · sem vocal principal</p>}
    {onSetKey && <div className="event-vocal-choice-row event-vocal-key"><Icon name="music" size={15}/><span>Tom na escala</span>{editable ? <select aria-label={'Tom na escala de ' + song.title} value={key} disabled={busy} onChange={e => { const value = e.target.value; void save(() => onSetKey(song.id, value, isIndividualVocal(singerId), undefined, undefined, singerId, event.id)); }}>{[...new Set([...keys, ...keys.map(value => value + 'm'), key])].map(value => <option key={value}>{value}</option>)}</select> : <strong>{key}</strong>}</div>}
    {busy && <p role="status">Salvando…</p>}{error && <p className="request-error" role="alert">{error}</p>}
  </div>;
}
