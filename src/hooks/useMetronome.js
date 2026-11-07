import { useCallback, useEffect, useState } from 'react';
import { Metronome, metronomeSettings } from '../lib/metronome.js';

export function useMetronome(songId, savedBpm, signature) {
  const source = metronomeSettings(savedBpm, signature);
  const [draft, setDraft] = useState(null);
  const bpm = draft && draft.songId === songId && draft.source === source.bpm ? draft.bpm : source.bpm;
  const [state, setState] = useState({ status: 'stopped', error: '', beat: -1 });
  const [engine] = useState(() => new Metronome({
    onState: setState,
    onBeat: beat => {
      try { if (beat === 0) globalThis.navigator?.vibrate?.(20); } catch { /* Optional tactile feedback. */ }
      setState(previous => previous.status === 'running' ? { ...previous, beat } : previous);
    },
  }));
  const setBpm = useCallback(value => setDraft({ songId, source: source.bpm, bpm: metronomeSettings(value).bpm }), [songId, source.bpm]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const toggle = useCallback(() => {
    if (engine.status === 'starting') return;
    if (engine.status === 'running') engine.stop();
    else if (songId) void engine.start({ bpm, signature: source.signature });
  }, [engine, songId, bpm, source.signature]);
  useEffect(() => { engine.configure(bpm, source.signature); }, [engine, bpm, source.signature]);
  // Data refreshes with the same ID/BPM/meter must not close an unlocked context.
  useEffect(() => () => engine.stop(), [engine, songId]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') engine.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); engine.stop(false); };
  }, [engine]);
  return { ...state, active: state.status === 'running', starting: state.status === 'starting', bpm, sourceBpm: source.bpm, beats: source.beats, signature: source.signature, setBpm, stop, toggle };
}
