// ENF Roccobot: on a page that stands still the script does not serialize the whole document
// again and again.
// Run from the repo root: node tests/enf-idle.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// Serializing the document (documentElement.innerHTML) is the expensive part of a pass: about
// 84 ms on a 1,200 KB page with the CPU slowed four times. A spy on the getter counts how many
// times the real script reads it during 7.5 s of a page that does not change, once with the
// download button on screen and once on a page with nothing to download. A page that does not
// change gives the script nothing new to read: one serialization is enough.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'ENFRoccobot.user.js'), 'utf8');
const SHIM = `
window.unsafeWindow = window;
window.GM_registerMenuCommand = function () {};
window.GM_xmlhttpRequest = function () {};
window.__letture = 0;
(function () {
  var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, set: d.set,
    get: function () { if (this === document.documentElement) window.__letture++; return d.get.call(this); }
  });
})();`;
const CASI = [
  ['col tasto in pagina', '<article><video src="https://cdn.enf-cmnf.cc/wp-content/uploads/prova.mp4"></video></article>'],
  ['senza niente da scaricare', '<article><p>Solo testo.</p></article>']
];

(async () => {
  const b = await chromium.launch();
  let tutto = true;
  for (const [nome, corpo] of CASI) {
    const ctx = await b.newContext();
    await ctx.route(/^https?:\/\//, (r) => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Prova</title></head><body>' + corpo + '</body></html>' })
      : r.abort());
    await ctx.addInitScript(SHIM);
    await ctx.addInitScript(script);
    const p = await ctx.newPage();
    await p.goto('https://enf-cmnf.cc/prova/', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const prima = await p.evaluate(() => window.__letture);
    await p.waitForTimeout(7500);
    const dopo = await p.evaluate(() => window.__letture);
    const ok = prima <= 1 && dopo === prima;
    console.log((ok ? 'OK  ' : 'FALLITA ') + nome + ': ' + prima + ' letture all\'avvio, ' + (dopo - prima) + ' nei 7,5 s a pagina ferma');
    tutto = tutto && ok;
    await ctx.close();
  }
  await b.close();
  process.exit(tutto ? 0 : 1);
})();
