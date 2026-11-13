// ENF Roccobot: the save step must end in a real file before the button says Done, and the
// button's text stays readable on the green of 'Save' and 'Done' (WCAG AA, 4.5).
// Run from the repo root: node tests/enf-save.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// Bench for ENF Roccobot's save step: the real userscript on a page served at its real address.
// GM_* are shims over fetch. The browser's rule is modelled on purpose, because headless Chromium
// neither enforces it nor lets user activation expire: an <a download> click counts only when it
// runs inside the handler of a real (trusted) user event; a click fired later is dropped.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'ENFRoccobot.user.js'), 'utf8');
const SHIM = `
  window.unsafeWindow = window;
  window.GM_info = { scriptHandler: 'Violentmonkey', downloadMode: 'native' };
  window.GM_registerMenuCommand = function () {};
  window.GM_download = function (o) { setTimeout(function () { o.onerror && o.onerror({ error: 'not_succeeded' }); }, 50); return { abort: function () {} }; };
  window.GM_xmlhttpRequest = function (o) {
    fetch(o.url).then(async function (r) {
      var corpo = o.responseType === 'blob' ? await r.blob() : await r.text();
      var t = r.headers.get('content-type') || '';
      o.onload && o.onload({ status: r.status, responseHeaders: 'content-type: ' + t, response: corpo, responseText: typeof corpo === 'string' ? corpo : '' });
    }, function () { o.onerror && o.onerror({}); });
    return { abort: function () {} };
  };
  window.__salvati = [];
  var clic = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && !(window.event && window.event.isTrusted)) return;   // dropped
    window.__salvati.push(this.download);
    return clic.call(this);
  };
`;
const PICKER = `
  window.__scritti = [];
  window.showSaveFilePicker = async function (o) {
    return { createWritable: async function () {
      var parti = [];
      return { write: async function (b) { parti.push(b); }, close: async function () { window.__scritti.push(o.suggestedName); }, abort: async function () {} };
    } };
  };
`;
const PAGINA = '<!doctype html><html><head><title>Prova ENF</title></head><body><article><video src="https://cdn.enf-cmnf.cc/wp-content/uploads/prova.mp4" controls></video></article></body></html>';

function luminanza(rgb) {
  const c = rgb.match(/\d+/g).slice(0, 3).map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrasto(a, b) {
  const x = luminanza(a), y = luminanza(b);
  return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100;
}
const colori = (p) => p.evaluate(() => {
  const s = getComputedStyle(document.getElementById('rb-enf-dl'));
  return [s.color, s.backgroundColor];
});

async function giro(b, nome, opt, picker) {
  const ctx = await b.newContext({ ...opt, acceptDownloads: true });
  await ctx.route('https://enf-cmnf.cc/**', r => r.fulfill({ contentType: 'text/html', body: PAGINA }));
  // The video answers after 6 s: a real download outlasts Chrome's user activation (about 5 s).
  await ctx.route('https://cdn.enf-cmnf.cc/**', async r => {
    if (r.request().headers().range) return r.fulfill({ status: 206, contentType: 'video/mp4', body: Buffer.alloc(1024, 7) });
    await new Promise(f => setTimeout(f, 6000));
    r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(200000, 7) });
  });
  // Headless Chromium has the File System Access dialog everywhere; Android Chromium and Firefox
  // do not, so the cases without it remove it.
  await ctx.addInitScript(SHIM + (picker ? PICKER : 'delete window.showSaveFilePicker; delete window.showDirectoryPicker;'));
  await ctx.addInitScript(script);
  const p = await ctx.newPage();
  const scaricati = [];
  p.on('download', d => scaricati.push(d.suggestedFilename()));
  await p.goto('https://enf-cmnf.cc/prova/');
  await p.waitForSelector('#rb-enf-dl', { state: 'visible', timeout: 10000 });
  await p.click('#rb-enf-dl');
  const etichette = [];
  const contrasti = [];
  let fatto = false, salvato = false;
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(250);
    const t = await p.textContent('#rb-enf-dl');
    if (etichette[etichette.length - 1] !== t) {
      etichette.push(t);
      if (/Save|Done/.test(t)) contrasti.push(contrasto(...(await colori(p))));
    }
    const s = await p.evaluate(() => (window.__salvati || []).length + (window.__scritti || []).length);
    if (/Done/.test(t)) { fatto = true; salvato = s > 0; break; }
    if (/Save/.test(t)) await p.click('#rb-enf-dl');
  }
  await ctx.close();
  const leggibile = contrasti.length > 0 && contrasti.every((c) => c >= 4.5);
  const ok = fatto && salvato && leggibile;
  console.log((ok ? 'OK  ' : 'FALLITA ') + nome + ': ' + etichette.join(' > ') + (fatto && !salvato ? '  (Done senza file)' : '') +
    '; contrasto del testo su Save e Done: ' + contrasti.join(', '));
  return ok;
}

(async () => {
  const b = await chromium.launch();
  const r = [
    await giro(b, 'telefono, senza finestra Salva', devices['Pixel 7'], false),
    await giro(b, 'desktop, con la finestra Salva', {}, true),
    await giro(b, 'desktop, senza la finestra Salva', {}, false),
  ];
  await b.close();
  process.exit(r.every(Boolean) ? 0 : 1);
})();
