import { useEffect, useState } from 'react';
import { checkForAppUpdate, getAppUpdateStatus } from '../lib/app-updates.js';

export default function UpdateNotice() {
  const [state, setState] = useState(() => getAppUpdateStatus().state);
  useEffect(() => {
    const status = event => setState(event.detail.state);
    window.addEventListener('louvesync:update-status', status);
    return () => window.removeEventListener('louvesync:update-status', status);
  }, []);
  const text = {
    deferred: 'Atualização pronta. Será aplicada ao concluir sua edição ou gravação.',
    updating: 'Atualizando o LouveSync…',
    retry: 'Aguardando a nova versão ficar disponível. A atualização será automática.',
    unavailable: 'Não foi possível verificar a atualização. Sua versão offline foi preservada.',
    current: 'Você já está na versão mais recente.',
  }[state];
  if (!text) return null;
  return <div role="status" className="update-notice">{text}{state === 'unavailable' && <button onClick={checkForAppUpdate}>Tentar novamente</button>}</div>;
}
