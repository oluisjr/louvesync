import { useLayoutEffect } from 'react';

// Keep the document canvas (including iOS safe areas) in the same theme as React.
export function useAppDisplay(dark) {
  useLayoutEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0414' : '#F5F0FF');
    document.getElementById('app-favicon')?.setAttribute('href', dark ? '/brand/v1/favicon-dark.png' : '/brand/v1/favicon-light.png');
    try { localStorage.setItem('ls_theme', theme); } catch { /* Storage can be unavailable in private browsing. */ }
  }, [dark]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const installed = window.matchMedia('(display-mode: standalone)');
    // Measure CSS layout units independently of the keyboard-sized app frame.
    const layout = document.createElement('div');
    layout.className = 'app-viewport-size';
    layout.setAttribute('aria-hidden', 'true');
    document.body.append(layout);
    let frame;
    const update = () => {
      root.dataset.displayMode = navigator.standalone === true || installed.matches ? 'standalone' : 'browser';
      // Pinch zoom must remain under the browser's control.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = layout.getBoundingClientRect().height;
      const target = document.activeElement;
      const editing = target?.isContentEditable || (!target?.readOnly && !target?.disabled && (
        target?.tagName === 'TEXTAREA' || (target?.tagName === 'INPUT' && ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(target.type))
      ));
      // iOS standalone may report a shorter visual viewport with no keyboard.
      // Only a substantial contraction during text entry should shrink the app.
      if (viewport?.height > 0 && editing && height - viewport.height > Math.max(120, height * 0.15)) {
        root.style.setProperty('--app-keyboard-height', `${Math.round(viewport.height)}px`);
        root.style.setProperty('--app-keyboard-top', `${Math.round(viewport.offsetTop || 0)}px`);
      } else {
        root.style.removeProperty('--app-keyboard-height');
        root.style.removeProperty('--app-keyboard-top');
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(layout);
    installed.addEventListener('change', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('louvesync:resume', schedule);
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      installed.removeEventListener('change', schedule);
      layout.remove();
      root.style.removeProperty('--app-keyboard-height');
      root.style.removeProperty('--app-keyboard-top');
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      window.removeEventListener('louvesync:resume', schedule);
      document.removeEventListener('visibilitychange', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, []);
}
