import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDate, readCache, writeCache, timerSeconds, keyDistance } from '../lib/domain.js';
import { performanceKey } from '../lib/chords.js';
import { broadcastUpdate, onRealtime, onRealtimeStatus } from '../lib/realtime.js';
import { useMetronome } from '../hooks/useMetronome.js';
import { useRehearsalRecorder } from '../hooks/useRehearsalRecorder.js';
import { Icon } from './Interface.jsx';
import '../rehearsal-studio.css';

const styles = {
  'Padrão': 'Arranjo original da música.', Worship: 'Pads, delay e crescendo gradual de dinâmica.',
  Reggae: 'Batida com contratempo e baixo marcando a levada.', 'Jazz/Blues': 'Sétimas e nonas, andamento solto.',
  Acústico: 'Violão, piano e dinâmica suave.',
};
const alerts = [
  { message: '🔊 Mais Volume!', label: 'Mais volume', icon: 'sound' },
  { message: '🎹 Mais Teclado!', label: 'Mais teclado', icon: 'keyboard' },
  { message: '🎸 Mais Violão!', label: 'Mais violão', icon: 'guitar' },
  { message: '🎙️ Mais Vocal!', label: 'Mais vocal', icon: 'mic' },
  { message: '🎼 Qual o tom?', label: 'Qual o tom?', icon: 'music' },
  { message: '⚠️ Errei a entrada!', label: 'Errei a entrada', icon: 'info' },
];
const tabs = [{ id: 'chart', label: 'Cifra', icon: 'music' }, { id: 'record', label: 'Gravar', icon: 'mic' }, { id: 'notes', label: 'Anotar', icon: 'note' }];
const initialSession = () => ({ activeSongId: '', styleMode: 'Padrão', active: false, seconds: 0, startedAt: null, updatedAt: 0 });
const timeLabel = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
async function persistSession(value, eventId) {
  if (!supabase || !navigator.onLine) return;
  const { error } = await supabase.from('rehearsal_sessions').upsert({
    event_id: eventId, active_song_id: value.activeSongId || null,
    style_mode: value.styleMode, timer_active: value.active, timer_seconds: timerSeconds(value),
  });
  if (error) throw error;
}

function InstrumentArt() {
  return <div className="studio-instrument" aria-hidden="true"/>;
}

function Take({ take, admin, visible, onDelete, onNotice }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { if (!visible) audio.current?.pause(); }, [visible]);
  useEffect(() => { const element = audio.current; return () => element?.pause(); }, []);
  const play = async () => {
    if (playing) { audio.current?.pause(); return; }
    setExpanded(true);
    try { await audio.current?.play(); }
    catch { onNotice('Não foi possível reproduzir esta gravação. Tente abrir os controles de áudio novamente.'); }
  };
  const created = new Date(take.created_at);
  const date = Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return <article className="studio-take" data-update-blocking={playing || deleting}>
    <div className="studio-take-row"><button type="button" className="studio-take-play" aria-label={`${playing ? 'Pausar' : 'Ouvir'} gravação ${take.name}`} aria-pressed={playing} onClick={play}><Icon name={playing ? 'pause' : 'play'} size={19}/></button><div className="studio-take-copy"><strong>{take.name}</strong><span>{date}{duration !== null ? ` · ${timeLabel(duration)}` : ''}</span></div><details className="studio-take-menu"><summary aria-label={`Opções da gravação ${take.name}`}><span aria-hidden="true">•••</span></summary><div><button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ocultar controles' : 'Controles de áudio'}</button><a href={take.url} target="_blank" rel="noreferrer">Abrir áudio</a>{admin && <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await onDelete(take.id); } finally { setDeleting(false); } }}>{deleting ? 'Excluindo…' : 'Excluir gravação'}</button>}</div></details></div>
    <audio ref={audio} className="studio-take-audio" hidden={!expanded} controls preload="metadata" src={take.url} aria-label={`Áudio de ${take.name}`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} onError={() => { setPlaying(false); }}/>
  </article>;
}

export default function Rehearsal({ dark, events, songs, members = [], profile, connectionStatus, LyricView }) {
  const choices = useMemo(() => [...events].filter(item => item.type === 'culto' || item.type === 'ensaio').sort((a, b) => a.date.localeCompare(b.date)), [events]);
  const [eventId, setEventId] = useState('');
  const event = choices.find(item => item.id === eventId) || choices.find(item => item.date >= localDate() && item.type === 'ensaio') || choices.find(item => item.date >= localDate());
  const selectedEvent = useRef(event?.id);
  selectedEvent.current = event?.id;
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [tick, setTick] = useState(Date.now());
  const [note, setNote] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const noteDraft = useRef({ songId: '', dirty: false });
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [takes, setTakes] = useState([]);
  const owner = useRef(false);
  const [activeTab, setActiveTab] = useState('record');
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [setlistOpen, setSetlistOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const eventSongs = (event?.songs || []).map(id => songs.find(song => song.id === id)).filter(Boolean);
  const activeSong = eventSongs.find(song => song.id === session.activeSongId);
  const songIndex = eventSongs.findIndex(song => song.id === activeSong?.id);
  const nextSong = eventSongs[songIndex + 1];
  const selectedKey = performanceKey(activeSong, event);
  const singer = members.find(member => member.id === event?.singerBySong?.[activeSong?.id]);
  const metronome = useMetronome(activeSong?.id, activeSong?.bpm, activeSong?.time_signature);
  const apply = value => { current.current = value; setSession(value); };
  const loadTakes = useCallback(async id => {
    if (!supabase) return;
    const { data, error } = await supabase.from('rehearsal_takes').select('*').eq('event_id', id).order('created_at', { ascending: false });
    if (!error && data && selectedEvent.current === id) setTakes(data);
  }, []);
  const recording = useRehearsalRecorder({ onSaved: loadTakes, onNotice: setNotice });
  const busyRecording = recording.recording || recording.starting || recording.uploading;
  async function change(patch) {
    if (!event) return;
    const value = { ...current.current, ...patch, updatedAt: Math.max(Date.now(), current.current.updatedAt + 1) };
    owner.current = true;
    apply(value);
    writeCache(`ls_session_${event.id}`, value);
    const shared = await broadcastUpdate({ type: 'rehearsal_patch', eventId: event.id, patch, updatedAt: value.updatedAt });
    try {
      await persistSession(value, event.id);
      setNotice(!supabase ? 'Ensaio salvo neste aparelho. A conexão com a equipe está indisponível.' : !shared ? 'Estado salvo. Conexão ao vivo indisponível; aguardando reconexão.' : 'Ensaio atualizado para a equipe.');
    } catch (error) { setNotice(shared ? `Atualizado ao vivo; histórico não salvo: ${error.message}` : `Salvo neste aparelho; sincronização indisponível: ${error.message}`); }
  }
  useEffect(() => {
    const id = event?.id;
    setTakes([]);
    if (!id) { apply(initialSession()); return; }
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
    loadTakes(id).catch(() => {});
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
      } else if (message.type === 'rehearsal_note' && message.songId === current.current.activeSongId && !noteDraft.current.dirty) { setNote(message.text); writeCache(`ls_note_${message.songId}`, message.text); }
      else if (message.type === 'rehearsal_takes') loadTakes(id);
    });
    const request = () => broadcastUpdate({ type: 'rehearsal_request', eventId: id });
    request();
    const offStatus = onRealtimeStatus(status => { if (status === 'connected') request(); });
    const interval = setInterval(() => {
      request();
      if (owner.current && current.current.active) persistSession(current.current, id).catch(() => {});
    }, 10000);
    const pg = supabase?.channel(`rehearsal_${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rehearsal_sessions', filter: `event_id=eq.${id}` }, () => { if (!current.current.updatedAt) load().catch(() => {}); }).subscribe();
    return () => { disposed = true; unsubscribe(); offStatus(); clearInterval(interval); if (pg) supabase.removeChannel(pg); };
  }, [event?.id, loadTakes]);
  useEffect(() => { const interval = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(interval); }, []);
  useEffect(() => {
    const id = session.activeSongId;
    let disposed = false;
    const draft = readCache(`ls_note_draft_${id}`, null);
    const text = draft ?? readCache(`ls_note_${id}`, '');
    setNote(text);
    setNoteDirty(draft !== null);
    noteDraft.current = { songId: id, text, dirty: draft !== null };
    if (id && supabase) Promise.resolve(supabase.from('rehearsal_notes').select('note_text').eq('song_id', id).maybeSingle()).then(({ data }) => {
      if (!disposed && data && !noteDraft.current.dirty) {
        setNote(data.note_text || '');
        noteDraft.current.text = data.note_text || '';
        writeCache(`ls_note_${id}`, data.note_text || '');
      }
    }).catch(() => {});
    return () => { disposed = true; };
  }, [session.activeSongId]);
  async function saveNote() {
    if (!activeSong || !event) return;
    const id = activeSong.id;
    const text = note;
    setSaving(true);
    try {
      writeCache(`ls_note_${id}`, text);
      if (supabase && navigator.onLine) {
        const { error } = await supabase.from('rehearsal_notes').upsert({ song_id: id, note_text: text, updated_by: profile.id });
        if (error) throw error;
      } else if (supabase) window.dispatchOfflineTask?.('save_rehearsal_note', { song_id: id, note_text: text, updated_by: profile.id });
      if (readCache(`ls_note_draft_${id}`, null) === text) writeCache(`ls_note_draft_${id}`, null);
      if (noteDraft.current.songId === id && noteDraft.current.text === text) { setNoteDirty(false); noteDraft.current.dirty = false; }
      const sent = await broadcastUpdate({ type: 'rehearsal_note', eventId: event.id, songId: id, text });
      setNotice(sent ? 'Anotação salva e compartilhada.' : 'Anotação salva neste aparelho.');
    } catch (error) { setNotice(`Anotação local preservada. Não foi possível sincronizar: ${error.message}`); }
    finally { setSaving(false); }
  }
  async function deleteTake(id) {
    if (!supabase || !profile.is_admin || !event) return;
    const selectedId = event.id;
    const { error } = await supabase.from('rehearsal_takes').delete().eq('id', id);
    if (error) { setNotice(error.message); return; }
    await loadTakes(selectedId);
    await broadcastUpdate({ type: 'rehearsal_takes', eventId: selectedId });
    setNotice('Gravação excluída.');
  }
  const seconds = timerSeconds(session, tick);
  const eventDate = event ? new Date(event.date + 'T12:00:00') : null;
  const live = connectionStatus === 'connected';
  const connectionLabel = live ? 'Equipe conectada' : supabase ? 'Reconectando à equipe' : 'Modo local';
  const selectSong = song => { change({ activeSongId: song.id }); setSetlistOpen(false); };
  const tabKeys = event => {
    const focusedId = event.target.closest('[role="tab"]')?.id;
    const index = tabs.findIndex(tab => `studio-tab-${tab.id}` === focusedId);
    if (index < 0) return;
    const target = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : null;
    if (target) { event.preventDefault(); setActiveTab(target.id); document.getElementById(`studio-tab-${target.id}`)?.focus(); }
  };
  return <div className="ui-scope ui-page rehearsal-studio" data-theme={dark ? 'dark' : 'light'} data-update-blocking={busyRecording || noteDirty || saving || metronome.active || metronome.starting}>
    <header className="studio-heading"><div><span className="studio-heading-mark"><Icon name="mic" size={18}/></span><h2>Estúdio</h2></div><button type="button" className="studio-setlist-toggle" aria-label="Músicas do ensaio" aria-expanded={setlistOpen || !activeSong} aria-controls="studio-setlist" onClick={() => setSetlistOpen(value => !value)}><Icon name="music" size={17}/><span>Repertório</span></button></header>
    <div className="studio-event-strip"><button type="button" className="studio-event-summary" aria-label="Escolher evento do ensaio" aria-expanded={eventPickerOpen} aria-controls="studio-event-picker" disabled={busyRecording} onClick={() => setEventPickerOpen(value => !value)}><strong>{event?.label || 'Escolher evento'}</strong>{eventDate && <span>{eventDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')} · {event.time?.slice(0, 5)}</span>}<Icon name="down" size={13}/></button><span className={'studio-connection' + (live ? ' studio-connection-live' : '')} role="status" aria-label={connectionLabel} title={connectionLabel}><span/></span>{event && <button type="button" className="studio-timer-chip" aria-label="Tempo de ensaio" aria-expanded={timerOpen} aria-controls="studio-timer-controls" onClick={() => setTimerOpen(value => !value)}><Icon name="timer" size={16}/><output aria-label="Tempo compartilhado do ensaio">{timeLabel(seconds)}</output><span className="ui-sr-only">{session.active ? 'Em andamento' : 'Pausado'}</span></button>}</div>
    {eventPickerOpen && <section id="studio-event-picker" className="studio-tool-panel"><label className="ui-field">Evento do ensaio<select value={event?.id || ''} disabled={busyRecording} onChange={event => { setEventId(event.target.value); setEventPickerOpen(false); }}><option value="">Selecione um evento</option>{choices.map(item => <option key={item.id} value={item.id}>{item.label} · {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR')}</option>)}</select></label><p className="ui-helper">{connectionLabel}. {live ? 'Músicas, estilo e tempo compartilhados.' : 'As alterações são preservadas neste aparelho.'}</p></section>}
    {event && timerOpen && <section className="studio-tool-panel" id="studio-timer-controls" aria-label="Controles do tempo de ensaio"><div className="studio-tool-heading"><strong>Tempo de ensaio</strong><span>{session.active ? 'Em andamento' : 'Pausado'}</span></div><p className="ui-helper">O mesmo tempo para toda a equipe.</p><div className="ui-timer-actions"><button type="button" className="ui-button ui-button-primary" onClick={() => change({ active: !session.active, seconds, startedAt: session.active ? null : Date.now() })}><Icon name={session.active ? 'pause' : 'play'} size={16}/>{session.active ? 'Pausar' : 'Iniciar cronômetro'}</button><button type="button" className="ui-button" onClick={() => change({ active: false, seconds: 0, startedAt: null })}><Icon name="reset" size={16}/>Zerar</button></div></section>}
    {notice && <div className="studio-notice" role="status"><Icon name="info" size={15}/><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><Icon name="close" size={15}/></button></div>}
    {!event ? <section className="ui-card studio-empty"><Icon name="calendar" size={30}/><h3>Nenhum evento para ensaiar</h3><p>Os próximos cultos e ensaios aparecerão aqui.</p></section> : <>
      <section className="studio-now" aria-label="Música atual"><InstrumentArt/><div className="studio-now-copy"><span className="studio-eyebrow">Tocando agora</span><h3 aria-label={activeSong ? 'Tocando agora: ' + activeSong.title : 'Selecione uma música'}>{activeSong?.title || 'Vamos ensaiar?'}</h3><p>{activeSong ? <>{singer?.name || activeSong.artist || 'Tom do ensaio'} · Tom <strong>{selectedKey}</strong> · {activeSong.bpm || 80} BPM</> : eventSongs.length ? 'Escolha uma música do repertório para começar.' : 'Adicione músicas na edição deste evento.'}</p></div></section>
      {(setlistOpen || !activeSong) && <section className="studio-tool-panel studio-setlist" id="studio-setlist" aria-label="Músicas do ensaio"><div className="studio-tool-heading"><strong>Músicas do ensaio</strong><span>{eventSongs.length} {eventSongs.length === 1 ? 'música' : 'músicas'}</span></div><div className="ui-list">{eventSongs.map((song, index) => <button type="button" className="studio-song-choice" aria-label={song.title} aria-pressed={song.id === activeSong?.id} key={song.id} onClick={() => selectSong(song)}><span className="studio-song-number">{String(index + 1).padStart(2, '0')}</span><span className="studio-song-copy"><strong>{song.title}</strong><small>{song.artist}</small></span><span className="studio-song-key">{performanceKey(song, event)}</span></button>)}</div>{!eventSongs.length && <p className="ui-helper">O setlist ainda está vazio.</p>}</section>}
      <div className="studio-tabs" role="tablist" aria-label="Ferramentas do estúdio" onKeyDown={tabKeys}>{tabs.map(tab => <button type="button" id={`studio-tab-${tab.id}`} key={tab.id} role="tab" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} aria-controls={`studio-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}><Icon name={tab.icon} size={20}/>{tab.label}{tab.id === 'notes' && noteDirty && <span className="studio-draft-dot" aria-label="Anotação não salva"/>}{tab.id === 'record' && recording.recording && <span className="studio-record-dot" aria-label="Gravação em andamento"/>}</button>)}</div>
      <div id="studio-panel-record" className="studio-tab-panel" role="tabpanel" aria-labelledby="studio-tab-record" tabIndex={0} hidden={activeTab !== 'record'}>
        <section className={'ui-card studio-recorder' + (recording.recording ? ' studio-recorder-active' : '')} aria-label="Gravação do ensaio"><div className="studio-recorder-heading"><h3><span className="studio-record-dot"/>{recording.starting ? 'Liberando microfone…' : recording.uploading ? 'Salvando gravação…' : recording.recording ? 'Gravando ensaio' : 'Gravar ensaio'}</h3><span className="studio-record-time" aria-label={`Duração da gravação: ${timeLabel(recording.durationSeconds)}`}>{timeLabel(recording.durationSeconds)}</span></div><div className="studio-waveform" aria-label={recording.recording && recording.hasWaveform ? 'Nível do áudio do microfone' : recording.recording ? 'Gravação em andamento; visualização do áudio indisponível' : 'Microfone em repouso'} role="img"><span className="studio-waveform-line"/>{recording.hasWaveform && recording.waveform.map((sample, index) => <i key={index} style={{ height: `${Math.max(3, Math.min(100, sample * 240))}%` }}/>) }{!recording.recording && !recording.uploading && <span className="studio-waveform-idle"><Icon name="mic" size={21}/><span>Registre o som da equipe</span></span>}</div><button type="button" className="studio-record-action" disabled={recording.starting || recording.uploading} onClick={recording.recording ? recording.stop : () => recording.start({ eventId: event.id, songTitle: activeSong?.title || 'Ensaio' })}>{recording.recording ? <span className="studio-stop-icon"/> : <Icon name="mic" size={19}/>} {recording.recording ? 'Finalizar gravação' : recording.starting ? 'Aguardando microfone…' : recording.uploading ? 'Compartilhando…' : 'Iniciar gravação'}</button></section>
        <section className="studio-takes" aria-labelledby="studio-takes-title"><div className="studio-takes-heading"><h3 id="studio-takes-title">Gravações</h3><span>{takes.length} {takes.length === 1 ? 'take' : 'takes'}</span></div>{takes.length ? takes.map(take => <Take key={take.id} take={take} admin={profile.is_admin} visible={activeTab === 'record'} onDelete={deleteTake} onNotice={setNotice}/>) : <p className="studio-takes-empty">Os takes compartilhados com a equipe aparecerão aqui.</p>}</section>
      </div>
      <div id="studio-panel-chart" className="studio-tab-panel" role="tabpanel" aria-labelledby="studio-tab-chart" tabIndex={0} hidden={activeTab !== 'chart'}><section className="ui-card studio-chart">{activeSong ? <><div className="studio-tool-heading"><strong>Cifra do ensaio</strong><span>Tom {selectedKey}</span></div><div className="ui-rehearsal-lyrics"><LyricView text={activeSong.lyrics || ''} baseKey={activeSong.key} st={keyDistance(activeSong.key, selectedKey)} mode="chords" dark={dark}/></div>{!activeSong.lyrics && <p className="ui-helper">Esta música ainda não tem uma cifra cadastrada.</p>}</> : <div className="studio-empty"><Icon name="music" size={27}/><h3>Escolha uma música</h3><p>A cifra aparece aqui no tom definido para o evento.</p></div>}</section></div>
      <div id="studio-panel-notes" className="studio-tab-panel" role="tabpanel" aria-labelledby="studio-tab-notes" tabIndex={0} hidden={activeTab !== 'notes'}><section className="ui-card studio-notes"><div className="studio-tool-heading"><strong>Anotações do ensaio</strong>{noteDirty && <span>Rascunho local</span>}</div><p className="ui-helper">Entradas, repetições e detalhes do arranjo desta música.</p><label className="ui-field"><span className="ui-sr-only">Anotações do ensaio</span><textarea aria-label="Anotações do ensaio" placeholder={activeSong ? 'O que a equipe precisa lembrar?' : 'Selecione uma música para anotar.'} value={note} disabled={!activeSong} onChange={event => { const text = event.target.value; setNote(text); setNoteDirty(true); noteDraft.current = { songId: activeSong.id, text, dirty: true }; writeCache(`ls_note_draft_${activeSong.id}`, text); }} rows={5}/></label><button type="button" className="ui-button ui-button-primary ui-button-wide" disabled={!activeSong || saving} onClick={saveNote}><Icon name="check" size={16}/>{saving ? 'Salvando…' : 'Salvar anotação'}</button></section></div>
      <div className="studio-quick-tools"><button type="button" className="studio-metronome-toggle" aria-label={metronome.starting ? 'Ativando áudio…' : metronome.active ? 'Parar metrônomo' : 'Ativar metrônomo'} aria-pressed={metronome.active} disabled={!activeSong || metronome.starting} onClick={metronome.toggle}><span className="studio-metronome-icon"><svg width="23" height="26" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m8 2-5 24h18L16 2ZM6 22h12M11 20l6-14M10 11h6"/><path d="M10 5h4"/></svg></span><span><strong>Metrônomo</strong><small>{activeSong ? `${metronome.bpm} BPM · ${metronome.signature}` : 'Selecione uma música'}</small></span><span className="studio-switch" data-active={metronome.active}><span/></span></button><button type="button" className="studio-team-toggle" aria-expanded={alertsOpen} aria-controls="studio-stage-alerts" onClick={() => setAlertsOpen(value => !value)}><Icon name="bell" size={22}/><span>Avisar equipe</span></button></div>
      {(metronome.active || metronome.error || metronome.starting) && <div className="studio-metronome-status" role="status">{metronome.error ? <p role="alert">{metronome.error}</p> : <><span>{metronome.starting ? 'Ativando áudio…' : 'Metrônomo neste aparelho'}</span><div className="ui-metronome-beats" aria-label={`Compasso ${metronome.signature}`}>{Array.from({ length: metronome.beats }, (_, index) => <span key={index} className="ui-metronome-dot" data-active={metronome.active && metronome.beat === index} aria-hidden="true"/>)}</div></>}</div>}
      {alertsOpen && <section className="studio-tool-panel" id="studio-stage-alerts" aria-label="Alertas de palco"><div className="studio-tool-heading"><strong>Alertas de palco</strong><span>{live ? 'Ao vivo' : 'Aguardando conexão'}</span></div><div className="ui-rehearsal-grid">{alerts.map(alert => <button type="button" className="ui-button ui-alert-button" key={alert.message} aria-label={alert.message} onClick={async () => { const sent = await broadcastUpdate({ type: 'stage_chat', sender: profile.name, message: alert.message, eventId: event.id }); setNotice(sent ? 'Alerta enviado para a equipe.' : 'Alerta não enviado: aguarde a conexão em tempo real.'); }}><Icon name={alert.icon} size={18}/>{alert.label}</button>)}</div></section>}
      {nextSong ? <button type="button" className="studio-next" aria-label={`Próxima música: ${nextSong.title}`} onClick={() => selectSong(nextSong)}><span>A seguir <strong>{nextSong.title}</strong></span><span className="studio-next-key">{performanceKey(nextSong, event)}</span><Icon name="right" size={19}/></button> : activeSong && <div className="studio-setlist-end"><Icon name="check" size={15}/> Última música do repertório</div>}
      <details className="ui-card studio-direction"><summary><Icon name="sparkles" size={16}/><span>Direção musical</span><small>{session.styleMode}</small><Icon name="down" size={15}/></summary><div className="ui-chip-group">{Object.keys(styles).map(style => <button type="button" className="ui-chip" aria-pressed={session.styleMode === style} key={style} onClick={() => change({ styleMode: style })}>{style}</button>)}</div><p className="ui-helper">{styles[session.styleMode]}</p></details>
    </>}
  </div>;
}
