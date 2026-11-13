// PH Roccobot: the file name decodes the title's entities without innerHTML, and the red
// states of the pill are readable (WCAG AA, 4.5).
// Run from the repo root: node tests/ph-download.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript on a video page served at its real address. The page declares
// flashvars with one MP4 and a title full of HTML entities; GM_download records the file name
// and fails, so the pill goes to its red state ('opened', the fallback that opens the address).
// A spy on the innerHTML setter counts every assignment: the repo rule is never innerHTML.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'PHRoccobot.user.js'), 'utf8');
const SHIM = `
window.unsafeWindow = window;
window.GM_registerMenuCommand = function () {};
window.GM_xmlhttpRequest = function () {};
window.__nomi = [];
window.GM_download = function (o) { window.__nomi.push(o.name); setTimeout(function () { o.onerror(new Error('prova')); }, 50); return { abort: function () {} }; };
window.open = function () { return null; };
window.__innerHTML = 0;
(function () {
  var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, get: d.get, set: function (v) { window.__innerHTML++; return d.set.call(this, v); }
  });
})();`;
const PAGINA = '<!doctype html><html><head><title>Video</title><script>' +
  'var flashvars_abc = { video_title: "Tom &amp; Jerry &#39;live&#39; &lt;3", mediaDefinitions: [' +
  '{ format: "mp4", quality: "720", videoUrl: "https://ev.phncdn.com/videos/720P.mp4" }] };' +
  '</script></head><body><p>video</p></body></html>';

function luminanza(rgb) {
  const c = rgb.match(/\d+/g).slice(0, 3).map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrasto(a, b) {
  const x = luminanza(a), y = luminanza(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route(/^https?:\/\//, (r) => r.request().resourceType() === 'document'
    ? r.fulfill({ contentType: 'text/html', body: PAGINA }) : r.abort());
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(script);
  const p = await ctx.newPage();
  await p.goto('https://www.pornhub.com/view_video.php?viewkey=abc', { waitUntil: 'load' });
  await p.waitForSelector('#rb-ph-dl');
  await p.click('#rb-ph-dl');
  await p.waitForFunction(() => /opened/.test(document.getElementById('rb-ph-dl').textContent), null, { timeout: 10000 });
  const r = await p.evaluate(() => {
    const s = getComputedStyle(document.getElementById('rb-ph-dl'));
    return { nomi: window.__nomi, innerHTML: window.__innerHTML, testo: s.color, sfondo: s.backgroundColor };
  });
  await b.close();
  const rapporto = Math.round(contrasto(r.testo, r.sfondo) * 100) / 100;
  const nomeOk = r.nomi.length === 1 && r.nomi[0] === "Tom & Jerry 'live' 3.mp4";
  const esiti = [
    [nomeOk, 'nome del file con le entità decodificate: ' + JSON.stringify(r.nomi)],
    [r.innerHTML === 0, 'assegnazioni di innerHTML: ' + r.innerHTML],
    [rapporto >= 4.5, 'contrasto dello stato rosso: ' + rapporto + ' (' + r.testo + ' su ' + r.sfondo + ')']
  ];
  for (const [ok, testo] of esiti) console.log((ok ? 'OK  ' : 'FALLITA ') + testo);
  process.exit(esiti.every((e) => e[0]) ? 0 : 1);
})();
