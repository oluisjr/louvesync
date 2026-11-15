import { useId, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import { insertMention, mentionLimit, pendingMentionQuery, mentionSuggestions, retainMentions } from '../lib/mentions.js';
import '../mentions.css';

export default function MentionInput({value,mentionIds=[],members,onChange,label,placeholder,rows=4,maxLength=6000,disabled=false,required=false}) {
 const input=useRef(null),id=useId(),[range,setRange]=useState(null),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[active,setActive]=useState(0);
 const options=mentionSuggestions(members,picker?search:range?.query||'',mentionIds),open=(picker||!!range)&&mentionIds.length<mentionLimit;
 const select=member=>{if(disabled)return;const next=insertMention(value,member,picker?null:range);if(next.text.length>maxLength)return;onChange(next.text,[...mentionIds,member.id]);setRange(null);setPicker(false);setSearch('');setActive(0);requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.caret,next.caret);});};
 const keyDown=event=>{if(!open)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setRange(null);setPicker(false);}if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();setActive(index=>(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);}if(event.key==='Enter'&&options[active]){event.preventDefault();select(options[active]);}};
 return <div className="mention-input" data-update-blocking={!!value.trim()}><label htmlFor={id}>{label}</label><textarea id={id} ref={input} aria-controls={open?id+'-options':undefined} aria-activedescendant={open&&options[active]?id+'-option-'+active:undefined} aria-autocomplete="list" value={value} rows={rows} required={required} disabled={disabled} maxLength={maxLength} placeholder={placeholder} onChange={event=>{onChange(event.target.value,retainMentions(event.target.value,mentionIds,members));setRange(pendingMentionQuery(event.target.value,event.target.selectionStart,mentionIds,members));setActive(0);}} onClick={event=>{setRange(pendingMentionQuery(value,event.currentTarget.selectionStart,mentionIds,members));setActive(0);}} onKeyDown={keyDown}/>
  <div className="mention-tools"><small>Digite @ e escolha quem deseja notificar.</small><button type="button" disabled={disabled||mentionIds.length>=mentionLimit} aria-expanded={picker} onClick={()=>{setPicker(!picker);setRange(null);setActive(0);}}>Marcar integrantes</button></div>
  {open&&<div className="mention-picker">{picker&&<input disabled={disabled} aria-label={'Buscar integrantes em '+label} value={search} onChange={event=>{setSearch(event.target.value);setActive(0);}} placeholder="Buscar integrante…" onKeyDown={keyDown}/>}<div id={id+'-options'} role="listbox" aria-label={'Integrantes para marcar em '+label}>{options.map((member,index)=><button type="button" key={member.id} role="option" id={id+'-option-'+index} disabled={disabled} aria-selected={active===index} onMouseDown={event=>event.preventDefault()} onClick={()=>select(member)}><span>{member.avatar||member.name?.slice(0,2)}</span><div><strong>{member.name}</strong><small>{member.instrument||member.role||'Integrante'}</small></div><Icon name="plus" size={14}/></button>)}{!options.length&&<p>Nenhum integrante encontrado.</p>}</div></div>}
  {!!mentionIds.length&&<div className="mention-chips" aria-label={'Integrantes marcados em '+label}>{mentionIds.map(id=>{const member=members.find(person=>person.id===id);return <button type="button" key={id} disabled={disabled} aria-label={'Remover marcação de '+(member?.name||'integrante')} onClick={()=>{const text=member?value.replaceAll('@'+member.name,''):value;onChange(text,retainMentions(text,mentionIds.filter(item=>item!==id),members));}}> @{member?.name||'Integrante'}<Icon name="close" size={12}/></button>;})}</div>}
 </div>;
}
export function MentionText({text='',mentionIds=[],members}) {
 const tokens=mentionIds.map(id=>members.find(member=>member.id===id)?.name).filter(Boolean).sort((a,b)=>b.length-a.length).map(name=>'@'+name);
 if(!tokens.length)return text;
 const escaped=tokens.map(token=>token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 return String(text).split(new RegExp('('+escaped+')','g')).map((part,index)=>tokens.includes(part)?<mark className="mention-token" key={index}>{part}</mark>:part);
}
