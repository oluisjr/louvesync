import { useCallback } from 'react';

// Reserve the menu's actual height once, even when fonts or button sizes change.
export function useNavigationClearance() {
  return useCallback(node => {
    if (!node) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--app-nav-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener('resize', measure);
    // React 19 runs this cleanup when the menu hides or its ref changes.
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--app-nav-height');
    };
  }, []);
}
