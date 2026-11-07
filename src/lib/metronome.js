export function metronomeSettings(bpm, signature = '4/4') {
  const tempo = Math.max(20, Math.min(300, Number.parseFloat(bpm) || 80));
  const match = String(signature).match(/^(\d+)\/(1|2|4|8|16)$/);
  const valid = match && Number(match[1]) >= 1 && Number(match[1]) <= 32;
  const beats = valid ? Number(match[1]) : 4, unit = valid ? Number(match[2]) : 4;
  return { bpm: tempo, signature: `${beats}/${unit}`, beats, unit, interval: 60 / tempo * 4 / unit };
}

export class Metronome {
  constructor({ createContext = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error('Este navegador não oferece áudio para o metrônomo.');
    return new Audio({ latencyHint: 'interactive' });
  }, onState = () => {}, onBeat = () => {}, timers = globalThis } = {}) {
    Object.assign(this, { createContext, onState, onBeat, timers });
    this.status = 'stopped'; this.generation = 0;
    this.settings = metronomeSettings(80);
    this.voices = new Set(); this.visualTimers = new Set();
  }
  notify(status, error = '') { this.status = status; this.onState({ status, error, beat: -1 }); }
  async start(settings) {
    this.stop();
    this.settings = metronomeSettings(settings?.bpm, settings?.signature);
    const generation = this.generation;
    let timeout;
    this.notify('starting');
    try {
      // Both construction and resume run synchronously in the button's click
      // handler, before the first await. This is required by mobile WebKit.
      const context = this.createContext(); this.context = context;
      const resumed = context.resume();
      const cancelled = new Promise(resolve => { this.cancelStart = () => resolve(false); });
      const failed = new Promise((_, reject) => { timeout = this.timers.setTimeout(() => reject(new Error('O navegador não liberou o áudio. Toque em ativar para tentar novamente.')), 3000); });
      const ready = await Promise.race([Promise.resolve(resumed).then(() => true), cancelled, failed]);
      if (generation !== this.generation || !ready) return false;
      this.cancelStart = null;
      if (context.state !== 'running') throw new Error('O áudio está bloqueado. Toque em ativar para tentar novamente.');
      context.onstatechange = () => {
        if (this.status === 'running' && context.state !== 'running') this.fail('O áudio foi interrompido. Toque em ativar para continuar.');
      };
      this.nextTime = context.currentTime + 0.03; this.nextBeat = 0;
      this.notify('running'); this.schedule();
      if (this.status !== 'running') return false;
      this.timer = this.timers.setInterval(() => this.schedule(), 25);
      return true;
    } catch (error) {
      if (generation === this.generation) this.fail(error.message || 'Não foi possível iniciar o áudio do metrônomo.');
      return false;
    } finally { this.timers.clearTimeout(timeout); }
  }
  configure(bpm, signature) {
    const next = metronomeSettings(bpm, signature);
    const changed = next.interval !== this.settings.interval || next.beats !== this.settings.beats;
    this.settings = next;
    if (this.status === 'running' && changed) {
      this.clearNotes(); this.nextTime = this.context.currentTime + 0.03; this.nextBeat = 0;
      this.schedule();
    }
  }
  schedule() {
    if (this.status !== 'running') return;
    if (this.context.state !== 'running') { this.fail('O áudio foi interrompido. Toque em ativar para continuar.'); return; }
    try {
      const now = this.context.currentTime;
      // Never play a burst of overdue clicks after a delayed browser timer.
      if (this.nextTime < now - 0.05) { this.nextTime = now + 0.03; this.nextBeat = 0; }
      while (this.nextTime < now + 0.1) {
        this.click(this.nextTime, this.nextBeat);
        this.nextTime += this.settings.interval;
        this.nextBeat = (this.nextBeat + 1) % this.settings.beats;
      }
    } catch { this.fail('Não foi possível reproduzir o metrônomo. Toque em ativar para tentar novamente.'); }
  }
  click(time, beat) {
    const context = this.context, generation = this.generation;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const voice = { oscillator, gain }; this.voices.add(voice);
    const downbeat = beat === 0;
    const grouped = this.settings.unit === 8 && this.settings.beats % 3 === 0 && beat % 3 === 0;
    oscillator.frequency.value = downbeat ? 1200 : grouped ? 1000 : 880;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(downbeat ? 0.35 : grouped ? 0.26 : 0.2, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    oscillator.start(time); oscillator.stop(time + 0.06);
    const visual = this.timers.setTimeout(() => {
      this.visualTimers.delete(visual);
      if (generation === this.generation && this.status === 'running' && context.currentTime <= time + 0.1) this.onBeat(beat);
    }, Math.max(0, (time - context.currentTime) * 1000));
    this.visualTimers.add(visual);
  }
  clearNotes() {
    for (const timer of this.visualTimers) this.timers.clearTimeout(timer);
    this.visualTimers.clear();
    for (const { oscillator, gain } of this.voices) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* An already-ended oscillator is safe to discard. */ }
      oscillator.disconnect(); gain.disconnect();
    }
    this.voices.clear();
  }
  stop(notify = true) {
    this.generation++;
    this.cancelStart?.(); this.cancelStart = null;
    this.timers.clearInterval(this.timer); this.timer = null;
    this.clearNotes();
    const context = this.context; this.context = null;
    if (context) {
      context.onstatechange = null;
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* The device may have already closed it. */ }
    }
    if (notify) this.notify('stopped'); else this.status = 'stopped';
  }
  fail(message) { this.stop(false); this.notify('error', message); }
}
