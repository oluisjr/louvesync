const names = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];

export function pitchNote(frequency) {
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearest = Math.round(midi);
  return { name: names[((nearest % 12) + 12) % 12], octave: Math.floor(nearest / 12) - 1, cents: Math.round(100 * (midi - nearest)) };
}

export function detectPitch(samples, sampleRate) {
  // Normalize the correlation so the decay of a plucked string does not move the needle.
  const stride = 4;
  const shortest = Math.floor(sampleRate / 1100 / stride);
  const longest = Math.ceil(sampleRate / 40 / stride);
  const length = samples.length - longest * stride;
  if (shortest < 2 || length < 512) return 0;
  let power = 0;
  for (let i = 0; i < length; i += stride) power += samples[i] ** 2;
  if (power * stride / length < 0.000025) return 0;

  const scores = new Float32Array(longest + 1);
  let best = 0;
  for (let lag = shortest; lag <= longest; lag++) {
    let dot = 0, delayedPower = 0;
    for (let i = 0; i < length; i += stride) {
      const delayed = samples[i + lag * stride];
      dot += samples[i] * delayed;
      delayedPower += delayed ** 2;
    }
    scores[lag] = dot / Math.sqrt(power * delayedPower) || 0;
    best = Math.max(best, scores[lag]);
  }
  if (best < .78) return 0;
  for (let lag = shortest + 1; lag < longest; lag++) {
    const [left, center, right] = [scores[lag - 1], scores[lag], scores[lag + 1]];
    if (center < best * .92 || center <= left || center < right) continue;
    // Prefer the first strong peak to avoid jumping between octaves.
    const correction = (right - left) / (2 * (2 * center - left - right));
    return sampleRate / ((lag + correction) * stride);
  }
  return 0;
}
