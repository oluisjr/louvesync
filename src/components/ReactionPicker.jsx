import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../reaction-picker.css';

const reactionTypes = ['👍', '🙏', '🎵', '🔥'];

export default function ReactionPicker({ id, anchor, postTitle, dark, selected, pending, onSelect, onClose }) {
  const menu = useRef(null);
  const [position, setPosition] = useState(null);
  const placed = position !== null;

  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) { onClose(); return; }
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 12;
      const right = left + (viewport?.width || window.innerWidth) - 24;
      const top = Math.max((viewport?.offsetTop || 0) + 8, (document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0) + 8);
      const bottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 8, (document.querySelector('.app-nav')?.getBoundingClientRect().top || window.innerHeight) - 8);
      const button = anchor.getBoundingClientRect();
      const popup = menu.current.getBoundingClientRect();
      const above = button.top - popup.height - 8;
      setPosition({ left: Math.max(left, Math.min(right - popup.width, button.left + button.width / 2 - popup.width / 2)), top: Math.max(top, Math.min(bottom - popup.height, above >= top ? above : button.bottom + 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    if (!placed) return;
    const first = menu.current.querySelector('[aria-checked="true"]:not(:disabled)') || menu.current.querySelector('button:not(:disabled)');
    first?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const outside = event => { if (!menu.current?.contains(event.target) && !anchor.contains(event.target)) onClose(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); onClose(true); } };
    const scroll = event => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) onClose(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('scroll', scroll);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('scroll', scroll);
    };
  }, [anchor, onClose]);

  const handleKeys = event => {
    const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const siblings = [...anchor.closest('.community-social-actions').querySelectorAll('button')];
      const next = siblings[siblings.indexOf(anchor) + (event.shiftKey ? -1 : 1)] || anchor;
      onClose();
      next.focus({ preventScroll: true });
    }
  };

  return createPortal(<div ref={menu} id={id} role="menu" aria-label={'Reações de ' + postTitle} aria-orientation="horizontal" className="community-reaction-picker" data-theme={dark ? 'dark' : 'light'} style={position || { visibility: 'hidden' }} onKeyDown={handleKeys}>
    {reactionTypes.map((emoji, index) => <button type="button" role="menuitemcheckbox" key={emoji} tabIndex={index === 0 ? 0 : -1} aria-label={`Reagir com ${emoji} ao aviso ${postTitle}`} aria-checked={selected.includes(emoji)} disabled={pending.includes(emoji)} onClick={() => { onSelect(emoji); onClose(true); }}><span aria-hidden="true">{emoji}</span></button>)}
  </div>, document.body);
}
