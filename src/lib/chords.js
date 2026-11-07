import { keyDistance, transposeKey } from './domain.js';

const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const pitches = [0, 2, 4, 5, 7, 9, 11];
const sharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const keyDirective = /^\{key:\s*([A-G][#b]?m?)\s*\}$/i;
const chordRoot = '(?:[A-G][#b]*|[#b]?[1-7][#b]?)';
const chordQuality = '(?:m|M|maj|dim|sus|add|aug|º|°|ø|\\+|-|[0-9()#b])*';
const chordSymbol = new RegExp('^' + chordRoot + chordQuality + '(?:/(?:' + chordRoot + '|[0-9]+)' + chordQuality + ')?$');
export function isChordSymbol(value) { return chordSymbol.test(String(value || '')); }
const rootPitch = key => {
  const match = String(key || '').match(/^([A-G])([#b]*)/);
  return match ? pitches[letters.indexOf(match[1])] + [...match[2]].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0) : 0;
};

function degreeNote(value, key) {
  const match = value.match(/^([#b]?)([1-7])([#b]?)(.*)$/);
  if (!match) return value;
  const degree = Number(match[2]) - 1;
  const accidentals = match[1] + match[3];
  const adjustment = [...accidentals].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0);
  const letter = (Math.max(0, letters.indexOf(String(key || 'C')[0])) + degree) % 7;
  const pitch = rootPitch(key) + pitches[degree] + adjustment;
  const difference = ((pitch - pitches[letter]) % 12 + 18) % 12 - 6;
  const accidental = difference > 0 ? '#'.repeat(difference) : 'b'.repeat(-difference);
  return letters[letter] + accidental + match[4];
}

export function degreeChord(chord, key = 'C') {
  return String(chord).split('/').map(part => degreeNote(part, key)).join('/');
}

export function transposeChord(chord, steps = 0) {
  const transpose = note => !steps ? note : (note.includes('b') ? flat : sharp)[((rootPitch(note) + steps) % 12 + 12) % 12];
  return String(chord).replace(/^([A-G][#b]*)(.*?)(?:\/([A-G][#b]*)(.*))?$/, (_, root, quality, bass, tail) =>
    transpose(root) + quality + (bass ? '/' + transpose(bass) + tail : ''));
}

// ChordPro-style key directives describe the source arrangement, including
// modulations. The selected key/vocal shifts the entire arrangement together.
// Numeric degrees remain in storage; resolution happens only for display/print.
export function renderChordText(text, baseKey = 'C', steps = 0) {
  const lines = String(text || '').split('\n');
  const declared = lines.find(line => keyDirective.test(line.trim()))?.trim().match(keyDirective)?.[1];
  const selected = /^[A-G][#b]?m?$/.test(baseKey) ? baseKey : declared || 'C';
  const reference = declared || selected;
  const shift = keyDistance(reference, selected) + steps;
  const targetKey = key => transposeKey(transposeKey(selected, steps), keyDistance(reference,key));
  let sectionKey = reference;
  return lines.flatMap(line => {
    const directive = line.trim().match(keyDirective);
    if (directive) { sectionKey = directive[1]; return []; }
    let rendered = line.replace(/\[([^\]]+)\]/g, (original, chord) => {
      if (!isChordSymbol(chord)) return original;
      const resolved = /^[#b]?[1-7]/.test(chord) ? degreeChord(chord,targetKey(sectionKey)) : transposeChord(chord,shift);
      return '[' + resolved + ']';
    });
    if (/^(?:INTRO|REFRÃO|PONTE|FINAL)\b/i.test(rendered)) {
      rendered = rendered.replace(/\b(EM|PARA) ([A-G][#b]?m?)\b/g, (_, label, key) => label + ' ' + targetKey(key));
    }
    return [rendered];
  }).join('\n');
}

export function performanceKey(song, event) {
  return event?.keyBySong?.[song?.id] || song?.vocal_keys?.[event?.singerBySong?.[song?.id]] || song?.key || 'C';
}
