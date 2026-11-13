// Fapopedia Roccobot: a thumbnail that arrives only on scrolling ends up in the ZIP, and the
// pill sits 16 px from the edges like the other three.
// Run from the repo root: node tests/fapopedia-lazy.cjs [path to a copy of the script]
// Author: Rocco Casadei, a.k.a. Roccobot
// The real userscript, added once the page has loaded (it runs at document-idle), on a page
// served at its real address. The page is tall and adds a third thumbnail only when it is
// scrolled past half of it, as a lazy gallery does; GM_xmlhttpRequest records each address.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'FapopediaRoccobot.user.js'), 'utf8');
const SHIM = `
window.GM_registerMenuCommand = function () {};
window.__chiesti = [];
window.GM_xmlhttpRequest = function (o) {
  window.__chiesti.push(o.url);
  setTimeout(function () { o.onload({ status: 200, response: new Uint8Array([1, 2, 3, 4]).buffer }); }, 50);
};
HTMLAnchorElement.prototype.click = function () {};`;
const miniatura = (n) => '<img src="https://fapopedia.net/photos/g/a/model/1000//t_' + n + '.jpg" alt="x" width="100" height="100" />';
const pagina = '<!doctype html><html><head><title>Model - Gallery</title></head><body style="margin:0">' +
  '<div id="g">' + miniatura('0001') + miniatura('0002') + '</div><div style="height:4000px"></div><script>' +
  'addEventListener("scroll", function () { if (scrollY < 1500 || document.querySelector("img[src*=t_0003]")) return; ' +
  'var i = document.createElement("img"); i.src = "https://fapopedia.net/photos/g/a/model/1000//t_0003.jpg"; ' +
  'document.getElementById("g").appendChild(i); });' +
  '</script></body></html>';

(async () => {
  const b = await chromium.launch();
  const esiti = [];
  for (const [nome, opt, lato] of [['desktop', {}, 'right'], ['telefono', devices['Pixel 7'], 'left']]) {
    const ctx = await b.newContext(opt);
    await ctx.route(/^https?:\/\//, (r) => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: pagina }) : r.abort());
    await ctx.addInitScript(SHIM);
    const p = await ctx.newPage();
    await p.goto('https://fapopedia.net/gallery/model', { waitUntil: 'load' });
    await p.addScriptTag({ content: script });
    await p.waitForSelector('#rb-fap-dl');
    const margini = await p.evaluate((lato) => {
      const r = document.getElementById('rb-fap-dl').getBoundingClientRect();
      return { lato: Math.round(lato === 'left' ? r.left : innerWidth - r.right), fondo: Math.round(innerHeight - r.bottom) };
    }, lato);
    esiti.push([margini.lato === 16 && margini.fondo === 16, nome + ', pillola a 16 px dai bordi: ' + JSON.stringify(margini)]);
    if (nome === 'desktop') {
      await p.click('#rb-fap-dl');
      await p.waitForFunction(() => document.getElementById('rb-fap-dl').textContent === '💾 Save', null, { timeout: 15000 });
      const chiesti = await p.evaluate(() => window.__chiesti.map((u) => u.split('/').pop()).sort());
      esiti.push([chiesti.join(',') === '0001.jpg,0002.jpg,0003.jpg', 'miniatura arrivata scorrendo nello ZIP: ' + JSON.stringify(chiesti)]);
    }
    await ctx.close();
  }
  await b.close();
  for (const [ok, testo] of esiti) console.log((ok ? 'OK  ' : 'FALLITA ') + testo);
  process.exit(esiti.every((e) => e[0]) ? 0 : 1);
})();
