// NSFWA Roccobot: the ZIP must be saved inside a user tap, not after the downloads' awaits.
// Run from the repo root: node tests/nsfwa-save.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// Mobile browsers drop a download started without a user gesture, and headless Chromium does
// not: the page models that rule by letting <a download>.click() count only while a trusted
// event is being dispatched (window.event.isTrusted). The real userscript runs on a page served
// at its real address; GM_xmlhttpRequest answers each image after 1.5 s with a few bytes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const controllaZip = require('./zip-check.cjs');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'NSFWARoccobot.user.js'), 'utf8');
const SHIM = `
window.GM_registerMenuCommand = function () {};
window.GM_xmlhttpRequest = function (o) {
  setTimeout(function () { o.onload({ status: 200, response: new Uint8Array([1, 2, 3, 4]).buffer }); }, 1500);
};
window.__salvati = [];
window.__ignorati = [];
window.__indirizzi = [];
HTMLAnchorElement.prototype.click = function () {
  if (!this.download) return;
  (window.event && window.event.isTrusted ? window.__salvati : window.__ignorati).push(this.download);
  window.__indirizzi.push(this.href);
};`;
const pagina = '<!doctype html><html><head><title>Studio Model - Title - 2x</title></head><body><div class="models">Studio: Studio</div>' +
  ['aaa', 'bbb'].map((n, i) => '<img class="img albumPhoto" src="//nsfwalbum.com/pic/p.png" data-src="https://image.imx.to/u/t/2026/11/06/' + n +
  '.jpg" data-img-id="' + (100 + i) + '" alt="x" />').join('') + '</body></html>';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route(/^https?:\/\//, r => r.request().resourceType() === 'document'
    ? r.fulfill({ contentType: 'text/html', body: pagina }) : r.abort());
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(script);
  const p = await ctx.newPage();
  await p.goto('https://nsfwalbum.com/album/1', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#rb-nsfwplus');
  await p.click('#rb-nsfwplus');
  let pronto = true;
  try { await p.waitForFunction(() => document.getElementById('rb-nsfwplus').textContent === '💾 Save', null, { timeout: 10000 }); }
  catch (e) { pronto = false; }
  if (pronto) await p.click('#rb-nsfwplus');
  await p.waitForTimeout(300);
  // The archive itself, read back: every CRC right, and the entries dated today.
  const byte = await p.evaluate(async () => window.__indirizzi.length
    ? Array.from(new Uint8Array(await (await fetch(window.__indirizzi[0])).arrayBuffer())) : []);
  const zip = byte.length ? controllaZip(byte) : { ok: false, voci: [] };
  const esito = await p.evaluate(() => ({ salvati: window.__salvati, ignorati: window.__ignorati, testo: document.getElementById('rb-nsfwplus').textContent }));
  await b.close();
  const salvato = pronto && esito.salvati.length === 1 && /\.zip$/.test(esito.salvati[0]) && !esito.ignorati.length;
  console.log((zip.ok ? 'OK  ' : 'FALLITA ') + 'archivio integro e con la data di oggi: ' + JSON.stringify(zip));
  const ok = salvato && zip.ok;
  console.log((salvato ? 'OK  ' : 'FALLITA ') + 'salvataggio dentro il tocco: ' + JSON.stringify(esito) + (pronto ? '' : ' (il tasto non ha mai mostrato 💾 Save)'));
  process.exit(ok ? 0 : 1);
})();
