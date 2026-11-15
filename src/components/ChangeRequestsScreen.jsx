import { useState } from 'react';
import { canManageMinistry } from '../lib/change-requests.js';
import ChangeRequestsPanel from './ChangeRequestsPanel.jsx';
import AppAuditPanel from './AppAuditPanel.jsx';
import '../event-details.css';

export default function ChangeRequestsScreen({ dark, profile, credentials, songs, events, onChangeSaved }) {
  const [tab, setTab] = useState('requests'), leader = canManageMinistry(profile);
  return <section className="changes-page" data-theme={dark ? 'dark' : 'light'}>
    <header className="changes-heading"><div><span className="event-eyebrow">Organização do ministério</span><h2>{leader ? 'Solicitações e histórico' : 'Minhas solicitações'}</h2><p>{leader ? 'Revise propostas e acompanhe as alterações no app.' : 'Acompanhe suas propostas de músicas e tons.'}</p></div><img src="/images/events/worship-stage.png" alt="" width="130" height="130"/></header>
    {leader && <div className="event-tabs" role="group" aria-label="Solicitações e histórico"><button type="button" aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>Solicitações</button><button type="button" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>Histórico do app</button></div>}
    {tab === 'audit' && leader ? <AppAuditPanel credentials={credentials}/> : <ChangeRequestsPanel credentials={credentials} profile={profile} songs={songs} events={events} onSaved={onChangeSaved}/>}
  </section>;
}
