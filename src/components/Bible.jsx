import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readCache, writeCache } from '../lib/domain.js';
import { Icon, Section } from './Interface.jsx';
import InteractiveArtwork from './InteractiveArtwork.jsx';
import { BibleBookmark, BibleChapterPicker, BibleCollection, BibleVerseActions } from './BibleDialogs.jsx';
import { fetchBibleChapter, normalizeBiblePosition, normalizeBibleVerses } from '../lib/bible-client.js';
import { BIBLE_EDITION, bibleCacheKey } from '../lib/bible-edition.js';
import { bibleVerseKey } from '../lib/bible-library.js';
import { adjacentBibleChapter } from '../lib/bible-navigation.js';
import { useBibleLibrary } from '../hooks/useBibleLibrary.js';
import '../bible.css';

const emptyVerses=[];

export default function Bible({ dark, books, plans, profileId }) {
  const [position,setPosition]=useState(()=>normalizeBiblePosition(readCache('ls_bible_position',{book:'john',chapter:1}),books));
  const {book,chapter}=position;
  const [verse,setVerse]=useState(null);
  const [data,setData]=useState({key:null,rows:[],status:'loading'});
  const [retry,setRetry]=useState(0);
  const [read,setRead]=useState(()=>readCache('ls_bible_plans',{}));
  const [fontSize,setFontSize]=useState(18);
  const [showPlans,setShowPlans]=useState(false);
  const [showLibrary,setShowLibrary]=useState(false);
  const [showPicker,setShowPicker]=useState(false);
  const [actionVerse,setActionVerse]=useState(null);
  const [jump,setJump]=useState(0);
  const reading=useRef(null);
  const scrolled=useRef(0);
  const library=useBibleLibrary(profileId);
  const markers=useMemo(()=>new Map(library.items.map(item=>[bibleVerseKey(item),item])),[library.items]);
  const selected=books.find(item=>item.a===book) || books[0];
  const valid=data.key===bibleCacheKey(book,chapter);
  const verses=valid?data.rows:emptyVerses;
  const status=valid?data.status:'loading';
  const previous=adjacentBibleChapter(books,book,chapter,-1),next=adjacentBibleChapter(books,book,chapter,1);
  const dock=useCallback(node=>{
    if(!node)return;
    const main=node.closest('[data-main-scroll]');
    const measure=()=>main?.style.setProperty('--bible-dock-height',`${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(node);
    return ()=>{observer?.disconnect();main?.style.removeProperty('--bible-dock-height');};
  },[]);
  useEffect(()=>{
    const abort=new AbortController(),key=bibleCacheKey(book,chapter);
    let cached=null;
    try{cached=normalizeBibleVerses(readCache(key,null));}catch{/* Ignore invalid cached chapters. */}
    setData({key,rows:cached || [],status:cached?'cached':'loading'});
    writeCache('ls_bible_position',{book,chapter});
    fetchBibleChapter(book,chapter,{signal:abort.signal}).then(rows=>{
      if(abort.signal.aborted)return;
      writeCache(key,rows);setData({key,rows,status:'ready'});
    }).catch(error=>{if(!abort.signal.aborted && error.name!=='AbortError')setData({key,rows:cached || [],status:cached?'cached':'error'});});
    return ()=>abort.abort();
  },[book,chapter,retry]);
  useEffect(()=>{
    if(!jump || scrolled.current===jump || (verse&&!verses.length))return;
    const node=verse?reading.current?.querySelector(`[data-verse="${verse}"]`):reading.current;
    if(!node)return;
    const frame=requestAnimationFrame(()=>{node.scrollIntoView({block:verse?'center':'start'});(verse?node.querySelector('button'):reading.current?.querySelector('h3'))?.focus({preventScroll:true});scrolled.current=jump;});
    return ()=>cancelAnimationFrame(frame);
  },[jump,verse,verses]);
  const openPassage=target=>{
    setPosition({book:target.book,chapter:target.chapter});setVerse(target.verse || null);setJump(value=>value+1);
    setShowLibrary(false);setShowPicker(false);setShowPlans(false);setActionVerse(null);
  };
  const marker=actionVerse?markers.get(bibleVerseKey(actionVerse)):null;

  return <div className="ui-scope ui-page bible-screen" data-theme={dark?'dark':'light'}>
    <header className="bible-heading"><div><h1>Bíblia Sagrada</h1><p>Um tempo na Palavra</p></div><button type="button" className="bible-library-button" onClick={()=>setShowLibrary(true)}><BibleBookmark/><span>Seus versículos</span><b>{library.items.filter(item=>item.saved).length}</b></button></header>
    <section className="bible-hero" aria-label="Seu tempo na Palavra"><div><span className="ui-eyebrow">Continue a leitura</span><h2>Leia com calma.<br/>Leve para a vida.</h2><p>Seu encontro diário com a Palavra.</p></div><InteractiveArtwork className="bible-hero-art" src="/images/bible/reading.webp" label="Mover ilustração da Bíblia" alt="Bíblia aberta com marcador lilás, cruz dourada e suporte de madeira" width="484" height="528" eager/></section>
    <section className="ui-card bible-controls" aria-label="Controles da leitura"><div className="ui-fields bible-picker-fields"><label className="ui-field">Livro<select aria-label="Livro da Bíblia" value={book} onChange={event=>openPassage({book:event.target.value,chapter:1})}>{books.map(item=><option key={item.a} value={item.a}>{item.n}</option>)}</select></label><label className="ui-field">Capítulo<select aria-label="Capítulo" value={chapter} onChange={event=>openPassage({book,chapter:Number(event.target.value)})}>{Array.from({length:selected.c},(_,index)=><option key={index} value={index+1}>{index+1}</option>)}</select></label></div>
      <div className="ui-bible-tools"><div className="ui-font-controls" role="group" aria-label="Tamanho do texto"><button type="button" className="ui-icon-button" aria-label="Diminuir fonte" disabled={fontSize<=14} onClick={()=>setFontSize(size=>Math.max(14,size-2))}>A−</button><button type="button" className="ui-icon-button" aria-label="Aumentar fonte" disabled={fontSize>=30} onClick={()=>setFontSize(size=>Math.min(30,size+2))}>A+</button></div><button type="button" className="ui-button ui-button-soft ui-button-small" aria-expanded={showPlans} aria-controls="bible-plans" onClick={()=>setShowPlans(value=>!value)}><Icon name="note" size={15}/>Planos de leitura<Icon name={showPlans?'up':'down'} size={13}/></button></div>
    </section>
    {showPlans&&<div id="bible-plans">{plans.map(plan=><Section key={plan.id} icon="book" title={plan.title} description={(read[plan.id]||[]).length+' de '+plan.verses.length+' leituras concluídas'}><div className="ui-plan-list">{plan.verses.map((item,index)=><div className="ui-plan-passage" key={index}><button type="button" className="ui-button ui-button-soft" onClick={()=>openPassage({book:item.b,chapter:item.c,verse:Number(item.v)})}>{books.find(b=>b.a===item.b)?.n} {item.c}:{item.v}<Icon name="right" size={14}/></button><label><input type="checkbox" aria-label={'Marcar '+(books.find(b=>b.a===item.b)?.n)+' '+item.c+':'+item.v+' como lido'} checked={(read[plan.id]||[]).includes(index)} onChange={()=>setRead(previous=>{const items=previous[plan.id]||[];const next={...previous,[plan.id]:items.includes(index)?items.filter(i=>i!==index):[...items,index]};writeCache('ls_bible_plans',next);return next;})}/>Lido</label></div>)}</div></Section>)}</div>}
    <article ref={reading} className="ui-card ui-bible-reading" aria-busy={status==='loading'}>
      <div className="ui-reading-heading"><div><span className="ui-eyebrow">{BIBLE_EDITION.title} · Português do Brasil</span><h3 tabIndex={-1}>{selected.n} {chapter}</h3></div><span className="ui-reading-decoration" aria-hidden="true"><Icon name="book" size={28}/></span></div>
      <p className="bible-verse-hint">Toque em um versículo para salvar, marcar ou compartilhar.</p>
      {status==='loading'&&<p className="ui-helper" role="status">Carregando capítulo…</p>}
      {status==='cached'&&<p className="ui-message" role="status"><Icon name="check" size={16}/>Leitura disponível offline.</p>}
      {status==='error'&&<div className="ui-message ui-error" role="alert"><div><p>Não foi possível carregar este capítulo.</p><button type="button" className="ui-button" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div></div>}
      {verses.map(item=>{
        const entry={book,bookName:selected.n,chapter,verse:item.number,text:item.text,edition:BIBLE_EDITION.id};
        const mark=markers.get(bibleVerseKey(entry));
        return <p key={item.number} className="ui-bible-verse" data-verse={item.number} data-highlight={mark?.highlight || 'none'} data-saved={!!mark?.saved} data-target={verse===item.number} style={{fontSize}}><button type="button" className="bible-verse-button" aria-label={`${selected.n} ${chapter}:${item.number}. ${item.text}${mark?.saved?' Versículo salvo.':''}`} aria-haspopup="dialog" onClick={()=>{if(!window.getSelection()?.toString())setActionVerse(entry);}}><sup>{item.number}</sup>{item.text}{mark?.saved&&<span className="bible-verse-bookmark"><BibleBookmark size={14} filled/></span>}</button></p>;
      })}
      <p className="ui-helper bible-credits">{BIBLE_EDITION.credits}. <a href={BIBLE_EDITION.sourceUrl} target="_blank" rel="noreferrer">{BIBLE_EDITION.abbreviation} · fonte e créditos</a> · <a href={BIBLE_EDITION.licenseUrl} target="_blank" rel="noreferrer">{BIBLE_EDITION.license}</a>.</p>
    </article>
    <nav ref={dock} className="bible-chapter-dock" aria-label="Central de capítulos"><button type="button" aria-label="Capítulo anterior" disabled={!previous} onClick={()=>openPassage(previous)}><Icon name="left" size={21}/></button><button type="button" className="bible-current-chapter" aria-label={`Escolher capítulo. ${selected.n} ${chapter}`} aria-haspopup="dialog" onClick={()=>setShowPicker(true)}><span>{selected.n} {chapter}<Icon name="down" size={14}/></span><small>Capítulo {chapter} de {selected.c}</small></button><button type="button" aria-label="Próximo capítulo" disabled={!next} onClick={()=>openPassage(next)}><Icon name="right" size={21}/></button></nav>
    {actionVerse&&<BibleVerseActions dark={dark} verse={actionVerse} marker={marker} error={library.error} onUpdate={library.update} onClose={()=>setActionVerse(null)}/>}
    {showLibrary&&<BibleCollection dark={dark} items={library.items} error={library.error} onOpen={openPassage} onUpdate={library.update} onClose={()=>setShowLibrary(false)}/>}
    {showPicker&&<BibleChapterPicker dark={dark} books={books} book={book} chapter={chapter} onOpen={openPassage} onClose={()=>setShowPicker(false)}/>}
  </div>;
}
