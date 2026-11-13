import { forwardRef, useState } from 'react';
import { Dialog, Icon } from './Interface.jsx';
import '../navigation.css';

const fixedDestinations = [
  { id: 'home', label: 'Início' },
  { id: 'escala', label: 'Escala' },
  { id: 'mural', label: 'Mural', church: true },
  { id: 'biblia', label: 'Bíblia' },
];
const fixedIds = new Set(fixedDestinations.map(destination => destination.id));

const AppNavigation = forwardRef(function AppNavigation({ tabs, currentTab, onNavigate, dark, homeTheme = false }, ref) {
  const [moreOpen, setMoreOpen] = useState(false);
  const destinations = new Map(tabs.map(destination => [destination.id, destination]));
  const moreDestinations = tabs.filter(destination => !fixedIds.has(destination.id));
  const moreActive = moreDestinations.some(destination => destination.id === currentTab);
  const navigate = id => {
    setMoreOpen(false);
    onNavigate(id);
  };

  return <>
    <div className="app-nav">
      <nav ref={ref} className="gNav app-navigation" data-theme={dark ? 'dark' : 'light'} data-home-theme={homeTheme ? 'true' : 'false'} role="navigation" aria-label="Navegação principal">
        {fixedDestinations.map(destination => {
          const permitted = destinations.get(destination.id);
          const active = currentTab === destination.id;
          return <button key={destination.id} type="button" className={`nb app-navigation-item${active ? ' on' : ''}${destination.church ? ' app-navigation-church' : ''}`} aria-label={destination.label} aria-current={active ? 'page' : undefined} disabled={!permitted} onClick={() => navigate(destination.id)}>
            {destination.church ? <span className="app-navigation-emblem"><img src="/brand/church-emblem.png" alt="" width="38" height="38"/></span> : <><span className="ni" aria-hidden="true">{permitted?.ico || (destination.id === 'home' ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z"/></svg> : <Icon name={destination.id === 'escala' ? 'calendar' : 'book'} size={22}/>)}</span><span className="nl">{destination.label}</span><span className="ndot" aria-hidden="true"/></>}
          </button>;
        })}
        <button type="button" className={`nb app-navigation-item${moreActive ? ' on' : ''}`} aria-label="Mais" aria-current={moreActive ? 'page' : undefined} aria-haspopup="dialog" aria-expanded={moreOpen} disabled={!moreDestinations.length} onClick={() => setMoreOpen(true)}>
          <span className="ni" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></span><span className="nl">Mais</span><span className="ndot" aria-hidden="true"/>
        </button>
      </nav>
    </div>
    {moreOpen && <Dialog dark={dark} title="Mais" description="Acesse as outras áreas do ministério." icon="music" compact closeLabel="Fechar menu Mais" onClose={() => setMoreOpen(false)} footer={<button type="button" className="ui-button ui-button-wide" onClick={() => setMoreOpen(false)}>Fechar</button>}>
      <div className="app-more-menu">
        {moreDestinations.map(destination => <button key={destination.id} type="button" className={'ui-button app-more-destination app-more-'+destination.id} aria-current={currentTab === destination.id ? 'page' : undefined} onClick={() => navigate(destination.id)}><span aria-hidden="true">{destination.ico}</span><span>{destination.l}</span><span className="app-more-chevron" aria-hidden="true">›</span></button>)}
      </div>
    </Dialog>}
  </>;
});

export default AppNavigation;
