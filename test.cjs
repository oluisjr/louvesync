const fs = require('fs');
const html = fs.readFileSync('cifras_html.txt', 'utf-8');

const idMatch = html.match(/id="(cifra_core|core[^"]*)"/i);
const classMatch = html.match(/class="(core-cifra[^"]*)"/i);

console.log("ID MATCH:", idMatch ? idMatch[0] : "NO ID");
console.log("CLASS MATCH:", classMatch ? classMatch[0] : "NO CLASS");

// Find what wraps the chords
const chordContext = html.match(/.{0,100}<span data-chord="Bm">Bm<\/span>.{0,100}/i);
console.log("CONTEXT:", chordContext ? chordContext[0] : "NOT FOUND");
