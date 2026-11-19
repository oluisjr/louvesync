import { useState } from 'react';
import { Icon } from './Interface.jsx';
import { checkConnection } from '../lib/connectivity.js';
import { acknowledge } from '../lib/offline-store.js';
import '../offline.css';

const titles = {
  confirm: 'Resposta à escala', create_event: 'Evento e equipe', save_song: 'Música',
  create_post: 'Comunicado', create_comment: 'Comentário', toggle_reaction: 'Reação',
  toggle_save: 'Aviso salvo', attendance: 'Chamada de presença', changes: 'Solicitação ou decisão',
  setlist: 'Definição do setlist', save_member: 'Cadastro e acesso', delete_member: 'Exclusão de cadastro',
  community: 'Pedido de oração ou acompanhamento', maestro: 'Pedido ao Maestro', audio: 'Gravação de ensaio',
  equipment: 'Equipamento', delete_content: 'Exclusão de conteúdo',
};

export default function OfflineStatus({ state, refreshError, onRefresh, actionError, onDismissError }) {
  const [checking, setChecking] = useState(false);
  const offline = !state.online;
  const preparing = state.ready === false || state.preparing;
  const results = state.results || [];
  const hasSyncStatus = offline || state.syncing || state.pending > 0 || !!refreshError || preparing;
  if (!hasSyncStatus && !actionError && !results.length) return null;

  const retry = async () => {
    setChecking(true);
    try {
      if (await checkConnection()) {
        state.retry();
        // Going back online already triggers the automatic read.
        if (!offline) onRefresh?.();
      }
    } finally { setChecking(false); }
  };
  const pendingText = state.pending === 1 ? '1 alteração pendente' : `${state.pending} alterações pendentes`;
  let heading = 'Preparando uso offline';
  let description = 'Baixando os arquivos e dados para usar neste aparelho.';
  if (offline) {
    heading = 'Sem conexão';
    description = 'Mostrando dados salvos.';
  } else if (state.syncing) {
    heading = 'Sincronizando…';
    description = 'Enviando as alterações salvas neste aparelho.';
  } else if (state.pending) {
    heading = pendingText;
    description = state.error || 'Salvo neste aparelho. Aguardando sincronização.';
  } else if (refreshError) {
    heading = 'Atualização indisponível';
    description = refreshError;
  }

  return <aside className="offline-status" aria-label="Sincronização offline">
    {hasSyncStatus && <div className="offline-status-line">
      <span className="offline-status-icon"><Icon name={offline ? 'wifi-off' : 'reset'} size={18}/></span>
      <div className="offline-status-copy" role="status"><strong>{heading}</strong><small>{description}</small></div>
      <button type="button" className="offline-retry" disabled={checking || state.syncing} onClick={retry}>{checking ? 'Verificando…' : 'Tentar novamente'}</button>
    </div>}
    {actionError && <div className="offline-action-error" role="alert">
      <Icon name="info" size={16}/><span>{actionError}</span>
      <button type="button" aria-label="Fechar aviso" onClick={onDismissError}><Icon name="close" size={16}/></button>
    </div>}
    {state.pending > 0 && <details>
      <summary>Ver alterações guardadas ({state.pending})</summary>
      <ul>{state.jobs.map(job => <li key={job.id}>
        <div className="offline-status-copy"><strong>{titles[job.type] || 'Alteração no app'}</strong><small>{job.error || 'Aguardando envio por esta conta'}</small></div>
        <button type="button" disabled={state.syncing} onClick={() => {
          if (window.confirm('Descartar apenas esta alteração pendente neste aparelho?')) acknowledge(job.id);
        }}>Descartar</button>
      </li>)}</ul>
    </details>}
    {results.length > 0 && <details>
      <summary>Ver resultados prontos ({results.length})</summary>
      {results.map(result => <div key={result.id} className="offline-result">
        <strong>{result.title}</strong><p>{result.text}</p>
        <button type="button" onClick={() => navigator.clipboard.writeText(result.text)}>Copiar texto</button>
        <button type="button" onClick={() => state.dismissResult(result.id)}>Fechar resultado</button>
      </div>)}
    </details>}
  </aside>;
}
