import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, pitchNote } from '../src/lib/tuner.js';

test('decaying chords of harmonics retain the fundamental and accurate tuning direction',()=>{
  for(const sampleRate of [44100,48000]){
    for(const [reference,detune] of [[41.203,11],[82.407,-19],[110,24],[329.628,-16],[440,0]]){
      const frequency=reference*2**(detune/1200);
      const samples=Float32Array.from({length:4096},(_,i)=>{
        const phase=2*Math.PI*i*frequency/sampleRate;
        return .3*Math.exp(-i/4200)*(.5*Math.sin(phase)+.7*Math.sin(phase*2)+.25*Math.sin(phase*3));
      });
      const result=detectPitch(samples,sampleRate);
      assert.ok(Math.abs(pitchNote(result).cents-detune)<=2,`${frequency} Hz was read as ${result}`);
    }
    assert.equal(detectPitch(new Float32Array(4096),sampleRate),0);
  }
});
