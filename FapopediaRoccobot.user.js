// ==UserScript==
// @name         Fapopedia Roccobot
// @namespace    https://roccobot.github.io/
// @version      1.3.4
// @description  Adds a button to fapopedia.net that downloads every image of a gallery at full resolution, packed into one ZIP. Originals are derived from the thumbnail URLs (the 't_' prefix is dropped) and fetched with GM_xmlhttpRequest; the ZIP comes from a small built-in writer (store method, no dependency: JSZip stalled while compressing inside the sandbox). Nothing is uploaded: downloads only.
// @author       Rocco Casadei, a.k.a. Roccobot
// @icon         https://roccobot.github.io/userscripts/Roccobot.png
// @match        https://fapopedia.net/*
// @match        https://www.fapopedia.net/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      fapopedia.net
// @updateURL    https://roccobot.github.io/userscripts/FapopediaRoccobot.user.js
// @downloadURL  https://roccobot.github.io/userscripts/FapopediaRoccobot.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ════════════════════════ IMPOSTAZIONI ════════════════════════
  const PARALLELE = 4;      // quanti download contemporanei
  const TIMEOUT_MS = 60000; // timeout per singola immagine

  // ── Come funziona ──
  // Le miniature della galleria sono URL tipo:
  //   https://fapopedia.net/photos/g/a/<slug>/1000//t_0001.jpg   (≈7 KB)
  // L'alta risoluzione è lo STESSO URL senza il prefisso "t_" del nome file:
  //   https://fapopedia.net/photos/g/a/<slug>/1000//0001.jpg     (≈200 KB)
  // (verificato: /1000/ senza t_ è la risoluzione massima disponibile sul sito).

  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ── The ZIP writer: the same code as ENFRoccobot.user.js (section 5b) ──
  // Stored entries, no library: JPEGs are compressed already, so storing loses nothing, and
  // JSZip hung for ever inside the manager's sandbox while compressing. Each script is a single file,
  // so the writer has three copies, and they are kept identical. The entries are handed to a
  // Blob, which never copies the pixels, and carry the real DOS date and time (an all-zero
  // date reads as 1980-00-00). Plain zip32: the caller keeps the archive under 4 GiB.
  var TABELLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABELLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // MS-DOS date and time: two 16 bit words, seconds with a resolution of two.
  function oraDos(d) {
    return {
      ora: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
      giorno: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  // Bit 11 of the general purpose flag says 'the name is UTF-8'.
  var ZIP_UTF8 = 0x0800;

  function zipDaVoci(file) {
    var pezzi = [], centrali = [], scarto = 0, quando = oraDos(new Date());
    var codifica = new TextEncoder();

    file.forEach(function (f) {
      var nome = codifica.encode(f.nome);
      var dati = new Uint8Array(f.buffer);
      var crc = crc32(dati);

      var locale = new DataView(new ArrayBuffer(30));
      locale.setUint32(0, 0x04034b50, true);
      locale.setUint16(4, 20, true);            // version needed
      locale.setUint16(6, ZIP_UTF8, true);
      locale.setUint16(8, 0, true);             // method: stored
      locale.setUint16(10, quando.ora, true);
      locale.setUint16(12, quando.giorno, true);
      locale.setUint32(14, crc, true);
      locale.setUint32(18, dati.length, true);  // compressed size
      locale.setUint32(22, dati.length, true);  // uncompressed size
      locale.setUint16(26, nome.length, true);
      locale.setUint16(28, 0, true);            // extra field
      pezzi.push(locale.buffer, nome, dati);

      var centrale = new DataView(new ArrayBuffer(46));
      centrale.setUint32(0, 0x02014b50, true);
      centrale.setUint16(4, 20, true);          // version made by
      centrale.setUint16(6, 20, true);          // version needed
      centrale.setUint16(8, ZIP_UTF8, true);
      centrale.setUint16(10, 0, true);
      centrale.setUint16(12, quando.ora, true);
      centrale.setUint16(14, quando.giorno, true);
      centrale.setUint32(16, crc, true);
      centrale.setUint32(20, dati.length, true);
      centrale.setUint32(24, dati.length, true);
      centrale.setUint16(28, nome.length, true);
      centrale.setUint32(42, scarto, true);     // offset of the local header
      centrali.push(centrale.buffer, nome);

      scarto += 30 + nome.length + dati.length;
    });

    var misuraCentrale = centrali.reduce(function (n, p) {
      return n + (p.byteLength !== undefined ? p.byteLength : p.length);
    }, 0);

    var coda = new DataView(new ArrayBuffer(22));
    coda.setUint32(0, 0x06054b50, true);
    coda.setUint16(8, file.length, true);       // entries on this disk
    coda.setUint16(10, file.length, true);      // entries in total
    coda.setUint32(12, misuraCentrale, true);
    coda.setUint32(16, scarto, true);           // where the directory starts
    coda.setUint16(20, 0, true);                // no comment

    return new Blob(pezzi.concat(centrali, [coda.buffer]), { type: 'application/zip' });
  }

  // Miniatura → URL alta risoluzione (toglie "t_" dal nome file).
  function altaRis(u) { return u.replace(/\/t_([^\/?#]+)$/i, '/$1'); }
  function nomeFile(u) { return (u.split('/').pop() || 'img.jpg').split(/[?#]/)[0]; }

  // Nome dello ZIP dallo slug della pagina (es. gabi-summers-nude-leaks).
  function nomeZip() {
    const p = location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
    return (p || 'fapopedia') + '.zip';
  }

  // Raccoglie gli URL in alta risoluzione delle immagini della galleria.
  function raccogliUrl() {
    const set = new Set();
    for (const img of document.querySelectorAll('img')) {
      const cand = [img.currentSrc, img.src,
        img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src')];
      const srcset = img.getAttribute('srcset') || '';
      for (const parte of srcset.split(',')) { const u = parte.trim().split(/\s+/)[0]; if (u) cand.push(u); }
      for (let u of cand) {
        if (!u || !/\/photos\//i.test(u)) continue;           // solo foto galleria (esclude /avatars/)
        u = u.split(/[?#]/)[0];
        if (!/\/t_[^\/]+\.(jpg|jpeg|png|webp)$/i.test(u)) continue; // solo miniature (prefisso t_)
        set.add(altaRis(u));
      }
    }
    return Array.from(set).sort();
  }

  // Scorre la pagina per forzare il lazy-load, poi torna su.
  async function forzaLazyLoad() {
    const y = window.scrollY;
    const h = document.body.scrollHeight;
    for (let p = 0; p <= h; p += 800) { window.scrollTo(0, p); await sleep(50); }
    window.scrollTo(0, y);
    await sleep(150);
  }

  // Scarica una singola immagine come ArrayBuffer (via GM_xmlhttpRequest, con
  // referer). ArrayBuffer → Uint8Array è ciò che serve al writer ZIP interno,
  // tutto sincrono e senza dipendenze.
  function scaricaDato(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET', url: url, responseType: 'arraybuffer', timeout: TIMEOUT_MS,
        headers: { Referer: location.href },
        onload: function (r) {
          if (r.status >= 200 && r.status < 300 && r.response && r.response.byteLength) resolve(r.response);
          else reject(new Error('HTTP ' + r.status));
        },
        onerror: function () { reject(new Error('errore di rete')); },
        ontimeout: function () { reject(new Error('timeout')); }
      });
    });
  }

  // Pool a concorrenza limitata; onProg(fatti, totale, ok).
  async function scaricaTutte(urls, onProg) {
    const out = new Array(urls.length);
    let i = 0, fatti = 0, ok = 0;
    async function worker() {
      while (i < urls.length) {
        const idx = i++;
        try { out[idx] = await scaricaDato(urls[idx]); ok++; }
        catch (e) { out[idx] = null; }
        fatti++; onProg(fatti, urls.length, ok);
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLELE, urls.length) }, worker));
    return out;
  }

  // ── Pulsante flottante ──
  let inCorso = false;
  // Touch-first device (pointer: coarse, e.g. Violentmonkey on an Android Chromium browser):
  // the pill moves to the bottom-left corner and grows to a finger-sized target (44 px tall).
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  function stile(b) {
    Object.assign(b.style, {
      position: 'fixed', zIndex: '2147483647', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      [TOUCH ? 'left' : 'right']: '16px',
      padding: TOUCH ? '15px 16px' : '12px 16px', borderRadius: '999px', border: 'none',
      background: '#e6005c', color: '#fff',
      font: '600 14px/1 system-ui,-apple-system,sans-serif',
      cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.35)'
    });
  }

  // A finished ZIP waits for a second tap: a download started after the awaits has lost the
  // user gesture, and mobile browsers (Violentmonkey on Android) drop it in silence. The click
  // on the <a download> runs inside the tap on '💾 Save', so the browser accepts it.
  let salvaInAttesa = null;
  function preparaSalvataggio(btn, blob, nome, esito, testoIniziale) {
    const titolo = btn.title;
    salvaInAttesa = function () {
      salvaInAttesa = null;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nome; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { a.remove(); } catch (e) {} }, 1000);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 120000);
      btn.textContent = esito;
      btn.title = titolo;
      setTimeout(function () { if (!inCorso && !salvaInAttesa) btn.textContent = testoIniziale; }, 5000);
    };
    btn.textContent = '💾 Save';
    btn.title = 'Click to save the ZIP';
  }

  async function avvia(btn) {
    if (salvaInAttesa) { salvaInAttesa(); return; }
    if (inCorso) return;
    inCorso = true;
    const testoIniziale = btn.textContent;
    btn.disabled = true;
    try {
      // One scroll through the page first, so the thumbnails that load on scrolling are in
      // the DOM, then the one collection of the addresses: the list is read after the scroll.
      await forzaLazyLoad();
      const lista = raccogliUrl();
      if (!lista.length) { alert('Fapopedia Roccobot: no gallery image found on this page.'); return; }
      const dati = await scaricaTutte(lista, function (fatti, tot) {
        btn.textContent = '⬇️ ' + fatti + '/' + tot + '...';
      });

      const files = [];
      const visti = {};
      let falliti = 0, byte = 0;
      lista.forEach(function (u, idx) {
        const buf = dati[idx];
        if (!buf) { falliti++; return; }
        let nome = nomeFile(u);
        if (visti[nome]) nome = String(idx + 1).padStart(4, '0') + '_' + nome; // evita collisioni
        visti[nome] = 1;
        files.push({ nome: nome, buffer: buf });
        byte += buf.byteLength;
      });

      if (!files.length) { alert('Fapopedia Roccobot: no image downloaded (all of them failed).'); return; }
      if (byte > 4294000000) throw new Error('too much for a plain ZIP: over 4 GiB');

      btn.textContent = '📦 Building ZIP...';
      await sleep(0); // lascia ridipingere il pulsante prima del lavoro sincrono
      const zipBlob = zipDaVoci(files);
      const aggiunte = files.length;
      preparaSalvataggio(btn, zipBlob, nomeZip(), '✅ ' + aggiunte + (falliti ? (' / ' + falliti + ' ✗') : ''), testoIniziale);
    } catch (e) {
      alert('Fapopedia Roccobot: download error.\n' + (e && e.message ? e.message : e));
      btn.textContent = testoIniziale;
    } finally {
      inCorso = false;
      btn.disabled = false;
    }
  }

  function creaPulsante() {
    if (document.getElementById('rb-fap-dl')) return;
    const n = raccogliUrl().length;
    if (!n) return; // niente galleria in questa pagina → niente pulsante
    const b = document.createElement('button');
    b.id = 'rb-fap-dl';
    b.type = 'button';
    b.textContent = '⬇️ Download gallery (' + n + ') - ZIP';
    b.title = 'Download every gallery image in high resolution, in a single ZIP';
    stile(b);
    b.addEventListener('click', function () { avvia(b); });
    document.body.appendChild(b);
  }

  if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('Download gallery (ZIP)', function () {
      const b = document.getElementById('rb-fap-dl');
      if (b) avvia(b); else alert('Fapopedia Roccobot: open a gallery page.');
    });
  }

  // Le pagine sono server-rendered; un piccolo ritardo + observer copre i casi
  // in cui le miniature arrivano poco dopo il load. Aggiorna anche il conteggio.
  function tick() {
    creaPulsante();
    const b = document.getElementById('rb-fap-dl');
    if (b && !inCorso && !salvaInAttesa) {
      const n = raccogliUrl().length;
      if (n) b.textContent = '⬇️ Download gallery (' + n + ') - ZIP';
    }
  }
  tick();
  let t = 0;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(tick, 400); })
    .observe(document.documentElement, { subtree: true, childList: true });
})();
