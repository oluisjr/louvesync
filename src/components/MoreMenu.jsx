import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Icon } from './Interface.jsx';
import MoreCardArtwork from './MoreCardArtwork.jsx';

const primaryIds = ['repertorio', 'treinamento', 'ensaio', 'patrimonio', 'membros', 'admin'];
const fixedIds = new Set(['home', 'escala', 'mural', 'biblia']);

export default function MoreMenu({ tabs, currentTab, onNavigate, onClose, dark }) {
  const titleId = useId();
  const heading = useRef(null);
  const destinations = new Map(tabs.map(destination => [destination.id, destination]));
  const primary = primaryIds.map(id => destinations.get(id)).filter(Boolean);
  const secondary = tabs.filter(destination => !fixedIds.has(destination.id) && !primaryIds.includes(destination.id));

  useLayoutEffect(() => {
    const page = heading.current.closest('.app-more-page');
    const previousFocus = document.activeElement;
    heading.current.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected && (document.activeElement === document.body || page.contains(document.activeElement))) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const close = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return <section id="app-more-page" className="app-more-page" data-theme={dark ? 'dark' : 'light'} aria-labelledby={titleId}>
    <header className="app-more-heading">
      <div><h2 ref={heading} id={titleId} tabIndex={-1}>Mais</h2><p>Tudo para o seu ministério</p></div>
      <button type="button" className="app-more-close" aria-label="Fechar" title="Fechar menu Mais" onClick={onClose}><Icon name="close" size={20}/></button>
    </header>
    <div className="app-more-menu">
      {primary.map(destination => <button key={destination.id} type="button" className={`app-more-destination app-more-${destination.id}`} aria-current={currentTab === destination.id ? 'page' : undefined} onClick={() => onNavigate(destination.id)}>
        <MoreCardArtwork destination={destination.id}/>
        <span className="app-more-label">{destination.l}</span>
      </button>)}
    </div>
    {!!secondary.length && <div className="app-more-secondary" aria-label="Outros recursos">
      {secondary.map(destination => <button key={destination.id} type="button" aria-current={currentTab === destination.id ? 'page' : undefined} onClick={() => onNavigate(destination.id)}>
        <span className="app-more-secondary-icon" aria-hidden="true">{destination.ico}</span>
        <span>{destination.l}</span><span className="app-more-chevron" aria-hidden="true">›</span>
      </button>)}
    </div>}
  </section>;
}
