import { useEffect, useState } from 'react';
import { Icon } from './Interface.jsx';
import { useMetronome } from '../hooks/useMetronome.js';
import '../training.css';

const tracks = [
  { id:'voice', label:'Voz', icon:'mic', description:'Prepare a voz e as transições do repertório.', tip:'Treine a passagem mais difícil antes de cantar a música inteira.', steps:[
    {title:'Respire por 4 tempos',text:'Inspire sem levantar os ombros. Solte o ar por 4 tempos, sem forçar.',seconds:120},
    {title:'Cante a frase a 70 BPM',text:'Escolha uma frase do repertório e cante devagar, mantendo cada pulso igual.',seconds:240},
    {title:'Repita a transição três vezes',text:'Faça a troca sem parar. Acelere só quando estiver firme e confortável.',seconds:240},
  ]},
  { id:'keys', label:'Teclado', icon:'keyboard', description:'Ganhe segurança nos acordes e na dinâmica.', tip:'Toque mais leve quando a voz começar. Deixe espaço para a melodia.', steps:[
    {title:'Aqueça com cinco notas',text:'Toque Dó, Ré, Mi, Fá e Sol, indo e voltando com cada mão relaxada.',seconds:120},
    {title:'Toque os acordes a 70 BPM',text:'Escolha quatro acordes da música e mantenha a mesma duração em cada um.',seconds:240},
    {title:'Repita a transição três vezes',text:'Ligue verso e refrão sem interromper o pulso. Use inversões próximas.',seconds:240},
  ]},
  { id:'guitar', label:'Violão', icon:'guitar', description:'Pratique trocas limpas e uma batida constante.', tip:'Troque primeiro os acordes sem batida. Depois acrescente o ritmo.', steps:[
    {title:'Prepare a mão e os acordes',text:'Relaxe os ombros e forme cada acorde do trecho. Confira o som das cordas.',seconds:120},
    {title:'Mantenha a batida a 70 BPM',text:'Toque devagar e deixe a mão direita manter o pulso durante as trocas.',seconds:240},
    {title:'Repita a transição três vezes',text:'Una duas partes da música sem parar. Reduza o andamento se a troca falhar.',seconds:240},
  ]},
  { id:'rhythm', label:'Ritmo', icon:'sound', description:'Fortaleça o pulso e a escuta da equipe.', tip:'Mantenha a levada simples e ouça a voz antes de acrescentar viradas.', steps:[
    {title:'Marque quatro pulsos',text:'Bata palmas contando 1, 2, 3, 4. Mantenha a distância entre as palmas.',seconds:120},
    {title:'Pratique a levada a 70 BPM',text:'Repita um padrão simples junto ao metrônomo, sem acelerar nas viradas.',seconds:240},
    {title:'Repita a transição três vezes',text:'Saia da levada, faça uma virada curta e volte no primeiro tempo.',seconds:240},
  ]},
];
const totalSeconds = 600;
const formatTime = value => `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;

export default function PracticalTraining({ dark, profile, children }) {
  const [resourcesOpen,setResourcesOpen]=useState(false);
  const [trackId,setTrackId]=useState(()=>/vocal|voz/i.test(`${profile?.role||''} ${profile?.instrument||''}`)?'voice':/viol[aã]o|guitarra/i.test(profile?.instrument||'')?'guitar':/bateria|percuss[aã]o/i.test(profile?.instrument||'')?'rhythm':'keys');
  const [session,setSession]=useState({elapsed:0,startedAt:null});
  const [now,setNow]=useState(Date.now);
  const track=tracks.find(item=>item.id===trackId);
  const metronome=useMetronome('training-'+trackId,70,'4/4');
  const running=session.startedAt!==null;
  const elapsed=Math.min(totalSeconds,session.elapsed+(running?Math.max(0,Math.floor((now-session.startedAt)/1000)):0));
  const complete=elapsed===totalSeconds;
  let stepStart=0;
  const activeStep=track.steps.findIndex(step=>{stepStart+=step.seconds;return elapsed<stepStart;});
  useEffect(()=>{
    if(session.startedAt===null)return;
    const tick=()=>{
      const time=Date.now();setNow(time);
      if(session.elapsed+Math.floor((time-session.startedAt)/1000)>=totalSeconds)setSession({elapsed:totalSeconds,startedAt:null});
    };
    const interval=setInterval(tick,250);
    const hidden=()=>{if(document.visibilityState==='hidden')setSession(previous=>previous.startedAt===null?previous:{elapsed:Math.min(totalSeconds,previous.elapsed+Math.max(0,Math.floor((Date.now()-previous.startedAt)/1000))),startedAt:null});};
    document.addEventListener('visibilitychange',hidden);
    return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',hidden);};
  },[session.startedAt,session.elapsed]);
  const toggleSession=()=>{
    const time=Date.now();setNow(time);
    setSession(previous=>previous.startedAt===null?{elapsed:previous.elapsed===totalSeconds?0:previous.elapsed,startedAt:time}:{elapsed:Math.min(totalSeconds,previous.elapsed+Math.max(0,Math.floor((time-previous.startedAt)/1000))),startedAt:null});
  };
  const reset=()=>{setSession({elapsed:0,startedAt:null});metronome.stop();};
  const changeTrack=id=>{setTrackId(id);reset();};
  return <div className="ui-scope ui-page practical-training" data-theme={dark?'dark':'light'} data-update-blocking={running||metronome.active||metronome.starting}>
    <header className="training-heading"><Icon name="music" size={25}/><div><h2>Treino</h2><p>Pequenos passos, mais segurança no louvor</p></div></header>
    <div className="training-tracks" role="group" aria-label="Escolher prática">{tracks.map(item=><button key={item.id} className="training-track" type="button" aria-pressed={item.id===trackId} onClick={()=>changeTrack(item.id)}><Icon name={item.icon} size={22}/>{item.label}</button>)}</div>
    <section className="training-card training-hero" aria-label="Sua prática de hoje">
      <span className="ui-eyebrow"><Icon name="music" size={15}/> Sua prática de hoje</span>
      <h3>10 minutos para evoluir</h3><p>{track.description}</p>
      <div className="training-session-actions"><button type="button" className="ui-button ui-button-soft" onClick={toggleSession}><Icon name={running?'pause':'play'} size={17}/>{running?'Pausar prática':complete?'Praticar novamente':elapsed?'Continuar prática':'Começar prática'}</button>{elapsed>0&&<button type="button" className="ui-button ui-button-quiet" onClick={reset}>Reiniciar</button>}</div>
      {(elapsed>0||running)&&<div className="training-progress"><div><span role="status">{complete?'Prática concluída':running?'Prática em andamento':'Prática pausada'}</span><output aria-label="Tempo de prática">{formatTime(elapsed)} / 10:00</output></div><progress max={totalSeconds} value={elapsed} aria-label="Progresso da prática"/></div>}
    </section>
    <section className="training-exercises" aria-labelledby="training-exercises-title"><h3 id="training-exercises-title">Pratique agora</h3><ol>{track.steps.map((step,index)=><li key={step.title} className="training-card training-step" aria-current={activeStep===index&&(elapsed>0||running)?'step':undefined}><span className="training-step-number" aria-hidden="true">{index+1}</span><div><h4>{step.title}</h4><p>{step.text}</p></div><span className="training-duration"><Icon name="timer" size={14}/>{step.seconds/60} min</span></li>)}</ol></section>
    <section className="training-card training-metronome" aria-labelledby="training-metronome-title">
      <h3 id="training-metronome-title"><Icon name="sound" size={18}/> Metrônomo</h3>
      <div className="training-metronome-controls"><div><output aria-label="Andamento do metrônomo">{metronome.bpm} BPM</output><span>Compasso {metronome.signature}</span></div><button type="button" className="ui-icon-button" aria-label="Diminuir andamento" disabled={metronome.bpm<=20} onClick={()=>metronome.setBpm(metronome.bpm-5)}>−</button><button type="button" className="ui-icon-button" aria-label="Aumentar andamento" disabled={metronome.bpm>=300} onClick={()=>metronome.setBpm(metronome.bpm+5)}>+</button><button type="button" className="training-play" aria-label={metronome.starting?'Ativando áudio…':metronome.active?'Parar metrônomo':'Ativar metrônomo'} aria-pressed={metronome.active} disabled={metronome.starting} onClick={metronome.toggle}><Icon name={metronome.active?'pause':'play'} size={24}/></button></div>
      <div className="training-beats" aria-label="Pulsos do metrônomo">{Array.from({length:metronome.beats},(_,index)=><span key={index} data-active={metronome.active&&metronome.beat===index}/>)}</div>
      {metronome.error&&<p className="ui-message ui-error" role="alert">{metronome.error}</p>}
    </section>
    <aside className="training-card training-tip"><h3><Icon name="sparkles" size={17}/> Dica para o repertório</h3><p>{track.tip}</p></aside>
    {children&&<details className="training-resources" onToggle={event=>setResourcesOpen(event.currentTarget.open)}><summary>Recursos e afinador <Icon name="down" size={17}/></summary>{resourcesOpen&&<><p className="ui-helper">Vídeos, leituras e afinador cromático continuam disponíveis.</p><div>{children}</div></>}</details>}
  </div>;
}
