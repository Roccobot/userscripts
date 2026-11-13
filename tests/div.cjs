// Decent Image Viewer: the image page and the options page, on the points the Vaglio audit
// found (Userscript-18, -19, -20, -21, -23).
// Run from the repo root: node tests/div.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript, injected once the page has loaded (Rules.md: at document-start there is
// no <head>, and GM_addStyle fails), with the GM_* functions stubbed and an archive in memory.
// 1. 'Download' clicks an <a download> inside the user's click, and never goes to GM_download,
//    which is not among the grants: here a GM_download spy exists, as if a manager offered it.
// 2. 'Copy image URL' says 'Copy failed' when the clipboard refuses later, with a rejected
//    promise.
// 3. A horizontal-only wheel event does not count in the gesture (choice Rotella-01): a vertical
//    event that follows it within the gesture pause gives the same zoom as on its own (before,
//    the horizontal event taught 'finger', and the vertical one zoomed continuously).
// 4. Options page on a phone, browser in English: the page declares lang="en", and a point
//    20 px from the centre of a checkbox (outside the 26 px box, inside a 44 px area) belongs to
//    the checkbox or to a label of it, and a click there toggles it. The point is read with
//    elementFromPoint and clicked with the mouse: a tap would go through Chromium's touch
//    adjustment, which moves it to the nearest control and hides the size of the target.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const radice = path.join(__dirname, '..');
const script = fs.readFileSync(process.argv[2] || path.join(radice, 'DIVRoccobot.user.js'), 'utf8');
const guscio = fs.readFileSync(path.join(radice, 'DIVOptions.html'), 'utf8');

const SHIM = `
window.__archivio = window.__archivio || {};
window.GM_getValue = function (k, d) { return k in window.__archivio ? window.__archivio[k] : d; };
window.GM_setValue = function (k, v) { window.__archivio[k] = v; };
window.GM_addStyle = function (css) { var s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
window.GM_registerMenuCommand = function () {};
window.GM_openInTab = function () {};
window.GM_xmlhttpRequest = function () {};
window.GM_info = { script: { version: 'prova' } };
window.__gmDownload = 0;
window.GM_download = function () { window.__gmDownload++; };
window.__clic = [];
HTMLAnchorElement.prototype.click = function () {
  if (this.hasAttribute('download')) window.__clic.push({ nome: this.getAttribute('download'), tocco: !!(window.event && window.event.isTrusted) });
};`;

async function immagine(b) {
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.setContent('<body style="margin:0;background:linear-gradient(90deg,#c33,#36c)"></body>');
  const png = await p.screenshot();
  await p.close();
  return png;
}

async function paginaImmagine(b, png) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, locale: 'en-US' });
  await ctx.route('https://example.com/**', (r) => r.fulfill({ contentType: 'image/png', body: png }));
  const p = await ctx.newPage();
  await p.goto('https://example.com/prova.png', { waitUntil: 'load' });
  await p.evaluate(SHIM);
  await p.evaluate(script);
  await p.waitForSelector('#dv-wrap');
  await p.waitForTimeout(200);
  return { ctx, p };
}

async function voce(p, testo) {
  await p.mouse.click(500, 400, { button: 'right' });
  await p.waitForSelector('#dv-menu:not([hidden])');
  await p.click('#dv-menu .dv-mv >> text=' + testo);
  await p.waitForTimeout(200);
}

const larghezza = (p) => p.evaluate(() => Math.round(document.querySelector('#dv-wrap img').getBoundingClientRect().width * 100) / 100);

(async () => {
  const b = await chromium.launch();
  const esiti = [];
  const png = await immagine(b);

  // 1. Download
  let { ctx, p } = await paginaImmagine(b, png);
  await voce(p, 'Download');
  const scarica = await p.evaluate(() => ({ clic: window.__clic, gmDownload: window.__gmDownload }));
  esiti.push([scarica.gmDownload === 0 && scarica.clic.length === 1 && scarica.clic[0].tocco,
    "'Download' col clic diretto dentro il tocco, senza GM_download: " + JSON.stringify(scarica)]);

  // 2. Clipboard refusing later
  await p.evaluate(() => { navigator.clipboard.writeText = function () { return Promise.reject(new DOMException('no', 'NotAllowedError')); }; });
  await voce(p, 'Copy image URL');
  const avviso = await p.evaluate(() => { const t = document.getElementById('dv-toast'); return t ? t.textContent : ''; });
  esiti.push([avviso === 'Copy failed', "rifiuto tardivo degli appunti: avviso '" + avviso + "'"]);
  await ctx.close();

  // 3. Horizontal-only event in the gesture. The events are built in the page: the ones of
  // Playwright's mouse.wheel carry wheelDeltaY 120, the strong wheel signature, which opens a
  // gesture of its own whatever came before and would hide the difference.
  const ruota = (orizzontale) => p.evaluate((orizzontale) => new Promise((fatto) => {
    const img = document.querySelector('#dv-wrap img');
    const ev = (dx, dy) => img.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, deltaMode: 0, clientX: 500, clientY: 400, bubbles: true, cancelable: true }));
    if (orizzontale) ev(30, 0);
    setTimeout(() => { ev(0, -50); setTimeout(fatto, 150); }, 100);
  }), orizzontale);
  ({ ctx, p } = await paginaImmagine(b, png));
  await ruota(false);
  const solo = await larghezza(p);
  await ctx.close();
  ({ ctx, p } = await paginaImmagine(b, png));
  await ruota(true);
  const dopoOrizzontale = await larghezza(p);
  await ctx.close();
  esiti.push([solo === dopoOrizzontale, 'evento orizzontale prima di uno verticale: larghezza ' + dopoOrizzontale + ' px contro ' + solo + ' px senza']);

  // 4. Options page on a phone, in English
  ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'en-US' });
  await ctx.route('https://roccobot.github.io/**', (r) => r.fulfill({ contentType: 'text/html', body: guscio }));
  p = await ctx.newPage();
  await p.goto('https://roccobot.github.io/userscripts/DIVOptions.html', { waitUntil: 'load' });
  await p.evaluate(SHIM);
  await p.evaluate(script);
  await p.waitForSelector('.dv-o-row');
  const lingua = await p.evaluate(() => document.documentElement.lang);
  esiti.push([lingua === 'en', 'pannello in inglese, lang della pagina: ' + lingua]);
  const caselle = await p.evaluate(() => Array.from(document.querySelectorAll('.dv-o-row input[type=checkbox]'))
    .filter((c) => c.offsetParent).map((c) => c.id));
  for (const id of caselle) {
    const c = await p.evaluate((id) => {
      const el = document.getElementById(id);
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { id: id, x: r.x + r.width / 2, y: r.y + r.height / 2, lato: Math.round(r.width) };
    }, id);
    const esito = [];
    for (const [dx, dy] of [[-20, 0], [0, 20]]) {
      const suo = await p.evaluate((a) => {
        const el = document.elementFromPoint(a.x, a.y);
        const cas = document.getElementById(a.id);
        return !!el && (el === cas || (el.closest('label') || {}).control === cas);
      }, { id: c.id, x: c.x + dx, y: c.y + dy });
      const prima = await p.evaluate((id) => document.getElementById(id).checked, c.id);
      await p.mouse.click(c.x + dx, c.y + dy);
      await p.waitForTimeout(100);
      esito.push(suo && (await p.evaluate((id) => document.getElementById(id).checked, c.id)) !== prima);
    }
    esiti.push([esito.every(Boolean), 'telefono, casella ' + c.id + ' (' + c.lato + ' px) commutata a 20 px dal centro: ' + JSON.stringify(esito)]);
  }
  if (!caselle.length) esiti.push([false, 'telefono: nessuna casella nel pannello']);
  await ctx.close();

  await b.close();
  for (const [ok, t] of esiti) console.log((ok ? 'OK  ' : 'FALLITA ') + t);
  process.exit(esiti.every((e) => e[0]) ? 0 : 1);
})();
