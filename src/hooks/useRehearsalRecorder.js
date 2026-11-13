import { useCallback, useEffect, useRef, useState } from 'react';
import { requestMicrophone } from '../lib/native.js';
import { supabase } from '../lib/supabase';
import { broadcastUpdate } from '../lib/realtime.js';

const emptyState = { recording: false, starting: false, uploading: false, durationSeconds: 0, waveform: [], hasWaveform: false };

function releaseMeter(session) {
  for (const node of [session.source, session.analyser]) {
    try { node?.disconnect(); } catch { /* A device interruption may already have disconnected the node. */ }
  }
  session.source = null;
  session.analyser = null;
  if (session.context) {
    session.context.onstatechange = null;
    try { Promise.resolve(session.context.close()).catch(() => {}); } catch { /* The browser may already have closed audio. */ }
    session.context = null;
  }
}

function releaseAudio(session) {
  clearInterval(session.timer);
  session.timer = null;
  session.stream?.getTracks().forEach(track => {
    try { track.stop(); } catch { /* Continue releasing the remaining tracks and audio context. */ }
  });
  releaseMeter(session);
}

function downloadRecording(blob, eventId, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ensaio-${eventId}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Records locally and shares only completed, successfully uploaded takes. */
export function useRehearsalRecorder({ onSaved, onNotice } = {}) {
  const [state, setState] = useState(emptyState);
  const active = useRef(null);
  const mounted = useRef(true);
  const callbacks = useRef({ onSaved, onNotice });
  callbacks.current = { onSaved, onNotice };

  const update = useCallback(patch => {
    if (mounted.current) setState(previous => ({ ...previous, ...patch }));
  }, []);
  const notice = useCallback(message => {
    if (mounted.current) callbacks.current.onNotice?.(message);
  }, []);

  const start = useCallback(async ({ eventId, songTitle = 'Take' }) => {
    if (active.current || !eventId) return;
    const session = { eventId, songTitle, cancelled: false, chunks: [], startedAt: null };
    active.current = session;
    update({ ...emptyState, starting: true });
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador não oferece gravação de áudio.');

      // Unlock the optional meter in the click handler, before permissions await.
      // A blocked meter never prevents the browser's recorder from working.
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        try {
          session.context = new Audio();
          const context = session.context;
          Promise.resolve(context.resume()).catch(() => {
            if (session.context === context) releaseMeter(session);
          });
        } catch { releaseMeter(session); }
      }
      await requestMicrophone();
      if (session.cancelled || !mounted.current) { releaseAudio(session); return; }
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session.cancelled || !mounted.current) { releaseAudio(session); return; }

      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : {});
      session.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = async () => {
        if (session.finalized) return;
        session.finalized = true;
        const durationSeconds = Math.max(0, Math.floor((performance.now() - session.startedAt) / 1000));
        releaseAudio(session);
        update({ recording: false, starting: false, uploading: true, durationSeconds, hasWaveform: false });
        const blob = new Blob(session.chunks, { type: recorder.mimeType });
        const extension = recorder.mimeType.includes('mp4') ? 'm4a' : 'webm';
        const filename = `takes/${crypto.randomUUID()}.${extension}`;
        let uploaded = false;
        let saved = false;
        try {
          if (!blob.size) throw new Error('Nenhum áudio foi capturado. Verifique o microfone e tente novamente.');
          if (!supabase || !navigator.onLine) throw new Error('Sem conexão para compartilhar a gravação.');
          const { error } = await supabase.storage.from('rehearsal-audio').upload(filename, blob);
          if (error) throw error;
          uploaded = true;
          const { data: { publicUrl } } = supabase.storage.from('rehearsal-audio').getPublicUrl(filename);
          const take = {
            id: crypto.randomUUID(), event_id: eventId,
            name: `${songTitle} — ${new Date().toLocaleTimeString('pt-BR')}`,
            url: publicUrl, created_at: new Date().toISOString(),
          };
          const { error: insertError } = await supabase.from('rehearsal_takes').insert(take);
          if (insertError) throw insertError;
          saved = true;
        } catch (error) {
          if (uploaded) {
            try { await supabase.storage.from('rehearsal-audio').remove([filename]); } catch { /* Preserve the local audio even if remote cleanup fails. */ }
          }
          if (blob.size) {
            try {
              downloadRecording(blob, eventId, extension);
              notice(`Gravação baixada neste aparelho; não foi compartilhada: ${error.message}`);
            } catch { notice(`Não foi possível salvar a gravação: ${error.message}`); }
          } else notice(error.message);
        } finally {
          if (active.current === session) active.current = null;
          update({ uploading: false });
        }
        if (saved) {
          // Refresh failures must not describe an already-saved take as lost.
          if (mounted.current) {
            try { await callbacks.current.onSaved?.(eventId); } catch { /* A later refresh can load this persisted take. */ }
          }
          try { await broadcastUpdate({ type: 'rehearsal_takes', eventId }); } catch { /* The database remains the source of truth. */ }
          notice('Gravação salva para a equipe.');
        }
      };
      recorder.onerror = event => {
        notice(event.error?.message || 'A gravação foi interrompida pelo navegador.');
        if (recorder.state !== 'inactive') recorder.stop();
        // MediaRecorder dispatches final data and stop after an error. Let those
        // events arrive before finalizing, so buffered audio is not discarded.
      };

      if (session.context) {
        try {
          session.source = session.context.createMediaStreamSource(session.stream);
          session.analyser = session.context.createAnalyser();
          session.analyser.fftSize = 256;
          session.source.connect(session.analyser);
          session.samples = new Uint8Array(session.analyser.fftSize);
        } catch {
          releaseMeter(session);
        }
      }
      session.startedAt = performance.now();
      recorder.start();
      update({ recording: true, starting: false });
      session.timer = setInterval(() => {
        if (!mounted.current || recorder.state !== 'recording') return;
        const durationSeconds = Math.max(0, Math.floor((performance.now() - session.startedAt) / 1000));
        const hasWaveform = !!session.analyser && session.context?.state === 'running';
        if (hasWaveform) {
          try {
            session.analyser.getByteTimeDomainData(session.samples);
            const power = session.samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / session.samples.length;
            const amplitude = Math.min(1, Math.sqrt(power) * 4);
            setState(previous => ({ ...previous, durationSeconds, hasWaveform, waveform: [...previous.waveform.slice(-47), amplitude] }));
          } catch {
            releaseMeter(session);
            update({ durationSeconds, hasWaveform: false });
          }
        } else update({ durationSeconds, hasWaveform: false });
      }, 80);
    } catch (error) {
      releaseAudio(session);
      if (active.current === session) {
        active.current = null;
        update({ recording: false, starting: false, uploading: false, hasWaveform: false });
      }
      if (!session.cancelled) notice(error.message || 'Não foi possível iniciar a gravação.');
    }
  }, [notice, update]);

  const stop = useCallback(() => {
    const session = active.current;
    if (!session) return;
    if (session.recorder?.state === 'recording') session.recorder.stop();
    else if (!session.recorder) {
      session.cancelled = true;
      releaseAudio(session);
      active.current = null;
      update({ starting: false });
    }
  }, [update]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = active.current;
      if (!session) return;
      session.cancelled = true;
      if (session.recorder?.state === 'recording') session.recorder.stop();
      releaseAudio(session);
    };
  }, []);

  return { ...state, start, stop };
}
