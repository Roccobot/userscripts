// The install page (index.html): the points of the Vaglio audit, Userscript-25 to -30.
// Run from the repo root: node tests/index-page.cjs [folder holding a copy of the page]
// Author: Rocco Casadei, a.k.a. Roccobot
// The page is served at its real address from the repo; Archivo comes from Google Fonts (through
// the proxy in HTTPS_PROXY when there is one), because a layout measure is worth something only
// with the real font. The font is held back 600 ms, as on a phone network, so its arrival comes
// after the first paint.
// 1. The page asks not to be indexed (choice Motori-01).
// 2. The versions are read from the head of each script (a Range request), not the whole file.
// 3. With every card shown, at 390 and 1,440 px, in both languages: no line of a site, a blurb
//    or the intro starts or ends with one word alone (Roccobot.md, 'Caratteri').
// 4. The 'Details' link answers 20 px above and below its centre (a 44 px touch area).
// 5. Enter on the dot moves the focus to the first install button of the new cards.
// 6. The swap from the fallback to Archivo moves nothing: the layout shift after the page is
//    built stays under 0.01 (it measured 0.096 at 390 px).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const cartella = process.argv[2] || path.join(__dirname, '..');
const radice = path.join(__dirname, '..');

function servi(ctx, range) {
  return ctx.route('https://roccobot.github.io/**', (r) => {
    const nome = decodeURIComponent(new URL(r.request().url()).pathname.replace(/^\/userscripts\/?/, '')) || 'index.html';
    if (/\.user\.js$/.test(nome)) range.push([nome, r.request().headers().range || '']);
    const file = nome === 'index.html' ? path.join(cartella, nome) : path.join(radice, nome);
    if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    const tipo = /\.html$/.test(nome) ? 'text/html' : /\.png$/.test(nome) ? 'image/png' : 'text/javascript';
    r.fulfill({ contentType: tipo, body: fs.readFileSync(file) });
  });
}

async function apri(b, largo, lingua, range) {
  const ctx = await b.newContext({ viewport: { width: largo, height: 844 }, locale: lingua });
  await servi(ctx, range);
  await ctx.route('https://fonts.gstatic.com/**', async (r) => { await new Promise((f) => setTimeout(f, 600)); r.continue(); });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    document.addEventListener('DOMContentLoaded', () => {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift' });
    });
  });
  const p = await ctx.newPage();
  await p.goto('https://roccobot.github.io/userscripts/', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1200);
  return { ctx, p };
}

// The lines of a paragraph, as arrays of words, read from the rectangles of each word.
const RIGHE = () => {
  const out = [];
  const paragrafi = document.querySelectorAll('.intro [lang], .site [lang], .blurb [lang]');
  for (const par of paragrafi) {
    if (!par.offsetParent) continue;
    const righe = [];
    const w = document.createTreeWalker(par, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const re = /[^\s ]+/g;
      let m;
      while ((m = re.exec(t.nodeValue))) {
        const r = document.createRange();
        r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
        const y = Math.round(r.getClientRects()[0].top);
        let riga = righe.find((x) => Math.abs(x.y - y) < 4);
        if (!riga) { riga = { y, parole: [] }; righe.push(riga); }
        riga.parole.push(m[0]);
      }
    }
    righe.sort((a, b) => a.y - b.y);
    out.push(righe.map((r) => r.parole));
  }
  return out;
};

(async () => {
  const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const esiti = [];
  let font = true;

  for (const largo of [390, 1440]) {
    for (const lingua of ['it-IT', 'en-US']) {
      const range = [];
      const { ctx, p } = await apri(b, largo, lingua, range);
      font = font && await p.evaluate(() => document.fonts.check('400 16px Archivo'));
      if (largo === 390 && lingua === 'it-IT') {
        const robots = await p.evaluate(() => (document.querySelector('meta[name="robots"]') || {}).content || '');
        esiti.push([robots === 'noindex', 'meta robots: ' + JSON.stringify(robots)]);
        esiti.push([await p.evaluate(() => window.__cls) < 0.01,
          'spostamento all\'arrivo del font, 390 px: ' + (await p.evaluate(() => Math.round(window.__cls * 10000) / 10000))]);
      }
      await p.focus('#dot');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      if (largo === 390 && lingua === 'it-IT') {
        const fuoco = await p.evaluate(() => document.activeElement === document.querySelector('#more .install'));
        esiti.push([fuoco, 'fuoco sul primo Installa delle schede nuove: ' + fuoco]);
        const dettagli = await p.evaluate(() => {
          const a = document.querySelector('#list .more a');
          a.scrollIntoView({ block: 'center' });
          const r = a.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          return [-20, 20].map((d) => { const el = document.elementFromPoint(x, y + d); return !!el && !!el.closest('.more a'); });
        });
        esiti.push([dettagli.every(Boolean), 'Dettagli risponde a 20 px sopra e sotto il centro: ' + JSON.stringify(dettagli)]);
        await p.waitForTimeout(500);
        const chiesti = range.filter((x) => !x[1]).map((x) => x[0]);
        esiti.push([range.length > 0 && !chiesti.length, 'versioni lette con una richiesta parziale: ' + (chiesti.length ? 'file interi per ' + chiesti.join(', ') : range.length + ' richieste con Range')]);
      }
      await p.waitForTimeout(500);
      const sole = (await p.evaluate(RIGHE)).filter((righe) => righe.length > 1 &&
        [righe[0], righe[righe.length - 1]].some((r) => r.length === 1 || r.join(' ').length < 10));
      esiti.push([!sole.length, largo + ' px, ' + lingua + ', nessuna parola sola a capo: ' + (sole.length ? JSON.stringify(sole) : 'nessuna')]);
      await ctx.close();
    }
  }
  await b.close();
  if (!font) esiti.push([false, 'Archivo non caricato: le misure non valgono (serve la rete verso Google Fonts)']);
  for (const [ok, t] of esiti) console.log((ok ? 'OK  ' : 'FALLITA ') + t);
  process.exit(esiti.every((e) => e[0]) ? 0 : 1);
})();
