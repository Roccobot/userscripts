// Fapopedia Roccobot: the ZIP must be saved inside a user tap, not after the downloads' awaits.
// Run from the repo root: node tests/fapopedia-save.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// Same model as tests/nsfwa-save.cjs: <a download>.click() counts only while a trusted event is
// being dispatched (window.event.isTrusted), because headless Chromium downloads anyway. The
// real userscript runs at document-idle, so it is added once the page has loaded; the page is
// served at its real address, and GM_xmlhttpRequest answers each image after 1.5 s.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'FapopediaRoccobot.user.js'), 'utf8');
const SHIM = `
window.GM_registerMenuCommand = function () {};
window.GM_xmlhttpRequest = function (o) {
  setTimeout(function () { o.onload({ status: 200, response: new Uint8Array([1, 2, 3, 4]).buffer }); }, 1500);
};
window.__salvati = [];
window.__ignorati = [];
HTMLAnchorElement.prototype.click = function () {
  if (!this.download) return;
  (window.event && window.event.isTrusted ? window.__salvati : window.__ignorati).push(this.download);
};`;
const pagina = '<!doctype html><html><head><title>Model - Gallery</title></head><body><h1>Model</h1>' +
  ['0001', '0002'].map(n => '<img src="https://fapopedia.net/photos/g/a/model/1000//t_' + n + '.jpg" alt="x" />').join('') + '</body></html>';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route(/^https?:\/\//, r => r.request().resourceType() === 'document'
    ? r.fulfill({ contentType: 'text/html', body: pagina }) : r.abort());
  await ctx.addInitScript(SHIM);
  const p = await ctx.newPage();
  await p.goto('https://fapopedia.net/gallery/model', { waitUntil: 'load' });
  await p.addScriptTag({ content: script });
  await p.waitForSelector('#rb-fap-dl');
  await p.click('#rb-fap-dl');
  let pronto = true;
  try { await p.waitForFunction(() => document.getElementById('rb-fap-dl').textContent === '💾 Save', null, { timeout: 10000 }); }
  catch (e) { pronto = false; }
  if (pronto) {
    // a page change must not wipe the pending save (the script refreshes the label on mutations)
    await p.evaluate(() => document.body.appendChild(document.createElement('div')));
    await p.waitForTimeout(700);
    pronto = await p.evaluate(() => document.getElementById('rb-fap-dl').textContent === '💾 Save');
    if (pronto) await p.click('#rb-fap-dl');
  }
  await p.waitForTimeout(300);
  const esito = await p.evaluate(() => ({ salvati: window.__salvati, ignorati: window.__ignorati, testo: document.getElementById('rb-fap-dl').textContent }));
  await b.close();
  const ok = pronto && esito.salvati.length === 1 && /\.zip$/.test(esito.salvati[0]) && !esito.ignorati.length;
  console.log((ok ? 'OK  ' : 'FALLITA ') + 'salvataggio dentro il tocco: ' + JSON.stringify(esito) + (pronto ? '' : ' (il tasto non mostra 💾 Save al momento del tocco)'));
  process.exit(ok ? 0 : 1);
})();
