import { useEffect, useMemo, useRef, useState } from 'react';
import { requestMicrophone } from '../lib/native.js';
import { supabase } from '../lib/supabase';
import { localDate, readCache, writeCache, timerSeconds, keyDistance } from '../lib/domain.js';
import { broadcastUpdate, onRealtime, onRealtimeStatus } from '../lib/realtime.js';
import { Icon, PageHeading, Section } from './Interface.jsx';

const styles = {
  'Padrão': 'Arranjo original da música.', Worship: 'Pads, delay e crescendo gradual de dinâmica.',
  Reggae: 'Batida com contratempo e baixo marcando a levada.', 'Jazz/Blues': 'Sétimas e nonas, andamento solto.',
  Acústico: 'Violão, piano e dinâmica suave.',
};
const initialSession = () => ({ activeSongId: '', styleMode: 'Padrão', active: false, seconds: 0, startedAt: null, updatedAt: 0 });
export default function Rehearsal({ dark, events, songs, profile, connectionStatus, LyricView }) {
  const choices = useMemo(() => [...events].filter(event => event.type === 'culto' || event.type === 'ensaio').sort((a, b) => a.date.localeCompare(b.date)), [events]);
  const [eventId, setEventId] = useState('');
  const event = choices.find(item => item.id === eventId) || choices.find(item => item.date >= localDate() && item.type === 'ensaio') || choices.find(item => item.date >= localDate());
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [tick, setTick] = useState(Date.now());
  const [note, setNote] = useState('');
  const [noteDirty,setNoteDirty]=useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [takes, setTakes] = useState([]);
  const recorder = useRef(null);
  const stream = useRef(null);
  const [recording, setRecording] = useState(false);
  const owner = useRef(false);
  const activeSong = songs.find(song => song.id === session.activeSongId);
  const eventSongs = (event?.songs || []).map(id => songs.find(song => song.id === id)).filter(Boolean);
  const selectedKey = event?.keyBySong?.[activeSong?.id] || activeSong?.vocal_keys?.[event?.singerBySong?.[activeSong?.id]] || activeSong?.key;
  const apply = value => { current.current = value; setSession(value); };
  async function persist(value, selectedEventId) {
    if (!supabase || !navigator.onLine) return;
    const { error } = await supabase.from('rehearsal_sessions').upsert({
      event_id: selectedEventId, active_song_id: value.activeSongId || null,
      style_mode: value.styleMode, timer_active: value.active, timer_seconds: timerSeconds(value),
    });
    if (error) throw error;
  }
  async function change(patch) {
    if (!event) return;
    const value = { ...current.current, ...patch, updatedAt: Math.max(Date.now(),current.current.updatedAt+1) };
    owner.current = true;
    apply(value);
    writeCache(`ls_session_${event.id}`, value);
    const shared = await broadcastUpdate({ type: 'rehearsal_patch', eventId: event.id, patch, updatedAt: value.updatedAt });
    try {
      await persist(value, event.id);
      setNotice(!supabase ? 'Ensaio salvo neste aparelho. A conexão com a equipe está indisponível.' : !shared ? 'Estado salvo. Conexão ao vivo indisponível; aguardando reconexão.' : 'Ensaio atualizado para a equipe.');
    } catch (error) { setNotice(shared ? `Atualizado ao vivo; histórico não salvo: ${error.message}` : `Salvo neste aparelho; sincronização indisponível: ${error.message}`); }
  }
  useEffect(() => {
    if (!event?.id) return;
    const id = event.id;
    let disposed = false, receivedLiveState = false;
    owner.current = false;
    apply(readCache(`ls_session_${id}`, initialSession()));
    const load = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.from('rehearsal_sessions').select('*').eq('event_id', id).maybeSingle();
      if (disposed || !data || error || receivedLiveState) return;
      apply({ activeSongId: data.active_song_id || '', styleMode: data.style_mode || 'Padrão', active: !!data.timer_active, seconds: data.timer_seconds || 0, startedAt: data.timer_active ? Date.now() : null, updatedAt: 0 });
    };
    load().catch(error => { if (!disposed) setNotice(error.message); });
    const unsubscribe = onRealtime(message => {
      if (message.eventId !== id) return;
      if (message.type === 'rehearsal_request') {
        if (current.current.updatedAt) broadcastUpdate({ type: 'rehearsal_snapshot', eventId: id, state: current.current });
      } else if (message.type === 'rehearsal_snapshot') {
        if (message.state.updatedAt > current.current.updatedAt) { receivedLiveState = true; apply(message.state); writeCache(`ls_session_${id}`, message.state); }
      } else if (message.type === 'rehearsal_patch') {
        if (message.updatedAt < current.current.updatedAt) return;
        receivedLiveState = true;
        const value = { ...current.current, ...message.patch, updatedAt: message.updatedAt };
        apply(value); writeCache(`ls_session_${id}`, value);
      } else if (message.type === 'rehearsal_note' && message.songId === current.current.activeSongId) setNote(message.text);
      else if (message.type === 'rehearsal_takes') loadTakes(id);
    });
    const request = () => broadcastUpdate({ type: 'rehearsal_request', eventId: id });
    request();
    const offStatus = onRealtimeStatus(status => { if (status === 'connected') request(); });
    const interval = setInterval(() => {
      request();
      if (owner.current && current.current.active) persist(current.current, id).catch(() => {});
    }, 10000);
    const pg = supabase?.channel(`rehearsal_${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rehearsal_sessions', filter: `event_id=eq.${id}` }, () => { if (!current.current.updatedAt) load().catch(() => {}); }).subscribe();
    return () => { disposed = true; unsubscribe(); offStatus(); clearInterval(interval); if (pg) supabase.removeChannel(pg); };
  }, [event?.id]);
  useEffect(() => { const interval = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(interval); }, []);
  useEffect(() => {
    const id = session.activeSongId;
    let disposed = false;
    setNote(readCache(`ls_note_${id}`, ''));
    setNoteDirty(false);
    if (id && supabase) Promise.resolve(supabase.from('rehearsal_notes').select('note_text').eq('song_id', id).maybeSingle()).then(({ data }) => { if (!disposed && data) setNote(data.note_text || ''); }).catch(() => {});
    return () => { disposed = true; };
  }, [session.activeSongId]);
  async function saveNote() {
    if (!activeSong) return;
    setSaving(true);
    try {
      writeCache(`ls_note_${activeSong.id}`, note);
      if (supabase && navigator.onLine) {
        const { error } = await supabase.from('rehearsal_notes').upsert({ song_id: activeSong.id, note_text: note, updated_by: profile.id });
        if (error) throw error;
      } else if (supabase) window.dispatchOfflineTask?.('save_rehearsal_note', { song_id: activeSong.id, note_text: note, updated_by: profile.id });
      setNoteDirty(false);
      const sent = await broadcastUpdate({ type: 'rehearsal_note', eventId: event.id, songId: activeSong.id, text: note });
      setNotice(sent ? 'Anotação salva e compartilhada.' : 'Anotação salva neste aparelho.');
    } catch (error) { setNotice(`Anotação local preservada. Não foi possível sincronizar: ${error.message}`); }
    finally { setSaving(false); }
  }
  async function loadTakes(id) {
    if (!supabase) return;
    const { data, error } = await supabase.from('rehearsal_takes').select('*').eq('event_id', id).order('created_at', { ascending: false });
    if (!error && data) setTakes(data);
  }
  useEffect(() => { if (event?.id) loadTakes(event.id).catch(() => {}); }, [event?.id]);
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);
  async function record() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador não oferece gravação de áudio.');
      await requestMicrophone();
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = audio;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(audio, mimeType ? { mimeType } : {});
      const chunks = [];
      const recordingEventId = event.id;
      const recordingSong = activeSong?.title || 'Take';
      instance.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      instance.onstop = async () => {
        audio.getTracks().forEach(track => track.stop()); setRecording(false);
        const blob = new Blob(chunks, { type: instance.mimeType });
        const extension = instance.mimeType.includes('mp4') ? 'm4a' : 'webm';
        const filename = `takes/${crypto.randomUUID()}.${extension}`;
        let uploaded = false;
        try {
          if (!supabase || !navigator.onLine) throw new Error('Sem conexão para compartilhar a gravação.');
          const { error } = await supabase.storage.from('rehearsal-audio').upload(filename, blob);
          if (error) throw error;
          uploaded = true;
          const { data: { publicUrl } } = supabase.storage.from('rehearsal-audio').getPublicUrl(filename);
          const take = { id: crypto.randomUUID(), event_id: recordingEventId, name: `${recordingSong} — ${new Date().toLocaleTimeString('pt-BR')}`, url: publicUrl, created_at: new Date().toISOString() };
          const { error: insertError } = await supabase.from('rehearsal_takes').insert(take);
          if (insertError) throw insertError;
          await loadTakes(recordingEventId); await broadcastUpdate({ type: 'rehearsal_takes', eventId: recordingEventId }); setNotice('Gravação salva para a equipe.');
        } catch (error) {
          if (uploaded) await supabase.storage.from('rehearsal-audio').remove([filename]);
          // A downloadable fallback avoids localStorage size limits and makes
          // explicit that a failed upload has not been shared with the team.
          const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `ensaio-${recordingEventId}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
          setNotice(`Gravação baixada neste aparelho; não foi compartilhada: ${error.message}`);
        }
      };
      recorder.current = instance; instance.start(); setRecording(true);
    } catch (error) { stream.current?.getTracks().forEach(track => track.stop()); setNotice(error.message); }
  }
  const seconds = timerSeconds(session, tick);

  const eventDate=event?new Date(event.date+'T12:00:00'):null;
  const alerts=[
    {message:'🔊 Mais Volume!',label:'Mais volume',icon:'sound'},
    {message:'🎹 Mais Teclado!',label:'Mais teclado',icon:'keyboard'},
    {message:'🎸 Mais Violão!',label:'Mais violão',icon:'guitar'},
    {message:'🎙️ Mais Vocal!',label:'Mais vocal',icon:'mic'},
    {message:'🎼 Qual o tom?',label:'Qual o tom?',icon:'music'},
    {message:'⚠️ Errei a entrada!',label:'Errei a entrada',icon:'info'},
  ];
  return <div className="ui-scope ui-page" data-theme={dark?'dark':'light'} data-update-blocking={recording||noteDirty||saving}>
    <PageHeading icon="mic" eyebrow="Em sintonia com a equipe" title="Ensaio colaborativo" description="Prepare cada detalhe. Toque em unidade."/>
    <Section icon="calendar" title="Encontro da equipe" action={<span className={'ui-status '+(connectionStatus==='connected'?'ui-status-online':'')} role="status"><span className="ui-status-dot"/>{connectionStatus==='connected'?'Ao vivo':supabase?'Reconectando':'Modo local'}</span>}>
      <label className="ui-field">Evento do ensaio<select value={event?.id||''} disabled={recording} onChange={e=>setEventId(e.target.value)}><option value="">Selecione um evento</option>{choices.map(item=><option key={item.id} value={item.id}>{item.label} · {new Date(item.date+'T12:00:00').toLocaleDateString('pt-BR')}</option>)}</select></label>
      {event&&<div className="ui-current-event"><span className="ui-date-tile"><strong>{eventDate.getDate()}</strong>{eventDate.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</span><div className="ui-row-copy"><strong>{event.label}</strong><small>{eventDate.toLocaleDateString('pt-BR',{weekday:'long'})} · {event.time?.slice(0,5)} · {eventSongs.length} músicas</small></div><Icon name="music" size={20}/></div>}
      <p className="ui-helper">{connectionStatus==='connected'?'Músicas, estilo, alertas e tempo compartilhados com a equipe.':supabase?'Aguardando a conexão com a equipe.':'As alterações ficam salvas neste aparelho.'}</p>
    </Section>
    {notice&&<div className="ui-message" role="status"><Icon name="info" size={17}/><span>{notice}</span></div>}
    {!event?<div className="ui-card ui-empty"><Icon name="calendar" size={28}/><strong>Nenhum evento para ensaiar</strong><p>Os próximos cultos e ensaios aparecerão aqui.</p></div>:<>
      <Section icon="music" title="Músicas do ensaio" description="Selecione a música que a equipe vai tocar agora." action={<span className="ui-badge">{eventSongs.length}</span>}>
        <div className="ui-list">{eventSongs.map((song,index)=><button className="ui-list-row ui-song-choice" aria-label={song.title} aria-pressed={song.id===session.activeSongId} key={song.id} onClick={()=>change({activeSongId:song.id})}><span className="ui-row-number">{song.id===session.activeSongId?<Icon name="sound" size={15}/>:String(index+1).padStart(2,'0')}</span><span className="ui-row-copy"><strong>{song.title}</strong><small>{song.artist}</small></span><span className="ui-badge">{event?.keyBySong?.[song.id]||song?.vocal_keys?.[event?.singerBySong?.[song.id]]||song.key}</span></button>)}</div>
        {!eventSongs.length&&<div className="ui-empty"><Icon name="music"/><strong>O setlist ainda está vazio</strong><p>Adicione músicas na edição deste evento.</p></div>}
        {activeSong&&<div className="ui-now-playing"><span className="ui-eyebrow">Tocando agora</span><h4 aria-label={'Tocando agora: '+activeSong.title}>{activeSong.title}</h4><p className="ui-helper">Tom {selectedKey} · {activeSong.bpm} BPM</p><div className="ui-rehearsal-lyrics"><LyricView text={activeSong.lyrics||''} st={keyDistance(activeSong.key,selectedKey)} mode="chords" dark={dark}/></div></div>}
      </Section>
      <Section icon="note" title="Anotações do ensaio" description="Combine entradas, repetições e detalhes do arranjo.">
        <label className="ui-field"><span className="ui-sr-only">Anotações do ensaio</span><textarea aria-label="Anotações do ensaio" placeholder={activeSong?'O que a equipe precisa lembrar?':'Selecione uma música para anotar.'} value={note} disabled={!activeSong} onChange={e=>{setNote(e.target.value);setNoteDirty(true);}} rows={4}/></label>
        <button className="ui-button ui-button-primary ui-button-wide" style={{marginTop:12}} disabled={!activeSong||saving} onClick={saveNote}><Icon name="check" size={16}/>{saving?'Salvando…':'Salvar anotação'}</button>
      </Section>
      <Section icon="sparkles" title="Modulador de estilo sugerido" description="Defina a direção musical para este ensaio.">
        <div className="ui-chip-group">{Object.keys(styles).map(style=><button className="ui-chip" aria-pressed={session.styleMode===style} key={style} onClick={()=>change({styleMode:style})}>{style}</button>)}</div>
        <p className="ui-helper" style={{marginTop:14}}>{styles[session.styleMode]}</p>
      </Section>
      <Section icon="sound" title="Alertas de palco" description="Um toque avisa quem está conectado ao ensaio.">
        <div className="ui-rehearsal-grid">{alerts.map(alert=><button className="ui-button ui-alert-button" key={alert.message} aria-label={alert.message} onClick={async()=>{const sent=await broadcastUpdate({type:'stage_chat',sender:profile.name,message:alert.message,eventId:event.id});if(!sent)setNotice('Alerta não enviado: aguarde a conexão em tempo real.');}}><Icon name={alert.icon} size={19}/>{alert.label}</button>)}</div>
      </Section>
      <Section icon="timer" title="Tempo de ensaio" className="ui-timer" action={<span className="ui-badge">{session.active?'Em andamento':'Pausado'}</span>}>
        <output style={{fontVariantNumeric:'tabular-nums'}}>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</output><p>O mesmo tempo para toda a equipe.</p>
        <div className="ui-timer-actions"><button className="ui-button ui-button-primary" onClick={()=>change({active:!session.active,seconds,startedAt:session.active?null:Date.now()})}><Icon name={session.active?'pause':'play'} size={16}/>{session.active?'Pausar':'Iniciar cronômetro'}</button><button className="ui-button" onClick={()=>change({active:false,seconds:0,startedAt:null})}><Icon name="reset" size={16}/>Zerar</button></div>
      </Section>
      <Section icon="mic" title="Gravações" description="Registre o ensaio para ouvir depois.">
        <button className={'ui-button ui-button-wide '+(recording?'ui-recording-button':'ui-button-soft')} onClick={recording?()=>recorder.current.stop():record}><Icon name={recording?'pause':'mic'} size={17}/>{recording?'Parar gravação':'Gravar ensaio'}</button>
        {!takes.length&&<p className="ui-helper" style={{marginTop:12}}>As gravações compartilhadas aparecem aqui.</p>}
        {takes.map(take=><div className="ui-take" key={take.id}><p>{take.name}</p><audio controls src={take.url}/>{profile.is_admin&&<button className="ui-button ui-button-quiet ui-button-small" onClick={async()=>{const {error}=await supabase.from('rehearsal_takes').delete().eq('id',take.id);if(error){setNotice(error.message);return;}await loadTakes(event.id);broadcastUpdate({type:'rehearsal_takes',eventId:event.id});}}>Excluir gravação</button>}</div>)}
      </Section>
    </>}
  </div>;
}
