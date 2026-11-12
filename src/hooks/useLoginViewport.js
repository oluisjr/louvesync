import { useLayoutEffect, useRef } from 'react';

// Reflow to the login's actual available height. The shared app frame already
// follows visualViewport during text entry; scroll only this login container.
export function useLoginViewport(pinStep) {
  const viewportRef = useRef(null), controlsRef = useRef(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame;
    const update = () => {
      viewport.dataset.compact = viewport.getBoundingClientRect().height <= 560 ? 'true' : 'false';
      if (!pinStep || !controlsRef.current?.contains(document.activeElement)) return;
      const bounds = viewport.getBoundingClientRect();
      const style = getComputedStyle(viewport);
      const top = bounds.top + Math.max(12, parseFloat(style.paddingTop) || 0);
      const bottom = bounds.bottom - Math.max(12, parseFloat(style.paddingBottom) || 0);
      const controls = controlsRef.current.getBoundingClientRect();
      const target = controls.height <= bottom - top ? controls : document.activeElement.getBoundingClientRect();
      if (target.bottom > bottom) viewport.scrollTop += target.bottom - bottom;
      else if (target.top < top) viewport.scrollTop -= top - target.top;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(viewport);
    if (controlsRef.current) observer?.observe(controlsRef.current);
    viewport.addEventListener('focusin', schedule);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      viewport.removeEventListener('focusin', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [pinStep]);
  return { viewportRef, controlsRef };
}
