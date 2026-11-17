import { useState } from 'react';
import { Icon } from './Interface.jsx';
import { availabilityReason } from '../lib/member-settings.js';
import { assignedInstrument, instrumentGroups } from '../lib/event-instruments.js';
import '../event-vocals.css';

export default function EventInstrumentChoices({ event, members, editable, onChange }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const groups=instrumentGroups(members);
  if (!groups.length) return null;
  const change=async(instrumentId,memberId)=>{
    setBusy(true);setError('');
    try{await onChange(event.id,instrumentId,memberId);}
    catch(failure){setError(failure.message || 'Não foi possível escalar o músico.');}
    finally{setBusy(false);}
  };
  return <details className="event-instrument-choices"><summary><Icon name="guitar" size={16}/><span>Instrumentistas</span><Icon name="down" size={14}/></summary><p>Defina quem toca cada instrumento neste evento.</p>{groups.map(group=>{
    const value=assignedInstrument(event,group),assigned=group.members.filter(member=>event.members?.includes(member.id));
    const label=value==='__multiple__'?assigned.map(member=>member.name).join(', '):group.members.find(member=>member.id===value)?.name || 'Não escalado';
    return <div className="event-vocal-choice-row" key={group.id}><span>{group.label}</span>{editable?<select aria-label={group.label+' de '+event.label} value={value} disabled={busy} onChange={e=>{void change(group.id,e.target.value);}}><option value="">Não escalado</option>{value==='__multiple__'&&<option value="__multiple__" disabled>{assigned.length} escalados · escolher</option>}{group.members.map(member=>{const reason=event.members?.includes(member.id)?'':availabilityReason(member,event.date);return <option key={member.id} value={member.id} disabled={!!reason}>{member.name}{reason?' · indisponível':''}</option>;})}</select>:<strong>{label}</strong>}</div>;
  })}{busy&&<p role="status">Salvando escala…</p>}{error&&<p className="request-error" role="alert">{error}</p>}</details>;
}
