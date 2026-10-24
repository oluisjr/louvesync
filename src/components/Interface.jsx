import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Icon({ name, size = 20, ...props }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h2"/></>,
    music: <><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m3 10v-2a6 6 0 0 0-3-5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>, up: <path d="m6 14 6-6 6 6"/>, down: <path d="m6 10 6 6 6-6"/>,
    left: <path d="m14 6-6 6 6 6"/>, right: <path d="m10 6 6 6-6 6"/>,
    sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/></>,
    book: <><path d="M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1V4Z"/></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/></>,
    timer: <><circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M9 2h6m-3 0v4m6-1 2 2"/></>,
    play: <path d="m8 4 12 8-12 8V4Z"/>, pause: <><path d="M8 5v14m8-14v14"/></>,
    reset: <><path d="M3 11a9 9 0 1 1 2.5 8M3 4v7h7"/></>,
    note: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h4"/></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 5v9m5-9v9m5-9v9M6 14v5m6-5v5m6-5v5"/></>,
    guitar: <><path d="m14 4 6 6m-3-9 6 6m-7-1-6 6m-2-2c-3-1-5 1-4 3-4 1-3 6 0 8s7 2 8-2c3 1 5-2 3-5l-1-1 5-5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name] || paths.music}</svg>;
}

export function PageHeading({ icon, eyebrow, title, description, action }) {
  return <header className="ui-page-heading"><span className="ui-heading-icon"><Icon name={icon} size={23}/></span><div className="ui-heading-copy">{eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>;
}

export function Section({ icon, title, description, action, children, className = '' }) {
  return <section className={`ui-card ${className}`}><div className="ui-section-heading"><div className="ui-section-copy"><h3>{icon && <Icon name={icon} size={18}/>}<span>{title}</span></h3>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function SearchField({ label, value, onChange, placeholder }) {
  return <label className="ui-search"><Icon name="search" size={18}/><input type="search" aria-label={label} value={value} onChange={onChange} placeholder={placeholder}/></label>;
}

export function Dialog({ dark, title, description, icon = 'calendar', onClose, footer, tabs, children, contentKey, busy = false }) {
  const titleId = useId();
  const panel = useRef(null);
  const [viewport, setViewport] = useState(null);
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById('root');
    const inert = root?.inert;
    if (root) root.inert = true;
    panel.current?.focus({ preventScroll: true });
    const resize = () => {
      const visual = window.visualViewport;
      if (!visual || visual.scale !== 1) return;
      setViewport({ height: Math.round(visual.height), top: Math.round(visual.offsetTop) });
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.visualViewport?.removeEventListener('resize', resize);
      if (root) root.inert = inert;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const keyDown = event => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const items = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(item => item.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="ui-scope ui-dialog-layer" data-theme={dark ? 'dark' : 'light'} style={viewport ? { '--dialog-viewport-height': `${viewport.height}px`, '--dialog-viewport-top': `${viewport.top}px` } : undefined}>
    <div className="ui-dialog-scrim" aria-hidden="true"/>
    <section ref={panel} className="ui-dialog" role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby={titleId} tabIndex={-1} onKeyDown={keyDown} data-update-blocking="true">
      <header className="ui-dialog-header"><span className="ui-heading-icon"><Icon name={icon} size={22}/></span><div className="ui-heading-copy"><span className="ui-eyebrow">Sua equipe em harmonia</span><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="ui-icon-button" onClick={onClose} disabled={busy} aria-label="Fechar editor de evento"><Icon name="close"/></button></header>
      {tabs}
      <div className="ui-dialog-content" key={contentKey}>{children}</div>
      <footer className="ui-dialog-footer">{footer}</footer>
    </section>
  </div>, document.body);
}
