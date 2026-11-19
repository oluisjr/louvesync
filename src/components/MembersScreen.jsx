import { useState } from 'react';
import { Icon, SearchField } from './Interface.jsx';
import { accountActive, isChurchMember } from '../lib/member-settings.js';
import './ministry-pages.css';

const groups = [
  ['Todos', null],
  ['Voz', /vocal|voz|cantor|cantora|soprano|contralto|tenor/],
  ['Cordas', /violao|guitarra|baixo|cavaquinho|ukulele|violino/],
  ['Ritmo', /bateria|baterist|percuss|cajon|pandeiro/],
  ['Teclas', /teclad|piano|sintetiz|orgao/],
];
const normalize = value => (value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

export default function MembersScreen({ dark, members, events, profile, Avatar }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('Todos');
  const team = members.filter(member => !isChurchMember(member));
  const active = team.filter(accountActive).length;
  const query = normalize(search.trim());
  const pattern = groups.find(([name]) => name === group)[1];
  const filtered = team.filter(member => {
    const instrument = normalize(member.instrument);
    return (!pattern || pattern.test(instrument)) && normalize(`${member.name} ${instrument}`).includes(query);
  });

  return <div className="app-page ministry-page members-page" data-theme={dark ? 'dark' : 'light'}>
    <header className="ministry-heading"><h1>Membros</h1><p>Equipe de louvor</p></header>
    <div className="members-feature">
      <div><strong>{active}</strong><span>{active === 1 ? 'Integrante ativo' : 'Integrantes ativos'}</span></div>
      <img src="/images/louve-redesign/membros.webp" alt="" width="600" height="400"/>
    </div>
    <div className="members-tools">
      <SearchField label="Buscar por nome ou instrumento" placeholder="Nome ou instrumento" value={search} onChange={event => setSearch(event.target.value)}/>
      <div className="ministry-filters" role="group" aria-label="Filtrar por função">
        {groups.map(([name]) => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}
      </div>
    </div>
    {filtered.length ? <ul className="ministry-list" aria-label="Equipe de louvor">
      {filtered.map(member => {
        const leader = normalize(member.role).includes('lider');
        return <li className="ministry-row" key={member.id}>
          <Avatar m={member} size={42}/>
          <span className="ministry-row-copy"><strong>{member.name}</strong><small>{member.instrument || member.role}</small></span>
          <span className="member-labels">
            {leader && <span className="ministry-label" data-tone="gold">Líder</span>}
            {!leader && member.is_admin && <span className="ministry-label">Admin</span>}
            {member.status === 'licença' && <span className="ministry-label" data-tone="neutral">Em licença</span>}
          </span>
        </li>;
      })}
    </ul> : <p className="ministry-empty" role="status"><Icon name="users"/>Nenhum integrante encontrado.</p>}
    {profile?.is_admin && <details className="ministry-details">
      <summary>Estatísticas da equipe</summary>
      <dl>
        <div><dt>Ativos</dt><dd>{active}</dd></div>
        <div><dt>Funções cadastradas</dt><dd>{new Set(team.map(member => normalize(member.instrument)).filter(Boolean)).size}</dd></div>
        <div><dt>Eventos na escala</dt><dd>{events.length}</dd></div>
      </dl>
    </details>}
  </div>;
}
