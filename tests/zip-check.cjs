// Helper for the save tests: opens a ZIP built by a script and reads it back.
// Author: Rocco Casadei, a.k.a. Roccobot
// Python's zipfile is the reader: testzip() checks every CRC, and date_time is the DOS date of
// each entry. A writer that leaves the date at zero produces 1980-00-00, which zipfile reads as
// month 0: the check wants today's date, the day the archive was built.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LETTORE = [
  'import sys, zipfile, json',
  'z = zipfile.ZipFile(sys.argv[1])',
  'print(json.dumps({"guasto": z.testzip(), "voci": [[i.filename, list(i.date_time[:3])] for i in z.infolist()]}))'
].join('\n');

module.exports = function controllaZip(byte) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 'prova.zip');
  fs.writeFileSync(file, Buffer.from(byte));
  const esito = JSON.parse(execFileSync('python3', ['-I', '-c', LETTORE, file], { encoding: 'utf8' }));
  const oggi = new Date();
  const data = [oggi.getFullYear(), oggi.getMonth() + 1, oggi.getDate()];
  esito.ok = esito.guasto === null && esito.voci.length > 0 &&
    esito.voci.every((v) => v[1].join('-') === data.join('-'));
  return esito;
};
