// NSFWA Roccobot: on a photo page the right press must land on the real photo, and the script
// must never turn the clicks off on the photo or on an element that contains it.
// Run from the repo root: node tests/nsfwa-photo.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript on a page served at its real address. The page is a trimmed copy of the
// photo markup measured on 2026-11-20: <html class="magnifying"> while the lens is on, the photo
// inside div.magnify next to div.magnify-lens. Up to 1.2.5 the script turned the clicks off on
// every element with 'magnif' in its class, <html> and the wrapper included, and Vivaldi then
// opened an empty SVG at 'open image in new tab' (Rocco's report of 2026-11-20).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'NSFWARoccobot.user.js'), 'utf8');
const SHIM = 'window.GM_registerMenuCommand = function () {}; window.GM_xmlhttpRequest = function () {};';
const FOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#888"/></svg>').toString('base64');
const ESCA = '<svg id="esca" width="800" height="600" style="position:absolute;left:0;top:0;z-index:9999"></svg>';
// The third case is a page whose own style beats the script's rule on the lens: in Rocco's
// Vivaldi the lens stayed in sight with 1.2.6 (2026-11-20), whose only weapon was that rule.
const VINCE = '<style>html body div.magnify > div.magnify-lens{display:block!important}</style>';
const pagina = (esca, vince) => '<!doctype html><html class="magnifying"><head><title>Photo</title>' + (vince ? VINCE : '') + '</head><body style="margin:0">' +
  '<div id="page"><div class="text-center photoContainer"><div id="fullSizeToggle" style="position:relative">' +
  '<div class="magnify" style="position:relative;display:inline-block">' +
  '<img id="zoom" src="' + FOTO + '" width="800" height="600" alt="photo">' +
  '<div class="magnify-lens" style="position:absolute;left:300px;top:200px;width:200px;height:200px;z-index:99"></div>' +
  '</div>' + (esca ? ESCA : '') + '</div></div></div></body></html>';
const CASI = [
  ['senza esca', false, false],
  ['con un SVG vuoto sopra la foto', true, false],
  ['con una regola della pagina che rimostra la lente', false, true],
];
(async () => {
  const b = await chromium.launch();
  let tutto = true;
  for (const [nome, esca, vince] of CASI) {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
    await ctx.route(/^https?:\/\//, r => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: pagina(esca, vince) }) : r.abort());
    await ctx.addInitScript(SHIM);
    await ctx.addInitScript(script);
    const p = await ctx.newPage();
    await p.goto('https://nsfwalbum.com/photo/1', { waitUntil: 'load' });
    await p.waitForTimeout(300);
    // The right press at the centre of the photo, as the context menu does.
    await p.mouse.move(400, 300);
    await p.mouse.down({ button: 'right' });
    await p.mouse.up({ button: 'right' });
    await p.waitForTimeout(100);
    const r = await p.evaluate(() => {
      const pe = (el) => getComputedStyle(el).pointerEvents;
      const z = document.getElementById('zoom');
      return {
        inCima: document.elementFromPoint(400, 300) === z,
        clicHtml: pe(document.documentElement),
        clicContenitore: pe(document.querySelector('.magnify')),
        clicFoto: pe(z),
        stileFoto: z.getAttribute('style'),
        lente: [...document.querySelectorAll('.magnify-lens')].map((l) => getComputedStyle(l).display).join() || 'tolta',
        esca: document.getElementById('esca') ? pe(document.getElementById('esca')) : '-'
      };
    });
    const ok = r.inCima && r.clicHtml === 'auto' && r.clicContenitore === 'auto' && r.clicFoto === 'auto' &&
      r.stileFoto === null && r.lente === 'tolta' && (!esca || r.esca === 'none');
    console.log((ok ? 'OK  ' : 'FALLITA ') + nome + ': ' + JSON.stringify(r));
    tutto = tutto && ok;
    await ctx.close();
  }
  await b.close();
  process.exit(tutto ? 0 : 1);
})();
