import { useEffect, useRef, useState } from 'react';
import { Icon } from './Interface.jsx';
import { detectPitch, pitchNote } from '../lib/tuner.js';
import '../tuner.css';

function release(session) {
  window.cancelAnimationFrame(session.frame);
  session.stream?.getTracks().forEach(track => track.stop());
  if (session.context?.state !== 'closed') void session.context?.close().catch(() => {});
}

export default function ChromaticTuner() {
  const [phase,setPhase] = useState('idle');
  const [note,setNote] = useState(null);
  const [error,setError] = useState('');
  const current = useRef(null);
  const needle = useRef(null);
  useEffect(() => () => {
    if (current.current) release(current.current);
    current.current = null;
  }, []);

  const stop = () => {
    if (current.current) release(current.current);
    current.current = null;
    setPhase('idle');
    setNote(null);
    needle.current.setAttribute('transform','rotate(0)');
  };

  const start = async () => {
    if (current.current) return;
    const session = { frame: 0 };
    current.current = session;
    setError('');
    setPhase('starting');
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio || !navigator.mediaDevices?.getUserMedia) throw new Error('O microfone não está disponível neste navegador.');
      const context = session.context = new Audio();
      await context.resume();
      if (current.current !== session) return;
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      if (current.current !== session) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      session.stream = stream;
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      setPhase('listening');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let angle = 0, target = 0, previousFrame = 0, measuredAt = -Infinity, heardAt = -Infinity;
      let pendingFrequency = 0, frequency = 0, quiet = true;
      const animate = time => {
        if (time - measuredAt >= 65) {
          measuredAt = time;
          analyser.getFloatTimeDomainData(samples);
          const detected = detectPitch(samples,context.sampleRate);
          if (detected) {
            heardAt = time;
            const similar = (a,b) => Math.abs(Math.log2(a/b)) < .04;
            if (similar(frequency,detected) || similar(pendingFrequency,detected)) {
              frequency = similar(frequency,detected) ? frequency * .65 + detected * .35 : detected;
              const reading = pitchNote(frequency);
              setNote(reading);
              target = reading.cents * .9;
              quiet = false;
            }
            pendingFrequency = detected;
          } else if (time - heardAt > 420 && !quiet) {
            frequency = pendingFrequency = target = 0;
            setNote(null);
            quiet = true;
          }
        }
        const elapsed = Math.min(time - (previousFrame || time), 50);
        previousFrame = time;
        angle = reducedMotion.matches ? target : angle + (target - angle) * (1 - Math.exp(-elapsed / 175));
        needle.current.setAttribute('transform',`rotate(${angle.toFixed(2)})`);
        session.frame = requestAnimationFrame(animate);
      };
      session.frame = requestAnimationFrame(animate);
    } catch (failure) {
      if (current.current !== session) return;
      stop();
      setError(failure.name === 'NotAllowedError' ? 'Permita o acesso ao microfone para afinar.' : 'Não foi possível iniciar o microfone. Tente novamente.');
    }
  };

  const tuned = note && Math.abs(note.cents) < 6;
  return <section className="gL1 chromatic-tuner" data-tone={note ? tuned ? 'tuned' : 'adjust' : 'idle'} data-update-blocking={phase!=='idle'}>
    <h3>🎸 Afinador Cromático</h3>
    <div className="tuner-dial">
      <svg viewBox="-60 -56 120 67" aria-hidden="true">
        <path d="M -50 0 A 50 50 0 0 1 50 0" fill="none" stroke="currentColor" strokeOpacity=".26" strokeWidth="3"/>
        <path d="M0 -54v9" stroke="currentColor" strokeWidth="1.5"/>
        <g ref={needle} className="tuner-needle"><path d="M0 0v-46" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle r="4" fill="currentColor"/></g>
      </svg>
      <div className="tuner-reading">{note ? <><strong>{note.name}<small>{note.octave}</small></strong><span>{tuned ? 'Afinado' : `${note.cents > 0 ? '+' : ''}${note.cents} cents · ${note.cents > 0 ? 'Agudo' : 'Grave'}`}</span></> : <span>{phase==='listening' ? 'Toque uma corda perto do microfone' : phase==='starting' ? 'Abrindo microfone…' : 'Ative o microfone para afinar'}</span>}</div>
    </div>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="ui-button ui-button-soft ui-button-wide" onClick={phase==='idle'?start:stop}><Icon name={phase==='idle'?'mic':'close'} size={17}/>{phase==='idle'?'Iniciar afinador':phase==='starting'?'Cancelar':'Parar afinador'}</button>
  </section>;
}
