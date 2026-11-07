import test from 'node:test';
import assert from 'node:assert/strict';
import { Metronome, metronomeSettings } from '../src/lib/metronome.js';

function fixture() {
  let now = 0, sequence = 0;
  const tasks = new Map(), contexts = [], states = [], beats = [];
  const add = (fn, delay, interval = 0) => { const id = ++sequence; tasks.set(id, { fn, at: now + delay, interval }); return id; };
  const timers = {
    setTimeout: (fn, delay) => add(fn, delay), clearTimeout: id => tasks.delete(id),
    setInterval: (fn, delay) => add(fn, delay, delay), clearInterval: id => tasks.delete(id),
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
        if (!next) break;
        const [id, task] = next; now = Math.max(now, task.at);
        if (task.interval) task.at = now + task.interval; else tasks.delete(id);
        task.fn();
      }
      now = end;
    },
    jump(ms) { now += ms; },
  };
  const createContext = () => {
    const context = { state: 'suspended', destination: {}, notes: [], resumes: 0, closes: 0,
      get currentTime() { return now / 1000; },
      resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); },
      close() { this.closes++; this.state = 'closed'; return Promise.resolve(); },
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; },
      createOscillator() {
        const oscillator = { frequency: { value: 0 }, connect() {}, disconnect() {},
          start(at) { context.notes.push({ at, frequency: this.frequency.value }); },
          stop(at) { timers.clearTimeout(this.end); this.end = timers.setTimeout(() => this.onended?.(), Math.max(0, ((at ?? context.currentTime) - context.currentTime) * 1000)); },
        };
        return oscillator;
      },
    };
    contexts.push(context); return context;
  };
  const engine = new Metronome({ createContext, timers, onState: state => states.push(state), onBeat: beat => beats.push(beat) });
  return { engine, timers, contexts, states, beats, createContext, tasks };
}

test('audio is resumed before awaiting startup; clicks use the audio clock and accent the bar', async () => {
  const f = fixture();
  const starting = f.engine.start({ bpm: 120, signature: '4/4' });
  assert.equal(f.contexts[0].resumes, 1);
  assert.equal(await starting, true);
  f.timers.tick(2200);
  const notes = f.contexts[0].notes;
  assert.equal(notes.length, 5);
  notes.forEach((note,index) => assert.ok(Math.abs(note.at - (0.03 + index * 0.5)) < 0.000001));
  assert.deepEqual(f.beats, [0,1,2,3,0]);
  assert.equal(notes[0].frequency, notes[4].frequency);
  assert.ok(notes[0].frequency > notes[1].frequency);
  f.engine.stop();
  const count = notes.length; f.timers.tick(5000);
  assert.equal(notes.length, count); assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.engine.voices.size, 0); assert.equal(f.tasks.size, 0);
});

test('3/4 and 6/8 honor beat units and compound groups', async () => {
  const f = fixture();
  await f.engine.start({ bpm: 120, signature: '3/4' }); f.timers.tick(1700);
  assert.deepEqual(f.beats, [0,1,2,0]);
  f.engine.stop();
  await f.engine.start({ bpm: 120, signature: '6/8' }); f.timers.tick(1600);
  const notes = f.contexts[1].notes;
  assert.ok(Math.abs(notes[1].at - notes[0].at - 0.25) < 0.000001);
  assert.ok(notes[3].frequency > notes[1].frequency);
  assert.equal(notes[0].frequency, notes[6].frequency);
  f.engine.stop();
});

test('live tempo changes reuse unlocked audio, and identical data refreshes preserve phase', async () => {
  const f = fixture();
  await f.engine.start({ bpm: 120, signature: '4/4' }); f.timers.tick(600);
  const context = f.contexts[0], before = context.notes.length;
  f.engine.configure(240, '3/4'); f.timers.tick(800);
  const notes = context.notes.slice(before);
  assert.ok(notes.length >= 3);
  assert.ok(Math.abs(notes[1].at-notes[0].at-0.25) < 0.000001);
  const count = context.notes.length;
  f.engine.configure('240', '3/4');
  assert.equal(context.notes.length, count);
  assert.equal(f.contexts.length, 1); assert.equal(context.resumes, 1); assert.equal(context.closes, 0);
  f.engine.stop();
});

test('stopping a pending resume cancels startup and cannot resurrect sound', async () => {
  const f = fixture(); let release;
  f.engine.createContext = () => { const context = f.createContext(); context.resume = () => new Promise(resolve => { release = () => { context.state = 'running'; resolve(); }; }); return context; };
  const starting = f.engine.start({ bpm: 120 });
  f.engine.stop();
  assert.equal(await starting, false);
  release(); await Promise.resolve(); f.timers.tick(5000);
  assert.equal(f.contexts[0].notes.length, 0);
  assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.engine.status, 'stopped');
});

test('resume rejection and stalled startup report failure instead of falsely showing active', async () => {
  for (const stalled of [false,true]) {
    const f = fixture();
    f.engine.createContext = () => { const context = f.createContext(); context.resume = () => stalled ? new Promise(() => {}) : Promise.reject(new Error('NotAllowedError')); return context; };
    const starting = f.engine.start({ bpm: 80 });
    if (stalled) f.timers.tick(3001);
    assert.equal(await starting, false);
    assert.equal(f.engine.status, 'error');
    assert.equal(f.contexts[0].notes.length, 0); assert.equal(f.contexts[0].closes, 1);
    assert.ok(f.states.at(-1).error.length > 0); assert.equal(f.tasks.size, 0);
  }
});

test('device interruption stops audio and a new activation can recover', async () => {
  const f = fixture();
  await f.engine.start({ bpm: 120 });
  f.contexts[0].state = 'interrupted'; f.contexts[0].onstatechange();
  assert.equal(f.engine.status, 'error'); assert.equal(f.contexts[0].closes, 1);
  assert.equal(await f.engine.start({ bpm: 120 }), true);
  assert.equal(f.contexts.length, 2); assert.equal(f.contexts[1].state, 'running');
  f.engine.stop();
});

test('late scheduling skips missed clicks instead of producing a burst', async () => {
  const f = fixture(); await f.engine.start({ bpm: 120 });
  const context = f.contexts[0], count = context.notes.length;
  f.timers.jump(5000); f.engine.schedule();
  assert.equal(context.notes.length, count + 1);
  assert.ok(context.notes.at(-1).at >= context.currentTime);
  f.timers.tick(0); assert.equal(f.beats.length, 0);
  f.engine.stop();
});

test('unsupported or failed audio and malformed tempo never leak a scheduler', async () => {
  const f = fixture();
  f.engine.createContext = () => { throw new Error('AudioContext indisponível'); };
  assert.equal(await f.engine.start({ bpm: 80 }), false); assert.equal(f.tasks.size, 0);
  f.engine.createContext = () => { const context = f.createContext(); context.createOscillator = () => { throw new Error('Device error'); }; return context; };
  assert.equal(await f.engine.start({ bpm: 80 }), false); assert.equal(f.tasks.size, 0);
  assert.equal(f.engine.status, 'error');
  assert.equal(metronomeSettings('invalid', '0/4').bpm, 80);
  assert.equal(metronomeSettings(400, '999/8').beats, 4);
  assert.equal(metronomeSettings(10, '6/8').bpm, 20);
});
