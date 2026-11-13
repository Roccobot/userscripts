// The five scripts that run at document-start must stand the absence of <html>.
// Run from the repo root: node tests/document-start.cjs [folder holding copies of the scripts]
// Author: Rocco Casadei, a.k.a. Roccobot
// At document-start the manager may run a script before <html> exists, so
// document.documentElement is null (Rules.md, the section on document-start). Playwright's
// addInitScript runs at exactly that moment, and the first init script records it: a bench in
// which <html> already exists would pass without measuring anything. Each script runs for real
// on a page served at its real address, with the GM_* functions it uses stubbed; the checks are
// the work each script does on the DOM, read once the page has loaded.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const cartella = process.argv[2] || path.join(__dirname, '..');
const leggi = (nome) => fs.readFileSync(path.join(cartella, nome), 'utf8');

const SPIA = 'window.__senzaHtml = document.documentElement === null; window.__errori = [];' +
  "window.addEventListener('error', function (e) { window.__errori.push(String(e.message)); });";
const GM = 'window.unsafeWindow = window; window.GM_info = { script: { version: "prova" } };' +
  'window.GM_registerMenuCommand = function () {}; window.GM_xmlhttpRequest = function () {};' +
  'window.GM_download = function () {};';

const CASI = [
  {
    nome: 'LotRWiki', file: 'LotRWikiRoccobot.user.js', url: 'https://lotr.fandom.com/wiki/Frodo',
    pagina: '<!doctype html><html><head><title>Frodo</title></head><body class="skin-fandomdesktop">' +
      '<div class="page__right-rail" style="height:50px">rail</div></body></html>',
    controlla: () => ({
      stile: !!document.getElementById('rb-lotrwiki'),
      colonna: document.querySelector('.page__right-rail').getBoundingClientRect().height
    }),
    buono: (r) => r.stile && r.colonna === 0
  },
  {
    nome: 'NSFWA, pagina foto', file: 'NSFWARoccobot.user.js', url: 'https://nsfwalbum.com/photo/1',
    pagina: '<!doctype html><html><head><title>Photo</title><style>.hide{display:none}</style></head><body>' +
      '<img id="zoom" class="hide" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="200" height="200">' +
      '<div class="magnify-lens" style="width:50px;height:50px">lens</div></body></html>',
    controlla: () => ({
      zoom: getComputedStyle(document.getElementById('zoom')).display,
      lente: getComputedStyle(document.querySelector('.magnify-lens')).display
    }),
    buono: (r) => r.zoom === 'block' && r.lente === 'none'
  },
  {
    nome: 'PH', file: 'PHRoccobot.user.js', url: 'https://www.pornhub.com/view_video.php?viewkey=abc',
    pagina: '<!doctype html><html><head><title>Video</title></head><body>' +
      '<header><span><a href="/ai">AI</a></span></header><p>video</p></body></html>',
    // After the load: the Google popup and a link to a video page added on their own.
    dopo: () => {
      const g = document.createElement('div'); g.id = 'credential_picker_container'; document.body.appendChild(g);
      const a = document.createElement('a'); a.href = '/view_video.php?viewkey=def'; a.textContent = 'altro'; document.body.appendChild(a);
    },
    controlla: () => ({
      stile: !!document.getElementById('rb-ph-stile'),
      tastoAI: getComputedStyle(document.querySelector('header span')).display,
      popup: !!document.getElementById('credential_picker_container'),
      schedaNuova: document.querySelector('a[href*="viewkey=def"]').target
    }),
    buono: (r) => r.stile && r.tastoAI === 'none' && !r.popup && r.schedaNuova === '_blank'
  },
  {
    nome: 'Qwant', file: 'QwantRoccobot.user.js', url: 'https://www.qwant.com/?q=prova&t=web',
    pagina: '<!doctype html><html><head><title>Qwant</title></head><body><main>risultati</main></body></html>',
    controlla: () => ({
      stile: Array.from(document.querySelectorAll('style')).some((s) => s.textContent.indexOf('utm_medium=smartbanner') !== -1)
    }),
    buono: (r) => r.stile
  },
  {
    nome: 'ENF', file: 'ENFRoccobot.user.js', url: 'https://enf-cmnf.cc/prova/',
    pagina: '<!doctype html><html><head><title>Prova</title></head><body><article>' +
      '<video src="https://cdn.enf-cmnf.cc/wp-content/uploads/prova.mp4"></video></article></body></html>',
    controlla: () => {
      const b = document.getElementById('rb-enf-dl');
      return { tasto: !!b && getComputedStyle(b).display !== 'none' };
    },
    buono: (r) => r.tasto
  }
];

(async () => {
  const b = await chromium.launch();
  let tutto = true;
  for (const c of CASI) {
    const ctx = await b.newContext();
    await ctx.route(/^https?:\/\//, (r) => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: c.pagina }) : r.abort());
    await ctx.addInitScript(SPIA);
    await ctx.addInitScript(GM);
    await ctx.addInitScript(leggi(c.file));
    const p = await ctx.newPage();
    await p.goto(c.url, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    if (c.dopo) { await p.evaluate(c.dopo); await p.waitForTimeout(300); }
    const senzaHtml = await p.evaluate(() => window.__senzaHtml);
    const errori = await p.evaluate(() => window.__errori);
    const r = await p.evaluate(c.controlla);
    const ok = senzaHtml && !errori.length && c.buono(r);
    console.log((ok ? 'OK  ' : 'FALLITA ') + c.nome + ': ' + JSON.stringify(r) +
      (errori.length ? ' errori: ' + errori.join(' | ') : '') +
      (senzaHtml ? '' : ' (il banco aveva già <html>: la prova non misura niente)'));
    tutto = tutto && ok;
    await ctx.close();
  }
  await b.close();
  process.exit(tutto ? 0 : 1);
})();
