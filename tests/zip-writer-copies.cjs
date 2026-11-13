// The ZIP writer has three copies (ENF, NSFWA, Fapopedia), because each script is a single
// file: this test keeps them identical.
// Run from the repo root: node tests/zip-writer-copies.cjs [folder holding copies of the scripts]
// Author: Rocco Casadei, a.k.a. Roccobot
// The writer runs from 'var TABELLA_CRC' to the end of zipDaVoci; comments and indentation may
// differ between the copies, the code may not.
const fs = require('fs');
const path = require('path');
const cartella = process.argv[2] || path.join(__dirname, '..');

function writer(nome) {
  const s = fs.readFileSync(path.join(cartella, nome), 'utf8');
  const a = s.indexOf('var TABELLA_CRC');
  const b = s.indexOf("{ type: 'application/zip' });", s.indexOf('function zipDaVoci'));
  if (a < 0 || b < 0) return null;
  return s.slice(a, b).split('\n')
    .map((r) => r.replace(/\/\/.*$/, '').trim())
    .filter(Boolean).join('\n');
}

const base = writer('ENFRoccobot.user.js');
let tutto = !!base;
for (const nome of ['NSFWARoccobot.user.js', 'FapopediaRoccobot.user.js']) {
  const ok = !!base && writer(nome) === base;
  console.log((ok ? 'OK  ' : 'FALLITA ') + nome + ': ' + (ok ? 'writer uguale a quello di ENF' : 'writer diverso da quello di ENF, o assente'));
  tutto = tutto && ok;
}
process.exit(tutto ? 0 : 1);
