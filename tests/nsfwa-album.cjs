// NSFWA Roccobot: an album page must show the ZIP button on both image hosts of nsfwalbum.com.
// Run from the repo root: node tests/nsfwa-album.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript on a page served at its real address; the page is a trimmed copy of the
// album markup measured on 2026-11-07 (thumbnails in data-src, one host per album).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'NSFWARoccobot.user.js'), 'utf8');
const SHIM = 'window.GM_registerMenuCommand = function () {}; window.GM_xmlhttpRequest = function () {};';
const miniatura = (src, id) => '<img class="img albumPhoto" src="//nsfwalbum.com/pic/p.png" data-src="' + src + '" data-img-id="' + id + '" alt="x" referrerpolicy="no-referrer" />';
const pagina = (srcs) => '<!doctype html><html><head><title>Studio Model - Title - 2x</title></head><body><div class="models">Studio: Studio</div>' +
  srcs.map((s, i) => miniatura(s, 100 + i)).join('') + '</body></html>';
const CASI = [
  ['imx.to', ['https://image.imx.to/u/t/2026/11/06/aaa.jpg', 'https://image.imx.to/u/t/2026/11/06/bbb.jpg']],
  ['pixhost', ['https://t3.pixhost.cc/thumbs/6983/800164521_001.jpg', 'https://t3.pixhost.cc/thumbs/6983/800164541_002.jpg']],
];
(async () => {
  const b = await chromium.launch();
  let tutto = true;
  for (const [nome, srcs] of CASI) {
    const ctx = await b.newContext();
    await ctx.route(/^https?:\/\//, r => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: pagina(srcs) }) : r.abort());
    await ctx.addInitScript(SHIM);
    await ctx.addInitScript(script);
    const p = await ctx.newPage();
    await p.goto('https://nsfwalbum.com/album/1', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    const ok = !!(await p.$('#rb-nsfwplus'));
    console.log((ok ? 'OK  ' : 'FALLITA ') + nome + ': ' + (ok ? 'il tasto c\'è' : 'nessun tasto'));
    tutto = tutto && ok;
    await ctx.close();
  }
  await b.close();
  process.exit(tutto ? 0 : 1);
})();
