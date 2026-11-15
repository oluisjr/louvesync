import { useState } from 'react';
import { Icon } from './Interface.jsx';
import { isSetlistConfirmed, setlistSnapshot } from '../lib/setlist-confirmation.js';
import '../setlist-confirmation.css';

export function SetlistBadge({ event, songs }) {
  const confirmed = isSetlistConfirmed(event, songs);
  return <span className="setlist-badge" data-confirmed={confirmed}><Icon name={confirmed ? 'check' : 'timer'} size={12}/>{confirmed ? 'Setlist definido' : 'Setlist não confirmado'}</span>;
}

export default function SetlistConfirmation({ event, songs, members, online, savingId, onConfirm, showBadge = true }) {
  const [error, setError] = useState('');
  const confirmed = isSetlistConfirmed(event, songs), snapshot = setlistSnapshot(event, songs);
  const author = members?.find(member => member.id === event.setlist_confirmation?.confirmed_by);
  const pending = savingId === event.id;
  const save = async () => {
    setError('');
    try {
      const result = await onConfirm(event.id, snapshot, !confirmed);
      if (!result?.ok) setError(result?.error || 'Não foi possível salvar a confirmação. Tente novamente.');
    } catch (failure) { setError(failure.message || 'Não foi possível salvar a confirmação.'); }
  };
  return <section className="setlist-approval" aria-label="Definição do setlist" data-update-blocking={pending}>
    {showBadge && <SetlistBadge event={event} songs={songs}/>}
    <p>{confirmed ? `Confirmado${author ? ' por ' + author.name : ''}. A equipe já pode usar este repertório.` : event.setlist_confirmation ? 'Alterado após a confirmação. Revise e confirme novamente.' : 'Seleção provisória. Confirme quando este repertório estiver definido.'}</p>
    {!snapshot && <p>Adicione músicas antes de confirmar.</p>}
    {!online && <p>Conecte-se para salvar a confirmação para toda a equipe.</p>}
    <button type="button" className={confirmed ? 'setlist-unconfirm' : 'setlist-confirm'} disabled={!!savingId || !online || (!confirmed && !snapshot)} onClick={save}><Icon name={confirmed ? 'edit' : 'check'} size={15}/>{pending ? 'Salvando…' : confirmed ? 'Retirar confirmação' : 'Confirmar setlist'}</button>
    {error && <p className="setlist-approval-error" role="alert">{error}</p>}
  </section>;
}
