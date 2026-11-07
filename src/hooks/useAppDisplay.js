import { useLayoutEffect } from 'react';

// Keep the document canvas (including iOS safe areas) in the same theme as React.
export function useAppDisplay(dark) {
  useLayoutEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0414' : '#F5F0FF');
    try { localStorage.setItem('ls_theme', theme); } catch { /* Storage can be unavailable in private browsing. */ }
  }, [dark]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame;
    const update = () => {
      // Pinch zoom must remain under the browser's control.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height || window.innerHeight;
      if (height <= 0) return;
      root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
      root.style.setProperty('--app-viewport-top', `${Math.round(viewport?.offsetTop || 0)}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('visibilitychange', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      document.removeEventListener('visibilitychange', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, []);
}
