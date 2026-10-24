import { useEffect, useRef, useState } from 'react';
import { readCache, writeCache } from '../lib/domain.js';
import { Icon, PageHeading, Section } from './Interface.jsx';

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

  return <div className="ui-scope ui-page bible-screen" data-theme={dark?'dark':'light'}>
    <PageHeading icon="book" eyebrow="Um tempo na Palavra" title="Bíblia Sagrada" description="Leia com calma. Continue de onde parou."/>
    <section className="ui-card">
      <div className="ui-fields" style={{gridTemplateColumns:'minmax(0,2fr) minmax(0,1fr)'}}>
        <label className="ui-field">Livro<select aria-label="Livro da Bíblia" value={book} onChange={event=>{setBook(event.target.value);setChapter(1);setVerse(null);}}>{books.map(item=><option key={item.a} value={item.a}>{item.n}</option>)}</select></label>
        <label className="ui-field">Capítulo<select aria-label="Capítulo" value={chapter} onChange={event=>{setChapter(Number(event.target.value));setVerse(null);}}>{Array.from({length:selected.c},(_,index)=><option key={index} value={index+1}>{index+1}</option>)}</select></label>
      </div>
      <div className="ui-bible-tools">
        <div className="ui-font-controls" role="group" aria-label="Tamanho do texto"><button className="ui-icon-button" aria-label="Diminuir fonte" disabled={fontSize<=14} onClick={()=>setFontSize(size=>Math.max(14,size-2))}>A−</button><button className="ui-icon-button" aria-label="Aumentar fonte" disabled={fontSize>=30} onClick={()=>setFontSize(size=>Math.min(30,size+2))}>A+</button></div>
        <button className="ui-button ui-button-soft ui-button-small" aria-expanded={showPlans} aria-controls="bible-plans" onClick={()=>setShowPlans(value=>!value)}><Icon name="note" size={15}/>Planos de leitura<Icon name={showPlans?'up':'down'} size={13}/></button>
      </div>
    </section>
    {showPlans&&<div id="bible-plans">{plans.map(plan=><Section key={plan.id} icon="book" title={plan.title} description={(read[plan.id]||[]).length+' de '+plan.verses.length+' leituras concluídas'}>
      <div className="ui-plan-list">{plan.verses.map((item,index)=><div className="ui-plan-passage" key={index}>
        <button className="ui-button ui-button-soft" onClick={()=>{setBook(item.b);setChapter(item.c);setVerse(Number(item.v));setShowPlans(false);}}>{books.find(b=>b.a===item.b)?.n} {item.c}:{item.v}<Icon name="right" size={14}/></button>
        <label><input type="checkbox" aria-label={'Marcar '+(books.find(b=>b.a===item.b)?.n)+' '+item.c+':'+item.v+' como lido'} checked={(read[plan.id]||[]).includes(index)} onChange={()=>setRead(previous=>{const items=previous[plan.id]||[];const next={...previous,[plan.id]:items.includes(index)?items.filter(i=>i!==index):[...items,index]};writeCache('ls_bible_plans',next);return next;})}/>Lido</label>
      </div>)}</div>
    </Section>)}</div>}
    <article ref={reading} className="ui-card ui-bible-reading" aria-busy={status==='loading'}>
      <div className="ui-reading-heading"><div><span className="ui-eyebrow">Almeida · Palavra viva</span><h3>{selected.n} {chapter}</h3></div><span className="ui-reading-decoration" aria-hidden="true"><Icon name="book" size={28}/></span></div>
      {status==='loading'&&<p className="ui-helper" role="status">Carregando capítulo…</p>}
      {status==='cached'&&<p className="ui-message" role="status"><Icon name="check" size={16}/>Leitura disponível offline.</p>}
      {status==='error'&&<div className="ui-message ui-error" role="alert"><div><p>Não foi possível carregar este capítulo.</p><button className="ui-button" style={{marginTop:10}} onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div></div>}
      {verses.map(item=><p key={item.number} className="ui-bible-verse" data-verse={item.number} style={{fontSize,background:verse===item.number?'var(--ui-accent-soft)':undefined}}><sup>{item.number}</sup>{item.text}</p>)}
      <nav className="ui-chapter-navigation" aria-label="Navegar entre capítulos"><button className="ui-button" disabled={chapter<=1} onClick={()=>changeChapter(-1)}><Icon name="left" size={16}/>Anterior</button><button className="ui-button ui-button-soft" disabled={chapter>=selected.c} onClick={()=>changeChapter(1)}>Próximo capítulo<Icon name="right" size={16}/></button></nav>
    </article>
  </div>;
}
