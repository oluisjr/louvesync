import { useEffect, useMemo, useRef, useState } from 'react';
import { requestMicrophone } from '../lib/native.js';
import { supabase } from '../lib/supabase';
import { localDate, readCache, writeCache, timerSeconds, keyDistance } from '../lib/domain.js';
import { broadcastUpdate, onRealtime, onRealtimeStatus } from '../lib/realtime.js';

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
  const card = { padding: 18, borderRadius: 20, marginBottom: 14 };
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
      setNotice(!supabase ? 'Ensaio salvo neste aparelho. Configure o Supabase para compartilhar.' : !shared ? 'Estado salvo. Conexão ao vivo indisponível; aguardando reconexão.' : 'Ensaio atualizado para a equipe.');
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
  return <div data-update-blocking={recording||noteDirty||saving} style={{ padding: 16, paddingBottom: 100, color: dark ? '#E2E8F0' : '#0F172A' }}>
    <h2>Ensaio colaborativo</h2>
    <p role="status" style={{ margin: '8px 0 16px' }}>{connectionStatus === 'connected' ? '● Conectado em tempo real' : supabase ? 'Reconectando à equipe…' : 'Modo local neste aparelho'}</p>
    {notice && <p role="status" className="gL1" style={card}>{notice}</p>}
    <label>Evento do ensaio<select className="fi" value={event?.id || ''} disabled={recording} onChange={e => setEventId(e.target.value)}><option value="">Selecione um evento</option>{choices.map(item => <option key={item.id} value={item.id}>{item.date} — {item.label}</option>)}</select></label>
    {!event ? <p>Nenhum evento disponível para ensaiar.</p> : <>
      <section className="gL1" style={card}><h3>Selecione a Música no Ensaio</h3><div className="rehearsal-songs">{eventSongs.map(song => <button className="bSec" aria-pressed={song.id === session.activeSongId} key={song.id} onClick={() => change({ activeSongId: song.id })}>{song.title}</button>)}</div>{!eventSongs.length && <p>Este evento ainda não tem músicas.</p>}{activeSong && <><h3>Tocando agora: {activeSong.title}</h3><p>Tom: {selectedKey} · {activeSong.bpm} BPM</p><LyricView text={activeSong.lyrics || ''} st={keyDistance(activeSong.key, selectedKey)} mode="chords" dark={dark} /></>}</section>
      <section className="gL1" style={card}><h3>Anotações do ensaio</h3><textarea className="fi" aria-label="Anotações do ensaio" value={note} disabled={!activeSong} onChange={e => {setNote(e.target.value);setNoteDirty(true);}} rows={4} /><button className="bp" disabled={!activeSong || saving} onClick={saveNote}>{saving ? 'Salvando…' : 'Salvar anotação'}</button></section>
      <section className="gL1" style={card}><h3>Modulador de estilo sugerido</h3><div className="reading-actions" style={{ flexWrap: 'wrap' }}>{Object.keys(styles).map(style => <button className="bSec" aria-pressed={session.styleMode === style} key={style} onClick={() => change({ styleMode: style })}>{style}</button>)}</div><p>{styles[session.styleMode]}</p></section>
      <section className="gL1" style={card}><h3>Alertas de palco</h3><div className="reading-actions" style={{ flexWrap: 'wrap' }}>{['🔊 Mais Volume!', '🎹 Mais Teclado!', '🎸 Mais Violão!', '🎙️ Mais Vocal!', '🎼 Qual o tom?', '⚠️ Errei a entrada!'].map(message => <button className="bSec" key={message} onClick={async () => { const sent = await broadcastUpdate({ type: 'stage_chat', sender: profile.name, message, eventId: event.id }); if (!sent) setNotice('Alerta não enviado: aguarde a conexão em tempo real.'); }}>{message}</button>)}</div></section>
      <section className="gL1" style={card}><h3>Tempo de ensaio</h3><output style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums' }}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</output><div className="reading-actions"><button className="bp" onClick={() => change({ active: !session.active, seconds, startedAt: session.active ? null : Date.now() })}>{session.active ? 'Pausar' : 'Iniciar cronômetro'}</button><button className="bSec" onClick={() => change({ active: false, seconds: 0, startedAt: null })}>Zerar</button></div></section>
      <section className="gL1" style={card}><h3>Gravações</h3><button className="bp" onClick={recording ? () => recorder.current.stop() : record}>{recording ? 'Parar gravação' : 'Gravar ensaio'}</button>{takes.map(take => <div key={take.id}><p>{take.name}</p><audio controls src={take.url} style={{ width: '100%' }} />{profile.is_admin && <button className="bSec" onClick={async () => { const { error } = await supabase.from('rehearsal_takes').delete().eq('id', take.id); if (error) { setNotice(error.message); return; } await loadTakes(event.id); broadcastUpdate({ type: 'rehearsal_takes', eventId: event.id }); }}>Excluir gravação</button>}</div>)}</section>
    </>}
  </div>;
}
