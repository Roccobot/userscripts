// ==UserScript==
// @name         NSFWA Roccobot
// @namespace    https://roccobot.github.io/
// @version      1.2.5
// @description  All-in-one for nsfwalbum.com. Photo pages (/photo/): the real image becomes clickable again, so open-image and save-image reach the actual image file; #zoom is forced visible and on top, and the SVG and lens decoys over it are neutralized, hidden #zoom included. Album pages (/album/): a button downloads the whole set at full resolution as one ZIP, named '[studio] - [model] - [title].zip'. Replaces NSFWAlbum Enhancer and NSFWGallery.
// @author       Rocco Casadei, a.k.a. Roccobot
// @icon         https://roccobot.github.io/userscripts/Roccobot.png
// @match        https://nsfwalbum.com/*
// @match        https://www.nsfwalbum.com/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      i.imx.to
// @connect      imx.to
// @connect      image.imx.to
// @connect      pixhost.cc
// @connect      pixhost.to
// @updateURL    https://roccobot.github.io/userscripts/NSFWARoccobot.user.js
// @downloadURL  https://roccobot.github.io/userscripts/NSFWARoccobot.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ════════════════════════ IMPOSTAZIONI ════════════════════════
  const NASCONDI_LENTE = true; // pagina foto: nasconde la lente d'ingrandimento (.magnify-lens)
  const PARALLELE  = 4;        // pagina album: download contemporanei
  const TIMEOUT_MS = 60000;    // pagina album: timeout per immagine

  const suPhoto = /\/photo\//i.test(location.pathname);
  const suAlbum = /\/album\//i.test(location.pathname);
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ── Start-up guard: <html> may not exist yet ──
  // At document-start the manager may run the script before <html> is created, so
  // document.documentElement is null: the photo module's appendChild on it throws before the
  // listeners are registered, and the module does nothing. How early the script runs is up to
  // the manager, so the defect shows on one device only. Same guard as QwantRoccobot.user.js:
  // run now if <html> is there, otherwise retry on the next frame.
  function alDocumento(fn) {
    if (document.documentElement) { fn(); return; }
    const riprova = () => alDocumento(fn);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(riprova);
    else setTimeout(riprova, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODULO FOTO (/photo/<id>): apri/salva immagine → file vero
  // ═══════════════════════════════════════════════════════════════════════
  // La foto vera è in <img id="zoom"> (src = file reale su imx.to via backend.php),
  // ma spesso è NASCOSTA (class="hide") mentre il plugin magnify mostra l'immagine
  // e uno script di protezione (hl.js) sovrappone un <svg> VUOTO grande quanto la
  // foto che ruba il tasto destro: "apri immagine" restituisce quell'SVG
  // serializzato (data:image/svg+xml...). Fix: forziamo #zoom VISIBILE, cliccabile e
  // in cima, e neutralizziamo (pointer-events:none) le esche sovrapposte → il menu
  // contestuale cade sull'immagine vera. NB: /missed.php restituisce un JPEG
  // placeholder quando l'immagine manca davvero (in quel caso non c'è nulla da
  // recuperare: non è un'esca).
  function moduloFoto() {
    const css =
      // #zoom: reso visibile, interagibile e in cima (così il tasto destro lo colpisce)
      '#zoom{display:block!important;visibility:visible!important;opacity:1!important;' +
        'pointer-events:auto!important;position:relative!important;z-index:2147483000!important;' +
        'max-width:100%!important;height:auto!important;margin-left:auto!important;margin-right:auto!important}' +
      (NASCONDI_LENTE ? '.magnify-lens{display:none!important}' : '');
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    function img() { return document.getElementById('zoom'); }
    function spegni(el) {
      if (!el || el.dataset.rbNsfw || el === img()) return;
      el.style.setProperty('pointer-events', 'none', 'important');
      el.dataset.rbNsfw = '1';
    }

    // Neutralizzazione LARGA: overlay grandi quanto l'immagine o SVG vuoti (l'esca
    // classica, incluso l'SVG 2333×3500 vuoto). Su load/mutation/mouseover.
    function neutralizza() {
      const z = img();
      if (!z) return;
      z.style.setProperty('pointer-events', 'auto', 'important');
      const r = z.getBoundingClientRect();
      for (const el of document.querySelectorAll('svg,[class*="magnif"]')) {
        if (el.dataset.rbNsfw || el === z) continue;
        const s = el.getBoundingClientRect();
        const svgVuoto = el.tagName.toLowerCase() === 'svg' && el.childElementCount === 0;
        if (!r.width || !r.height) { if (svgVuoto) spegni(el); continue; }
        const overlappa = !(s.right <= r.left || s.left >= r.right || s.bottom <= r.top || s.top >= r.bottom);
        const grande = s.width >= r.width * 0.6 && s.height >= r.height * 0.6;
        if (svgVuoto || (overlappa && grande)) spegni(el);
      }
    }

    // Neutralizzazione MIRATA al tasto destro: qualunque cosa sopra #zoom nel
    // punto cliccato viene resa trasparente ai clic (a prescindere da forma/dim).
    function scopriSotto(x, y) {
      const z = img();
      if (!z) return;
      z.style.setProperty('pointer-events', 'auto', 'important');
      const stack = document.elementsFromPoint(x, y);
      const idx = stack.indexOf(z);
      if (idx < 0) { neutralizza(); return; } // #zoom non nello stack: ripiego largo
      for (let i = 0; i < idx; i++) {
        const el = stack[i];
        if (el === z || el === document.documentElement || el === document.body) continue;
        spegni(el);
      }
    }
    // On a phone the menu comes from a long press, and the browser picks its target when the
    // finger lands: the decoys are cleared at the touch's pointerdown, not at the contextmenu.
    function suTastoDestro(e) {
      if (e.button === 2 || e.type === 'contextmenu' || e.pointerType === 'touch') scopriSotto(e.clientX, e.clientY);
    }

    function avvio() {
      neutralizza();
      try { new MutationObserver(neutralizza).observe(document.documentElement, { subtree: true, childList: true }); } catch (e) {}
      window.addEventListener('load', neutralizza);
      window.addEventListener('resize', neutralizza);
      document.addEventListener('scroll', neutralizza, true);
      document.addEventListener('mouseover', neutralizza, true);
      document.addEventListener('pointerdown', suTastoDestro, true);
      document.addEventListener('mousedown', suTastoDestro, true);
      document.addEventListener('contextmenu', suTastoDestro, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MODULO ALBUM (/album/<id>): scarica l'intero set in ZIP
  // ═══════════════════════════════════════════════════════════════════════
  // Le thumbnail sono <img class="albumPhoto" data-src="...">, e il sito usa due host:
  // - imx.to: thumb //image.imx.to/u/t/<data>/<nome>.jpg, full-res //i.imx.to/i/<data>/<nome>.jpg;
  // - pixhost (visto il 2026-11-07 su una parte degli album): thumb
  //   //tN.pixhost.cc/thumbs/<n>/<nome>.jpg, full-res //imgN.pixhost.cc/images/<n>/<nome>.jpg
  //   (misurato il 2026-11-07: 9 KB contro 2,3 MB).
  // Un album su pixhost non aveva il pulsante, perché qui si cercava solo imx.to. ZIP creato da
  // un writer interno (metodo "store": le JPEG sono già compresse; niente dipendenze).
  function moduloAlbum() {
    // ── The ZIP writer: the same code as ENFRoccobot.user.js (section 5b) ──
    // Stored entries, no library: JPEGs are compressed already. Each script is a single file,
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

    // ── Metadati → nome ZIP "[studio] - [modella] - [titolo]" ──
    function metadati() {
      const titleRaw = (document.title || '').trim();
      let studio = '';
      const md = document.querySelector('.models');
      if (md) {
        const a = md.querySelector('a[href*="/search/"]');
        if (a && a.textContent) studio = a.textContent.trim();
        if (!studio) { const m = md.textContent.match(/Studio:\s*([^\n|]+)/i); if (m) studio = m[1].trim(); }
      }
      let t = titleRaw.replace(/\s*[-–]\s*\d+\s+photos?\s*$/i, '').trim();
      let rest = t;
      if (studio && rest.toLowerCase().indexOf(studio.toLowerCase()) === 0) rest = rest.slice(studio.length).trim();
      const parts = rest.split(/\s+[-–]\s+/);
      return { studio: studio, model: (parts[0] || '').trim(), titolo: parts.slice(1).join(' - ').trim() };
    }
    function pulisci(s) { return (s || '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function nomeZip() {
      const m = metadati();
      const parti = [m.studio, m.model, m.titolo].map(pulisci).filter(Boolean);
      let nome = parti.join(' - ');
      if (!nome) nome = pulisci(document.title) || 'nsfwalbum';
      return nome.slice(0, 180) + '.zip';
    }

    // The full-size address of a thumbnail, or '' when the host is not one of the two known.
    function pienaRisoluzione(ds) {
      if (/\/\/image\.imx\.to\/u\/t\//i.test(ds)) return ds.replace(/\/\/image\.imx\.to\/u\/t\//i, '//i.imx.to/i/');
      const px = ds.match(/^(https:\/\/)t(\d+)\.(pixhost\.(?:cc|to))\/thumbs\/(.+)$/i);
      if (px) return px[1] + 'img' + px[2] + '.' + px[3] + '/images/' + px[4];
      return '';
    }
    function urlPienaRisoluzione() {
      const out = [];
      for (const img of document.querySelectorAll('img.albumPhoto[data-src], img[data-img-id][data-src]')) {
        let ds = img.getAttribute('data-src') || '';
        if (ds.indexOf('//') === 0) ds = 'https:' + ds;
        const full = pienaRisoluzione(ds);
        if (full) out.push(full);
      }
      return out;
    }
    function estensione(u) { const m = (u.split('/').pop() || '').match(/\.(jpe?g|png|webp|gif)/i); return m ? m[0].toLowerCase() : '.jpg'; }

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
    async function scaricaTutte(urls, onProg) {
      const out = new Array(urls.length);
      let next = 0, fatti = 0, ok = 0;
      async function worker() {
        while (next < urls.length) {
          const idx = next++;
          try { out[idx] = await scaricaDato(urls[idx]); ok++; }
          catch (e) { out[idx] = null; }
          fatti++;
          if (onProg) onProg(fatti, urls.length);
        }
      }
      const n = Math.min(PARALLELE, urls.length);
      const workers = [];
      for (let i = 0; i < n; i++) workers.push(worker());
      await Promise.all(workers);
      return { dati: out, ok: ok };
    }

    let inCorso = false;
    // A finished ZIP waits for a second tap: a download started after the awaits has lost the
    // user gesture, and mobile browsers (Violentmonkey on Android) drop it in silence. The click
    // on the <a download> runs inside the tap on '💾 Save', so the browser accepts it.
    let salvaInAttesa = null;
    function preparaSalvataggio(btn, blob, nome, esito) {
      salvaInAttesa = function () {
        salvaInAttesa = null;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nome; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { a.remove(); } catch (e) {} }, 1000);
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 120000);
        if (btn) {
          btn.textContent = esito;
          btn.title = btn.dataset.titolo || '';
          setTimeout(function () { if (!inCorso && !salvaInAttesa) btn.textContent = btn.dataset.testo || ''; }, 6000);
        }
      };
      if (btn) { btn.textContent = '💾 Save'; btn.title = 'Click to save the ZIP'; }
    }
    async function avvia(btn) {
      if (salvaInAttesa) { salvaInAttesa(); return; }
      if (inCorso) return;
      const lista = urlPienaRisoluzione();
      if (!lista.length) { alert('NSFWA Roccobot: no image found on this page.'); return; }
      inCorso = true;
      if (btn) btn.disabled = true;
      try {
        const res = await scaricaTutte(lista, function (fatti, tot) { if (btn) btn.textContent = '⬇️ ' + fatti + '/' + tot + '...'; });
        const larg = String(lista.length).length < 3 ? 3 : String(lista.length).length;
        const files = []; let n = 0, byte = 0;
        for (let i = 0; i < lista.length; i++) {
          const buf = res.dati[i];
          if (!buf) continue;
          files.push({ nome: String(i + 1).padStart(larg, '0') + estensione(lista[i]), buffer: buf });
          byte += buf.byteLength;
          n++;
        }
        if (!files.length) { alert('NSFWA Roccobot: no image downloaded (all of them failed).'); return; }
        if (byte > 4294000000) throw new Error('too much for a plain ZIP: over 4 GiB');
        if (btn) btn.textContent = '📦 Building ZIP...';
        await sleep(0);
        const blob = zipDaVoci(files);
        preparaSalvataggio(btn, blob, nomeZip(), '✅ ' + n + '/' + lista.length + (n < lista.length ? ' (some failed)' : ''));
        if (!btn) salvaInAttesa(); // no pill to tap: try at once (menu without the pill)
      } catch (e) {
        if (btn) btn.textContent = '⚠️ Error';
        alert('NSFWA Roccobot: download error.\n' + (e && e.message ? e.message : e));
      } finally {
        inCorso = false;
        if (btn) {
          btn.disabled = false;
          if (!salvaInAttesa) setTimeout(function () { if (!inCorso && !salvaInAttesa) btn.textContent = btn.dataset.testo || ''; }, 6000);
        }
      }
    }

    function aggiungiPulsante() {
      if (document.getElementById('rb-nsfwplus') || !document.body) return;
      if (!urlPienaRisoluzione().length) return; // solo album con foto
      const b = document.createElement('button');
      b.id = 'rb-nsfwplus';
      b.type = 'button';
      b.textContent = '⬇️ Download set (ZIP)';
      b.title = 'Download every image of the set at full resolution in one ZIP\n(name: "studio - model - title.zip", taken from the page).';
      b.dataset.testo = b.textContent;
      b.dataset.titolo = b.title;
      // Touch-first device (pointer: coarse, e.g. Violentmonkey on an Android Chromium browser):
      // the pill moves to the bottom-left corner and grows to a finger-sized target (44 px tall).
      const touch = matchMedia('(pointer: coarse)').matches;
      Object.assign(b.style, {
        position: 'fixed', zIndex: '2147483647', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        [touch ? 'left' : 'right']: '16px',
        padding: touch ? '15px 14px' : '10px 14px', borderRadius: '999px', border: 'none',
        background: '#c2185b', color: '#fff',
        font: '600 14px/1 system-ui, -apple-system, sans-serif',
        cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.35)', opacity: '0.9'
      });
      b.addEventListener('mouseenter', function () { b.style.opacity = '1'; });
      b.addEventListener('mouseleave', function () { b.style.opacity = '0.9'; });
      b.addEventListener('click', function () { avvia(b); });
      document.body.appendChild(b);
    }

    if (typeof GM_registerMenuCommand !== 'undefined') {
      GM_registerMenuCommand('Download the set as ZIP (full resolution)', function () { avvia(document.getElementById('rb-nsfwplus')); });
    }
    // le thumbnail compaiono col caricamento → riprova con l'observer
    function setup() {
      aggiungiPulsante();
      try { new MutationObserver(aggiungiPulsante).observe(document.documentElement, { subtree: true, childList: true }); } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
  }

  if (suPhoto) alDocumento(moduloFoto);
  if (suAlbum) moduloAlbum();
})();
