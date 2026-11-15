import { useEffect, useRef } from 'react';
import '../interactive-artwork.css';

export default function InteractiveArtwork({ src, alt, label, width, height, className = '', eager = false }) {
  const button = useRef(null);
  const drag = useRef(null);
  const frame = useRef(0);
  const timer = useRef(null);
  const target = useRef({x:0,y:0});
  const moved = useRef(false);
  const paint = () => {
    frame.current = 0;
    const element = button.current;
    if (!element) return;
    element.style.setProperty('--art-rx',`${-target.current.y * 16}deg`);
    element.style.setProperty('--art-ry',`${target.current.x * 18}deg`);
    element.style.setProperty('--art-dx',`${target.current.x * 6}px`);
    element.style.setProperty('--art-dy',`${target.current.y * 4}px`);
  };
  const reset = () => {
    const element = button.current, previous = drag.current;
    drag.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    clearTimeout(timer.current);
    target.current = {x:0,y:0};
    if (element) element.dataset.dragging = 'false';
    paint();
    if (previous && element?.hasPointerCapture(previous.id)) element.releasePointerCapture(previous.id);
  };
  useEffect(() => {
    const element = button.current;
    const clear = () => {
      const previous = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      clearTimeout(timer.current);
      target.current = {x:0,y:0};
      moved.current = false;
      if (element) {
        element.dataset.dragging = 'false';
        for (const property of ['--art-rx','--art-ry','--art-dx','--art-dy']) element.style.removeProperty(property);
        if (previous && element.hasPointerCapture(previous.id)) element.releasePointerCapture(previous.id);
      }
    };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener('blur',clear);
    document.addEventListener('visibilitychange',visibility);
    return () => { clear();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility); };
  }, []);
  const clamp = value => Math.max(-1,Math.min(1,value));
  return <button ref={button} type="button" className={`interactive-artwork ${className}`} aria-label={label} aria-description="Pressione e arraste para inclinar. As setas do teclado também movem a ilustração." aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" onPointerDown={event => {
    if (drag.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clearTimeout(timer.current);moved.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = {id:event.pointerId,x:event.clientX,y:event.clientY,width:bounds.width,height:bounds.height};
    event.currentTarget.dataset.dragging = 'true';event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX-active.x, dy = event.clientY-active.y;
    if (Math.hypot(dx,dy)>5) moved.current = true;
    target.current = {x:clamp(dx/Math.max(1,active.width/2)),y:clamp(dy/Math.max(1,active.height/2))};
    if (!frame.current) frame.current=requestAnimationFrame(paint);
  }} onPointerUp={event => { if (drag.current?.id===event.pointerId) reset(); }} onPointerCancel={reset} onLostPointerCapture={() => { if (drag.current) reset(); }} onBlur={reset} onClick={event => {
    event.stopPropagation();
    if (moved.current) { moved.current=false;return; }
    target.current = {x:.4,y:-.2};paint();timer.current=setTimeout(reset,200);
  }} onKeyDown={event => {
    const next={ArrowLeft:{x:-.75,y:0},ArrowRight:{x:.75,y:0},ArrowUp:{x:0,y:-.75},ArrowDown:{x:0,y:.75}}[event.key];
    if (!next || drag.current) return;
    event.preventDefault();clearTimeout(timer.current);target.current=next;event.currentTarget.dataset.dragging='true';paint();
  }} onKeyUp={event => { if (event.key.startsWith('Arrow') && !drag.current) timer.current=setTimeout(reset,120); }}>
    <img src={src} alt={alt} width={width} height={height} draggable="false" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async"/>
  </button>;
}
