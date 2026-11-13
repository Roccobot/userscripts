// ENF Roccobot: the picker's commands are finger-sized on a phone, and a network failure
// reaches the alert in English.
// Run from the repo root: node tests/enf-ui.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript on a page served at its real address of enf-cmnf.cc.
// 1. Phone (Pixel 7, pointer: coarse), three videos: the picker opens, and every button in it
//    (the aim buttons and the two at the bottom) is at least 44 px tall (Rules.md, the phone).
// 2. Desktop, one HLS video, GM_xmlhttpRequest failing with a network error on the playlist:
//    the message inside the alert is UI, so it is English like the rest (Rules.md, 'Anche la
//    UI è in inglese').
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'ENFRoccobot.user.js'), 'utf8');
const SHIM = `
window.unsafeWindow = window;
window.GM_registerMenuCommand = function () {};
window.GM_xmlhttpRequest = function (o) { setTimeout(function () { o.onerror && o.onerror({}); }, 50); return { abort: function () {} }; };
window.__avvisi = [];
window.alert = function (t) { window.__avvisi.push(String(t)); };
delete window.showSaveFilePicker;`;
const video = (n, ext) => '<article id="post-' + n + '"><video src="https://cdn.enf-cmnf.cc/wp-content/uploads/v' + n + '.' + ext + '"></video></article>';
const pagina = (n, ext) => '<!doctype html><html><head><title>Prova</title></head><body>' +
  Array.from({ length: n }, (_, i) => video(i + 1, ext)).join('') + '</body></html>';

async function contesto(b, opt, corpo) {
  const ctx = await b.newContext(opt);
  await ctx.route(/^https?:\/\//, (r) => r.request().resourceType() === 'document'
    ? r.fulfill({ contentType: 'text/html', body: corpo }) : r.abort());
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(script);
  const p = await ctx.newPage();
  await p.goto('https://enf-cmnf.cc/prova/', { waitUntil: 'load' });
  await p.waitForSelector('#rb-enf-dl', { state: 'visible', timeout: 10000 });
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch();
  const esiti = [];

  let { ctx, p } = await contesto(b, devices['Pixel 7'], pagina(3, 'mp4'));
  await p.tap('#rb-enf-dl');
  await p.waitForTimeout(300);
  const tasti = await p.evaluate(() => Array.from(document.querySelectorAll('#rb-enf-menu button'))
    .map((t) => [t.textContent, Math.round(t.getBoundingClientRect().height)]));
  esiti.push([tasti.length >= 5 && tasti.every((t) => t[1] >= 44), 'telefono, tasti dell\'elenco alti almeno 44 px: ' + JSON.stringify(tasti)]);
  await ctx.close();

  ({ ctx, p } = await contesto(b, {}, pagina(1, 'm3u8')));
  await p.click('#rb-enf-dl');
  await p.waitForFunction(() => window.__avvisi.length > 0, null, { timeout: 15000 }).catch(() => {});
  const avvisi = await p.evaluate(() => window.__avvisi);
  const testo = avvisi.join(' | ');
  esiti.push([avvisi.length > 0 && /network/.test(testo) && !/\brete\b/.test(testo), 'errore di rete nell\'avviso, in inglese: ' + JSON.stringify(avvisi)]);
  await ctx.close();

  await b.close();
  for (const [ok, t] of esiti) console.log((ok ? 'OK  ' : 'FALLITA ') + t);
  process.exit(esiti.every((e) => e[0]) ? 0 : 1);
})();
