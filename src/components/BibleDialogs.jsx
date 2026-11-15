import { useRef, useState } from 'react';
import { Dialog, Icon } from './Interface.jsx';
import { copyTextToClipboard } from '../lib/clipboard.js';
import { BIBLE_HIGHLIGHTS, bibleVerseKey, bibleVerseLabel, bibleVerseShareText, shareBibleVerse } from '../lib/bible-library.js';
import { BIBLE_EDITION } from '../lib/bible-edition.js';

export function BibleBookmark({ size=18, filled=false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>;
}

export function BibleVerseActions({ dark, verse, marker, error, onUpdate, onClose }) {
  const [notice,setNotice]=useState('');
  const [manual,setManual]=useState(false);
  const [busy,setBusy]=useState(false);
  const shareButton=useRef(null);
  const label=bibleVerseLabel(verse);
  const share=async()=>{
    setBusy(true);setNotice('');
    try {
      const result=await shareBibleVerse(verse,{share:typeof navigator.share==='function'?data=>navigator.share(data):null,copy:copyTextToClipboard});
      if(result==='copied')setNotice('Versículo copiado para compartilhar.');
      if(result==='manual'){setManual(true);setNotice('Selecione e copie o texto abaixo para compartilhar.');}
    } finally {setBusy(false);requestAnimationFrame(()=>shareButton.current?.focus({preventScroll:true}));}
  };
  return <Dialog dark={dark} className="bible-dialog" title={label} description={BIBLE_EDITION.title} eyebrow="Seu tempo na Palavra" icon="book" compact closeLabel="Fechar ações do versículo" onClose={onClose} busy={busy} footer={<button type="button" className="ui-button ui-button-wide" onClick={onClose} disabled={busy}>Continuar leitura</button>}>
    <blockquote className="bible-action-quote">{verse.text}</blockquote>
    <div className="bible-action-buttons"><button type="button" className="ui-button" disabled={busy} aria-pressed={!!marker?.saved} onClick={()=>{if(onUpdate(verse,{saved:!marker?.saved}))setNotice(marker?.saved?'Versículo removido dos salvos.':'Versículo salvo.');}}><BibleBookmark filled={!!marker?.saved}/>{marker?.saved?'Remover dos salvos':'Salvar versículo'}</button><button ref={shareButton} type="button" className="ui-button ui-button-soft" disabled={busy} onClick={share}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>Compartilhar</button></div>
    <fieldset className="bible-highlight-picker" disabled={busy}><legend>Marcar versículo</legend><div>{BIBLE_HIGHLIGHTS.map(color=><button type="button" key={color.id} data-highlight={color.id} aria-label={`Marcar em ${color.label.toLowerCase()}`} aria-pressed={marker?.highlight===color.id} onClick={()=>{if(onUpdate(verse,{highlight:color.id}))setNotice(`Marcação em ${color.label.toLowerCase()} salva.`);}}><span aria-hidden="true">{marker?.highlight===color.id?<Icon name="check" size={17}/>:null}</span>{color.label}</button>)}</div>{marker?.highlight&&<button type="button" className="bible-remove-highlight" onClick={()=>{if(onUpdate(verse,{highlight:null}))setNotice('Marcação removida.');}}>Remover marcação</button>}</fieldset>
    {error&&<p className="ui-message ui-error" role="alert">{error}</p>}
    <p className="bible-action-status" role="status">{notice}</p>
    {manual&&<label className="ui-field">Texto para compartilhar<textarea readOnly aria-label="Versículo para compartilhar" rows={7} value={bibleVerseShareText(verse)} onFocus={event=>event.target.select()}/></label>}
  </Dialog>;
}

export function BibleCollection({ dark, items, error, onOpen, onUpdate, onClose }) {
  const [filter,setFilter]=useState('saved');
  const entries=items.filter(item=>filter==='saved'?item.saved:item.highlight);
  return <Dialog dark={dark} className="bible-dialog" title="Seus versículos" description="Salvos e marcações neste aparelho" eyebrow="Sua coleção" icon="book" closeLabel="Fechar seus versículos" compact onClose={onClose} tabs={<div className="bible-collection-tabs" role="group" aria-label="Filtrar seus versículos">{[['saved','Salvos'],['highlight','Marcados']].map(([id,title])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{title}<span>{items.filter(item=>id==='saved'?item.saved:item.highlight).length}</span></button>)}</div>} footer={<button type="button" className="ui-button ui-button-wide" onClick={onClose}>Voltar à leitura</button>}>
    {error&&<p className="ui-message ui-error" role="alert">{error}</p>}
    {entries.length?<ul className="bible-collection-list">{entries.map(item=><li key={bibleVerseKey(item)} data-highlight={item.highlight || 'none'}><button type="button" className="bible-collection-open" onClick={()=>onOpen(item)}><strong>{bibleVerseLabel(item)}<Icon name="right" size={15}/></strong><span>{item.text}</span></button><button type="button" className="bible-collection-remove" aria-label={`Remover ${filter==='saved'?'dos salvos':'marcação de'} ${bibleVerseLabel(item)}`} onClick={()=>onUpdate(item,filter==='saved'?{saved:false}:{highlight:null})}><Icon name="close" size={17}/></button></li>)}</ul>:<div className="bible-collection-empty"><BibleBookmark size={28}/><h3>{filter==='saved'?'Seus versículos salvos ficam aqui':'Suas marcações ficam aqui'}</h3><p>Toque em um versículo durante a leitura para {filter==='saved'?'salvar':'marcar'}.</p></div>}
  </Dialog>;
}

export function BibleChapterPicker({ dark, books, book, chapter, onOpen, onClose }) {
  const [draftBook,setBook]=useState(book);
  const [draftChapter,setChapter]=useState(chapter);
  const selected=books.find(item=>item.a===draftBook);
  return <Dialog dark={dark} className="bible-dialog" title="Escolher capítulo" description={BIBLE_EDITION.title} eyebrow="Continue sua leitura" icon="book" closeLabel="Fechar escolha de capítulo" compact onClose={onClose} footer={<button type="button" className="ui-button ui-button-primary ui-button-wide" onClick={()=>onOpen({book:draftBook,chapter:draftChapter})}>Ler capítulo<Icon name="right" size={16}/></button>}><div className="ui-fields bible-picker-fields"><label className="ui-field">Livro<select aria-label="Livro para abrir" value={draftBook} onChange={event=>{setBook(event.target.value);setChapter(1);}}>{books.map(item=><option key={item.a} value={item.a}>{item.n}</option>)}</select></label><label className="ui-field">Capítulo<select aria-label="Capítulo para abrir" value={draftChapter} onChange={event=>setChapter(Number(event.target.value))}>{Array.from({length:selected.c},(_,index)=><option key={index} value={index+1}>{index+1}</option>)}</select></label></div></Dialog>;
}
