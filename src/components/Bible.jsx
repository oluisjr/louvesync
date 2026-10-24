import { useEffect, useRef, useState } from 'react';
import { readCache, writeCache } from '../lib/domain.js';

export default function Bible({ dark, books, plans }) {
  const saved = readCache('ls_bible_position', { book: 'john', chapter: 1 });
  const [book, setBook] = useState(saved.book);
  const [chapter, setChapter] = useState(saved.chapter);
  const [verse, setVerse] = useState(null);
  const [verses, setVerses] = useState([]);
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const [read, setRead] = useState(() => readCache('ls_bible_plans', {}));
  const [fontSize, setFontSize] = useState(18);
  const [showPlans, setShowPlans] = useState(false);
  const reading = useRef(null);
  const selected = books.find(item => item.a === book) || books[0];
  useEffect(() => {
    const abort = new AbortController();
    const key = `ls_bible_${book}_${chapter}`;
    const cached = readCache(key, null);
    setStatus(cached ? 'cached' : 'loading');
    setVerses(cached || []);
    writeCache('ls_bible_position', { book, chapter });
    fetch(`https://bible-api.com/${encodeURIComponent(book)}+${chapter}?translation=almeida`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Capítulo indisponível'); return response.json(); })
      .then(data => {
        if (abort.signal.aborted) return;
        if (!data.verses?.length) throw new Error('Capítulo indisponível');
        const rows = data.verses.map(item => ({ number: item.verse, text: item.text.trim() }));
        setVerses(rows); writeCache(key, rows); setStatus('ready');
      }).catch(error => { if (error.name !== 'AbortError') setStatus(cached ? 'cached' : 'error'); });
    return () => abort.abort();
  }, [book, chapter, retry]);
  useEffect(() => {
    if (verse && verses.length) reading.current?.querySelector(`[data-verse="${verse}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [verse, verses]);
  const changeChapter = delta => { setChapter(value => Math.max(1, Math.min(selected.c, value + delta))); setVerse(null); reading.current?.scrollIntoView({ block: 'start' }); };
  return <div className="bible-screen" style={{ color: dark ? '#E2E8F0' : '#0F172A', padding: 16, paddingBottom: 100 }}>
    <h2>Bíblia Sagrada</h2>
    <div className="gL1 reading-controls">
      <label>Livro<select className="fi" aria-label="Livro da Bíblia" value={book} onChange={event => { setBook(event.target.value); setChapter(1); setVerse(null); }}>{books.map(item => <option key={item.a} value={item.a}>{item.n}</option>)}</select></label>
      <label>Capítulo<select className="fi" aria-label="Capítulo" value={chapter} onChange={event => { setChapter(Number(event.target.value)); setVerse(null); }}>{Array.from({ length: selected.c }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
      <div className="reading-actions"><button className="bSec" disabled={chapter <= 1} onClick={() => changeChapter(-1)}>← Anterior</button><button className="bSec" disabled={chapter >= selected.c} onClick={() => changeChapter(1)}>Próximo →</button></div>
      <div className="reading-actions"><button className="bSec" aria-label="Diminuir fonte" onClick={() => setFontSize(size => Math.max(14, size - 2))}>A−</button><button className="bSec" aria-label="Aumentar fonte" onClick={() => setFontSize(size => Math.min(30, size + 2))}>A+</button><button className="bSec" onClick={() => setShowPlans(value => !value)}>Planos de leitura</button></div>
    </div>
    {showPlans && <div className="gL1 reading-controls">{plans.map(plan => <section key={plan.id}><h3>{plan.icon} {plan.title}</h3>{plan.verses.map((item, index) => <div className="reading-actions" key={index}><button className="bSec" onClick={() => { setBook(item.b); setChapter(item.c); setVerse(Number(item.v)); setShowPlans(false); }}>{books.find(b => b.a === item.b)?.n} {item.c}:{item.v}</button><label><input type="checkbox" checked={(read[plan.id] || []).includes(index)} onChange={() => setRead(previous => { const items = previous[plan.id] || []; const next = { ...previous, [plan.id]: items.includes(index) ? items.filter(i => i !== index) : [...items, index] }; writeCache('ls_bible_plans', next); return next; })} /> Lido</label></div>)}</section>)}</div>}
    <article ref={reading} className="gL1 bible-reading" aria-busy={status === 'loading'}>
      <h3>{selected.n} {chapter}</h3>
      {status === 'loading' && <p role="status">Carregando capítulo…</p>}
      {status === 'cached' && <p role="status">Leitura disponível offline.</p>}
      {status === 'error' && <div role="alert"><p>Não foi possível carregar este capítulo.</p><button className="bSec" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
      {verses.map(item => <p key={item.number} data-verse={item.number} style={{ fontSize, lineHeight: 1.85, marginBottom: 14, borderRadius: 8, background: verse === item.number ? 'rgba(123,63,242,.14)' : undefined }}><sup style={{ color: '#9B6BF8', marginRight: 8, fontSize: 12 }}>{item.number}</sup>{item.text}</p>)}
    </article>
  </div>;
}
