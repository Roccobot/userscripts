// ==UserScript==
// @name         PH Roccobot
// @namespace    https://roccobot.github.io/
// @version      1.12.4
// @description  On pornhub.com: keeps the site in English and Worldwide by rewriting the lang=en and overwriteCCVal=world cookies on every load (PH resets them to Italian now and then), and redirects the language subdomains (it.pornhub.com and so on) to www.pornhub.com so titles are never translated. Adds an always-visible download button at the bottom right: highest MP4 quality available; progress on the button; second click cancels; file named '[Channel] Title.mp4'; source read at runtime from flashvars/mediaDefinitions. Skips the video ad the player shows before playback. Also cleans up the page: removes the Google sign-in popup, hides the 'Click here to watch the full scene' overlay on the player and the AI assistant button in the header, and makes every link to another video page open in a new tab.
// @author       Rocco Casadei, a.k.a. Roccobot
// @icon         https://roccobot.github.io/userscripts/Roccobot.png
// @match        https://*.pornhub.com/*
// @match        https://pornhub.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      pornhub.com
// @connect      phncdn.com
// @connect      phprcdn.com
// @connect      *
// @updateURL    https://roccobot.github.io/userscripts/PHRoccobot.user.js
// @downloadURL  https://roccobot.github.io/userscripts/PHRoccobot.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ════════════════════════ IMPOSTAZIONI ════════════════════════
  const FORZA_INTERNAZIONALE = true; // reindirizza it.pornhub.com (o altra lingua) → www.pornhub.com
  const SALVA_CON_DIALOGO = true;    // true = chiede dove salvare; false = scarica diretto
  const SALTA_PUBBLICITA = true;     // niente video pubblicitario prima del play

  // ═══════════════════════════════════════════════════════════════════════
  //  0) NO PREROLL AD
  // ═══════════════════════════════════════════════════════════════════════
  // The player asks `/_xa/ads?...preroll_type=json` for the ad it plays before the video, and
  // gets back {"ad": {duration, mediaFiles: [.../pre_videos/....mp4], ...}}. Answering {} (no ad)
  // makes it load the video itself straight away. Measured on 2026-11-01 on a video page, as an
  // Android phone: untouched, the player prepared two `pre_videos` ads; with the answer {} it
  // prepared the video's own MP4 (`videos/.../480P_...mp4`), with no error in the page. The
  // wrapper must be in place before the player starts, hence document-start, and it lives on
  // the page's own `fetch` (unsafeWindow), which is the one the player calls. Any other request
  // goes through untouched. (Firefox would need exportFunction; the scripts run on Chromium.)
  // How late the script started, and how many ad requests got 'no ad' (see the Ad check below).
  const AVVIO_MS = Math.round(performance.now());
  let risposteVuote = 0;
  if (SALTA_PUBBLICITA) {
    try {
      const w = unsafeWindow, realFetch = w.fetch;
      w.fetch = function (input, init) {
        const u = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\/_xa\/ads\?/.test(u) && /[?&]preroll_type=json/.test(u)) {
          risposteVuote++;
          return w.Promise.resolve(new w.Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch.apply(w, arguments);
      };
    } catch (e) { /* never break the page */ }
  }

  // ── Ad check (menu command) ──
  // Reported on 2026-11-02 from the phone: with 1.12.0 the ad still played. Measured the same
  // day: the player sends the ad request while the page loads, about one second after it opens
  // and before any tap, so the wrapper above works only if the script manager really injects it
  // at document-start, in the page's own context. The menu command tells, on the device, how
  // late the script started and whether it runs in the page context; the counter says whether
  // an ad request has been answered on this page.
  function controlloPubblicita() {
    let pagina = false;
    try { pagina = Object.keys(unsafeWindow).some(function (k) { return /^flashvars_/.test(k); }); } catch (e) {}
    alert('PH Roccobot ' + (typeof GM_info !== 'undefined' ? GM_info.script.version : '') +
      '\nStarted ' + AVVIO_MS + ' ms after the page opened (the ad request leaves at about 1000 ms).' +
      '\nPage context: ' + (pagina ? 'yes' : 'no') +
      '\nAd requests answered with no ad: ' + risposteVuote);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  1) FORZA INGLESE/INTERNAZIONALE (cookie di preferenza + redirect da it.)
  // ═══════════════════════════════════════════════════════════════════════
  // Dall'Italia PH carica it.pornhub.com e traduce i titoli. Le preferenze sono
  // in DUE cookie: lang=en (lingua) e overwriteCCVal=world (Paese=Worldwide).
  // PH ogni tanto (al login) li ripristina su it → qui li RISCRIVIAMO a ogni
  // caricamento (document-start, prima delle richieste), così non può più
  // riportarti in italiano. In più, se sei atterrato su un sottodominio-lingua
  // (it/de/fr...), si reindirizza a www conservando percorso/query: ora coi
  // cookie giusti www "tiene".
  function impostaPreferenze() {
    if (!FORZA_INTERNAZIONALE) return;
    const opz = '; path=/; domain=.pornhub.com; max-age=31536000; samesite=lax; secure';
    try {
      document.cookie = 'lang=en' + opz;
      document.cookie = 'overwriteCCVal=world' + opz;
    } catch (e) { /* mai rompere la pagina */ }
  }

  function forzaInternazionale() {
    if (!FORZA_INTERNAZIONALE) return false;
    try {
      const h = location.hostname;
      if (/^[a-z]{2}\.pornhub\.com$/i.test(h)) {
        // guardia anti-loop A TEMPO: se abbiamo reindirizzato < 6s fa e siamo di
        // nuovo qui, è un rimbalzo → non insistere. Ma dopo non resta bloccata.
        let last = 0;
        try { last = +sessionStorage.getItem('rb-ph-intl-t') || 0; } catch (e) {}
        const ora = Date.now();
        if (ora - last < 6000) return false;
        try { sessionStorage.setItem('rb-ph-intl-t', String(ora)); } catch (e) {}
        location.replace('https://www.pornhub.com' + location.pathname + location.search + location.hash);
        return true; // stiamo navigando via
      }
    } catch (e) { /* mai rompere la pagina */ }
    return false;
  }

  // Eseguiti SUBITO (document-start): prima i cookie, poi l'eventuale redirect.
  impostaPreferenze();
  if (forzaInternazionale()) return;

  // ── Start-up guard: <html> may not exist yet ──
  // At document-start the manager may run the script before <html> is created, so
  // document.documentElement is null: the style and the observer of the clean-up go wrong
  // inside their try blocks, in silence, and the module is left half done. How early the
  // script runs is up to the manager, so the defect shows on one device only. Same guard as
  // QwantRoccobot.user.js: run now if <html> is there, otherwise retry on the next frame.
  function alDocumento(fn) {
    if (document.documentElement) { fn(); return; }
    const riprova = () => alDocumento(fn);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(riprova);
    else setTimeout(riprova, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  2) PULIZIA DELLA PAGINA: popup Google, invito sul video, tasto AI
  // ═══════════════════════════════════════════════════════════════════════
  // Tre fastidi diversi, un solo meccanismo: un foglio di stile iniettato subito
  // (a document-start, così non c'è il lampo di elementi che compaiono e spariscono) più
  // un osservatore che ripassa a ogni mutazione, perché PH è in parte una SPA e
  // ricostruisce pezzi di DOM di continuo.
  //
  // ⚠️ DUE STRATEGIE, e la differenza conta quando qualcosa smette di funzionare:
  //  - il popup di Google si becca per SELETTORE, perché i suoi identificativi sono
  //    quelli della libreria Google Identity Services e non cambiano col sito;
  //  - l'invito sul video e il tasto AI si beccano per TESTO, perché le loro classi
  //    sono generate e cambiano senza preavviso, mentre la scritta resta. Il testo è
  //    anche ciò che l'utente ha indicato negli screenshot, quindi è il criterio
  //    più fedele alla richiesta.
  // ⚠️ PH blocca gli strumenti automatici, quindi questi selettori NON sono stati
  // provati sul sito dal vivo: se uno non prende, è lì che si guarda per primo.

  const RE_INVITO_VIDEO = /click here to watch|watch the full scene|guarda la scena completa/i;
  const RE_TASTO_AI = /^ai\b/i;

  // Il popup di accesso Google (One Tap): la libreria lo monta sempre dentro un
  // contenitore con questi identificativi, e dentro ci mette un iframe suo.
  const SEL_POPUP_GOOGLE = [
    '#credential_picker_container',
    '#credential_picker_iframe',
    'div[id^="credential_picker"]',
    'iframe[src*="accounts.google.com/gsi"]',
    'iframe[title*="Sign in with Google" i]',
    'iframe[title*="Accedi con Google" i]'
  ].join(',');

  function iniettaStile() {
    try {
      if (document.getElementById('rb-ph-stile')) return;
      const s = document.createElement('style');
      s.id = 'rb-ph-stile';
      // textContent e non innerHTML: regola non derogabile del repo.
      s.textContent = SEL_POPUP_GOOGLE +
        '{display:none!important;visibility:hidden!important;pointer-events:none!important}' +
        '.rb-ph-via{display:none!important;visibility:hidden!important;pointer-events:none!important}';
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { /* mai rompere la pagina */ }
  }

  function viaDiQui(el) {
    if (!el || el.classList.contains('rb-ph-via')) return;
    el.classList.add('rb-ph-via');
  }

  // Il popup si toglie DAVVERO dal DOM, non solo si nasconde: finché resta montato
  // ruba il fuoco da tastiera e la libreria continua a lavorarci.
  function viaPopupGoogle(radice) {
    try {
      const dentro = radice.querySelectorAll ? radice.querySelectorAll(SEL_POPUP_GOOGLE) : [];
      for (const el of dentro) el.remove();
      if (radice.matches && radice.matches(SEL_POPUP_GOOGLE)) radice.remove();
      // Se la libreria è già in pagina, le si chiede di chiudere: senza questo
      // rimonterebbe il contenitore appena tolto.
      const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      if (w.google && w.google.accounts && w.google.accounts.id && w.google.accounts.id.cancel) {
        w.google.accounts.id.cancel();
      }
    } catch (e) { /* mai rompere la pagina */ }
  }

  // Testo dell'elemento SENZA quello dei figli: serve a trovare il nodo più piccolo
  // che porta davvero la scritta, invece di beccare il contenitore di mezza pagina.
  function testoProprio(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  }

  // L'invito 'Click here to watch the full scene!' sta in una barretta sovrapposta al
  // player. Si sale dal nodo col testo fino al primo antenato POSIZIONATO, che è il
  // riquadro da nascondere, con un tetto di quattro livelli: più su c'è il player,
  // e nasconderlo spegnerebbe il video.
  function viaInvitoSulVideo(radice) {
    try {
      // The root itself counts too: querySelectorAll looks at its descendants only, and a
      // node added on its own would never be checked.
      const nodi = radice.querySelectorAll ? Array.from(radice.querySelectorAll('div,span,a,p,section')) : [];
      if (radice.matches && radice.matches('div,span,a,p,section')) nodi.unshift(radice);
      for (const el of nodi) {
        if (el.classList.contains('rb-ph-via')) continue;
        if (!RE_INVITO_VIDEO.test(testoProprio(el))) continue;
        let bersaglio = el;
        for (let i = 0; i < 4 && bersaglio.parentElement; i++) {
          const pos = getComputedStyle(bersaglio).position;
          if (pos === 'absolute' || pos === 'fixed') break;
          bersaglio = bersaglio.parentElement;
        }
        viaDiQui(bersaglio);
      }
    } catch (e) { /* mai rompere la pagina */ }
  }

  // Il tasto dell'assistente AI nella testata. Si cerca solo dentro la testata e solo
  // fra gli elementi cliccabili, e si vuole un testo CORTO che cominci per 'AI': senza
  // il tetto di lunghezza, un articolo che parla di AI sparirebbe insieme al tasto.
  // It reads every header of the document whatever was added, so it runs once per pass of the
  // observer, never once per added node.
  function viaTastoAI() {
    try {
      const testate = document.querySelectorAll('header, #header, .headerWrapper, #headerWrapper, nav');
      for (const testata of testate) {
        for (const el of testata.querySelectorAll('a,button')) {
          if (el.classList.contains('rb-ph-via')) continue;
          const t = (el.textContent || '').trim();
          if (t.length > 40 || !RE_TASTO_AI.test(t)) continue;
          // Si nasconde il contenitore del tasto se è un guscio che tiene solo lui,
          // o resterebbe un buco con lo sfondo del bottone.
          const p = el.parentElement;
          viaDiQui(p && p.children.length === 1 ? p : el);
        }
      }
    } catch (e) { /* mai rompere la pagina */ }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  3) OGNI LINK A UN ALTRO VIDEO SI APRE IN UNA SCHEDA NUOVA
  // ═══════════════════════════════════════════════════════════════════════
  // Si riconosce una pagina video dall'indirizzo, non dalla posizione del link: così
  // vale per le miniature, per i correlati e per i link dentro i commenti, senza dover
  // conoscere il markup di ognuno. rel='noopener' è obbligatorio: senza, la scheda
  // nuova può toccare quella che l'ha aperta.
  // ⚠️ '/video/search' NON è un video ma la pagina dei risultati, e con un semplice
  // '/video/' finiva anche lei in una scheda nuova: misurato su una pagina di prova.
  const RE_LINK_VIDEO = /(?:\/view_video\.php|[?&]viewkey=|\/video\/(?!search\b))/i;

  function inSchedaNuova(radice) {
    try {
      // The root itself counts too, as in viaInvitoSulVideo.
      const link = radice.querySelectorAll ? Array.from(radice.querySelectorAll('a[href]')) : [];
      if (radice.matches && radice.matches('a[href]')) link.unshift(radice);
      for (const a of link) {
        if (a.dataset.rbTab) continue;
        if (!RE_LINK_VIDEO.test(a.getAttribute('href') || '')) continue;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', (a.getAttribute('rel') ? a.getAttribute('rel') + ' ' : '') + 'noopener');
        a.dataset.rbTab = '1';
      }
    } catch (e) { /* mai rompere la pagina */ }
  }

  // Un solo giro per tutte e quattro le pulizie, e un solo osservatore: quattro
  // osservatori separati farebbero lo stesso lavoro quattro volte a ogni mutazione,
  // e PH ne produce parecchie. The AI button is not in here: it is looked for in the
  // whole document, once per pass (passataIntera and the end of the observer's pass).
  function passata(radice) {
    const r = radice || document;
    viaPopupGoogle(r);
    viaInvitoSulVideo(r);
    inSchedaNuova(r);
  }
  function passataIntera() {
    passata(document);
    viaTastoAI();
  }

  function avviaPulizia() {
    iniettaStile();
    passataIntera();
    try {
      new MutationObserver(function (mutazioni) {
        iniettaStile();
        for (const m of mutazioni) {
          for (const n of m.addedNodes) if (n.nodeType === 1) passata(n);
        }
        // Il popup e il tasto AI possono comparire anche per un semplice cambio di
        // attributo su nodi già in pagina, che non passa da addedNodes.
        viaPopupGoogle(document);
        viaTastoAI();
      }).observe(document.documentElement, { subtree: true, childList: true });
    } catch (e) { /* mai rompere la pagina */ }
    document.addEventListener('DOMContentLoaded', passataIntera);
    window.addEventListener('load', passataIntera);
  }

  alDocumento(avviaPulizia);

  // ═══════════════════════════════════════════════════════════════════════
  //  4) TASTO "Scarica video": qualità massima
  // ═══════════════════════════════════════════════════════════════════════
  // La pagina video espone un oggetto globale flashvars_<viewkey> con
  // "mediaDefinitions": ogni voce ha format (mp4/hls), quality e videoUrl.
  // Alcune voci sono "remote" (videoUrl = endpoint get_media che restituisce
  // il JSON con gli URL per-qualità). Si leggono a runtime, si espandono le
  // remote, si tiene l'mp4 di qualità più alta.

  // flashvars: prima dall'oggetto globale (unsafeWindow), poi, se non si trova,
  // parsando il testo degli <script> (più robusto: non dipende dall'enumerazione
  // di window né dal timing di definizione della variabile).
  function flashvars() {
    try {
      const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      const k = Object.keys(w).find(function (n) { return /^flashvars_/.test(n) && w[n] && w[n].mediaDefinitions; });
      if (k) return w[k];
      // accesso diretto per-viewkey (a volte enumerazione fallisce ma la prop esiste)
      const vk = (location.href.match(/[?&]viewkey=([0-9a-z]+)/i) || [])[1];
      if (vk && w['flashvars_' + vk] && w['flashvars_' + vk].mediaDefinitions) return w['flashvars_' + vk];
    } catch (e) { /* continua col parse */ }
    return flashvarsDaScript();
  }

  function flashvarsDaScript() {
    try {
      for (const s of document.scripts) {
        const t = s.textContent;
        if (!t || t.indexOf('flashvars_') === -1 || t.indexOf('mediaDefinitions') === -1) continue;
        const m = t.match(/flashvars_[0-9a-zA-Z]+\s*=\s*\{/);
        if (!m) continue;
        const start = t.indexOf('{', m.index);
        let depth = 0, i = start, inStr = false, q = '', esc = false;
        for (; i < t.length; i++) {
          const c = t[i];
          if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; }
          else if (c === '"' || c === "'") { inStr = true; q = c; }
          else if (c === '{') depth++;
          else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
        }
        try { const o = JSON.parse(t.slice(start, i)); if (o && o.mediaDefinitions) return o; } catch (e) { /* prova il prossimo */ }
      }
    } catch (e) {}
    return null;
  }

  function getJSON(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET', url: url, timeout: 30000, headers: { Referer: location.href },
        onload: function (r) { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } },
        onerror: function () { reject(new Error('rete')); },
        ontimeout: function () { reject(new Error('timeout')); }
      });
    });
  }

  // → array di {quality:Number, url, format} ordinato per qualità decrescente
  async function qualitaDisponibili() {
    const fv = flashvars();
    if (!fv || !Array.isArray(fv.mediaDefinitions)) return { mp4: [], hls: [] };
    const espanse = [];
    for (const d of fv.mediaDefinitions) {
      if (d && d.remote && d.videoUrl) {
        try {
          const j = await getJSON(new URL(d.videoUrl, location.href).href);
          if (Array.isArray(j)) for (const e of j) espanse.push(e);
        } catch (e) { /* ignora questa definizione */ }
      } else if (d && d.videoUrl) {
        espanse.push(d);
      }
    }
    const mp4 = [], hls = [];
    for (const e of espanse) {
      if (!e || !e.videoUrl) continue;
      const q = parseInt(Array.isArray(e.quality) ? e.quality[0] : e.quality, 10);
      const fmt = (e.format || '').toLowerCase();
      if (fmt === 'hls' || /\.m3u8/i.test(e.videoUrl)) hls.push({ quality: q || 0, url: e.videoUrl });
      else if (fmt === 'mp4' || /\.mp4/i.test(e.videoUrl)) mp4.push({ quality: q || 0, url: e.videoUrl });
    }
    mp4.sort(function (a, b) { return b.quality - a.quality; });
    hls.sort(function (a, b) { return b.quality - a.quality; });
    return { mp4: mp4, hls: hls };
  }

  function pulisciTesto(s) {
    // toglie i caratteri illegali nei nomi file, MA tiene le parentesi quadre [ ]
    return (s || '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // HTML entities of the title decoded by a detached document: DOMParser runs no script and
  // loads nothing, and the page's DOM is never written (the repo rule is: never innerHTML).
  function decodeEntita(s) {
    try { return new DOMParser().parseFromString(s, 'text/html').documentElement.textContent; } catch (e) { return s; }
  }

  function titolo() {
    // 1) titolo canonico dal player (flashvars.video_title): spesso è l'ORIGINALE,
    //    meno soggetto alla traduzione automatica che PH applica all'h1 nella
    //    lingua dell'interfaccia.
    try {
      const fv = flashvars();
      if (fv && typeof fv.video_title === 'string' && fv.video_title.trim()) {
        return pulisciTesto(decodeEntita(fv.video_title)) || 'video';
      }
    } catch (e) { /* continua con l'h1 */ }
    // 2) h1 della pagina (può essere tradotto nella lingua UI)
    const h = document.querySelector('h1.title span, h1.title, .title-container h1, h1.inlineFree');
    let t = (h && h.textContent) ? h.textContent.trim() : (document.title || 'video');
    t = t.replace(/\s*-\s*Pornhub\.com\s*$/i, '').trim();
    return pulisciTesto(t) || 'video';
  }

  // Nome del canale / dell'uploader (per il prefisso "[Canale]"). Provo più selettori
  // (la struttura PH varia) e prendo il primo non vuoto.
  function canale() {
    const sel = [
      '.video-detailed-info .usernameBadgesWrapper a',
      '.video-info-row .usernameWrap a',
      '.video-actions-tabs .usernameBadgesWrapper a',
      '.userInfo a.bolded',
      '[data-entity="user"] a.bolded',
      '.channelsWrapper .title a',
      '.channelButton .title',
      'a.bolded[href*="/model/"]',
      'a.bolded[href*="/channels/"]',
      'a.bolded[href*="/pornstar/"]',
      'a.bolded[href*="/users/"]',
      '.pornstarLink'
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const t = el && pulisciTesto(el.textContent);
      if (t) return t;
    }
    return '';
  }

  // Nome file richiesto: "[Nome del canale] Titolo.mp4" (parentesi quadre letterali).
  function nomeFile() {
    const t = titolo();
    const c = canale();
    const base = c ? '[' + c + '] ' + t : t;
    return base.slice(0, 180) + '.mp4';
  }

  const SFONDO_BASE = '#ff9000';
  // Black text on orange and green, white on the red states: black on #d0021b measures 3.71,
  // under the 4.5 of WCAG AA, white on it 5.67.
  const ROSSO = '#d0021b';
  function sfondo(btn, css) {
    if (!btn) return;
    btn.style.setProperty('background', css, 'important');
    btn.style.setProperty('color', css === ROSSO ? '#fff' : '#000', 'important');
  }

  // Stato del download in corso (per poterlo ANNULLARE con un secondo clic).
  var dlAttivo = false;      // c'è un'operazione in corso?
  var dlHandle = null;       // oggetto ritornato da GM_download (ha .abort())
  var dlAnnullato = false;   // l'utente ha annullato?

  // Download con avanzamento: GM_download scarica il file su un temporaneo e SOLO
  // alla fine mostra il salva-file; con onprogress mostriamo la percentuale (e una
  // barra di riempimento) sul tasto durante l'attesa. Promise: si risolve a
  // scaricamento completato, si rifiuta su errore/abort. Salva l'handle per abort().
  function scaricaFile(url, nome, btn) {
    return new Promise(function (resolve, reject) {
      const h = GM_download({
        url: url, name: nome, saveAs: SALVA_CON_DIALOGO,
        headers: { Referer: location.href },
        onprogress: function (e) {
          if (!btn || !e) return;
          if (e.total) {
            const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
            btn.textContent = '⬇️ ' + pct + '%';
            sfondo(btn, 'linear-gradient(90deg,#12b76a ' + pct + '%,' + SFONDO_BASE + ' ' + pct + '%)');
          } else if (e.loaded) {
            btn.textContent = '⬇️ ' + (e.loaded / 1048576).toFixed(1) + ' MB';
          }
        },
        onload: function () { resolve(); },
        onerror: function (err) { reject(err || new Error('download')); },
        ontimeout: function () { reject(new Error('timeout')); }
      });
      dlHandle = (h && typeof h.abort === 'function') ? h : null;
    });
  }

  function annullaDownload(btn) {
    dlAnnullato = true;
    try { if (dlHandle && dlHandle.abort) dlHandle.abort(); } catch (e) {}
    dlHandle = null;
    dlAttivo = false;
    if (btn) {
      btn.textContent = '✖︎ cancelled';
      sfondo(btn, ROSSO);
      setTimeout(function () {
        if (!dlAttivo) { btn.textContent = '⬇️ Download video'; sfondo(btn, SFONDO_BASE); }
      }, 3500);
    }
  }

  async function scarica(btn) {
    // Secondo clic mentre è in corso → ANNULLA.
    if (dlAttivo) { annullaDownload(btn); return; }

    dlAttivo = true; dlAnnullato = false; dlHandle = null;
    const testo0 = '⬇️ Download video';
    // NB: il tasto resta cliccabile (non disabled) così un altro clic annulla.
    if (btn) { btn.title = 'Click again to cancel'; btn.textContent = '⏳ Finding quality...'; }
    try {
      const q = await qualitaDisponibili();
      if (dlAnnullato) return;
      if (!q.mp4.length) {
        if (q.hls.length) {
          alert('PH Roccobot: this video is only available as HLS (.m3u8 segmented stream), not as a direct MP4 file.\n' +
                'A direct MP4 download is not possible here. (Ask for HLS support with segment joining if you need it.)');
        } else {
          alert('PH Roccobot: no video source found on this page (did the markup change?). Report it and the script will be updated.');
        }
        return;
      }
      const best = q.mp4[0];
      const nome = nomeFile();
      if (btn) { btn.textContent = '⬇️ 0%'; }
      try {
        await scaricaFile(best.url, nome, btn);
        if (dlAnnullato) return;
        if (btn) { btn.textContent = '✅ ' + (best.quality || '') + 'p'; sfondo(btn, '#12b76a'); }
      } catch (err) {
        if (dlAnnullato) return; // l'errore è l'abort volontario: nessun ripiego
        // ripiego: apri l'URL così l'utente può salvarlo a mano
        window.open(best.url, '_blank', 'noopener');
        if (btn) { btn.textContent = '↗︎ opened'; sfondo(btn, ROSSO); }
      }
    } catch (e) {
      if (dlAnnullato) return;
      alert('PH Roccobot: could not prepare the download.\n' + (e && e.message ? e.message : e));
      if (btn) { btn.textContent = '⚠️ Error'; sfondo(btn, ROSSO); }
    } finally {
      const eraAnnullato = dlAnnullato;
      dlAttivo = false; dlHandle = null;
      if (btn) {
        btn.title = 'Download the video at the highest quality available';
        if (!eraAnnullato) setTimeout(function () {
          if (!dlAttivo) { btn.textContent = testo0; sfondo(btn, SFONDO_BASE); }
        }, 8000);
      }
    }
  }

  function aggiungiPulsante() {
    try {
      const esistente = document.getElementById('rb-ph-dl');
      if (esistente) { mostraInCima(esistente); return; }
      if (!document.body) return;
      // Niente più gate "pagina video": il pulsante appare sempre su pornhub.com
      // (se non è una pagina video, al clic dirà che non trova la sorgente). Così
      // non può "sparire" per una rilevazione sbagliata.
      const b = document.createElement('button');
      b.id = 'rb-ph-dl';
      b.type = 'button';
      b.textContent = '⬇️ Download video';
      b.title = 'Download the video at the highest quality available';
      // Touch-first device (pointer: coarse, e.g. Violentmonkey on an Android Chromium browser):
      // the pill moves to the bottom-left corner and grows to a finger-sized target (44 px tall).
      const touch = matchMedia('(pointer: coarse)').matches;
      // stili con !important: il CSS di PornHub non può nasconderlo/spostarlo
      // No extra lift for the address bar: from 1.12.0 to 1.12.2 the pill added 100lvh - 100dvh,
      // and on Quetta, whose fixed elements already sit above the bar, it rose twice (reported on
      // 2026-11-02, choice Pillola-01). The pill hidden until the end of the page came from its
      // place in the tree, solved below.
      const basso = 'calc(16px + env(safe-area-inset-bottom, 0px))';
      const st = {
        'position': 'fixed', 'bottom': basso, 'top': 'auto',
        [touch ? 'left' : 'right']: '16px', [touch ? 'right' : 'left']: 'auto', 'z-index': '2147483647',
        'display': 'block', 'visibility': 'visible', 'opacity': '0.92',
        // larghezza FISSA + testo centrato: le cifre della percentuale non fanno
        // "ballare" il tasto; il testo lungo viene troncato con l'ellissi.
        'width': '200px', 'box-sizing': 'border-box', 'text-align': 'center',
        'white-space': 'nowrap', 'overflow': 'hidden', 'text-overflow': 'ellipsis',
        'height': 'auto', 'margin': '0', 'padding': touch ? '15px 14px' : '10px 14px',
        'border': 'none', 'border-radius': '999px',
        'background': '#ff9000', 'color': '#000',
        'font': '700 14px/1 system-ui, -apple-system, sans-serif',
        'cursor': 'pointer', 'box-shadow': '0 4px 14px rgba(0,0,0,.4)',
        'text-transform': 'none', 'letter-spacing': 'normal', 'line-height': '1'
      };
      for (const k in st) b.style.setProperty(k, st[k], 'important');
      b.addEventListener('mouseenter', function () { b.style.setProperty('opacity', '1', 'important'); });
      b.addEventListener('mouseleave', function () { b.style.setProperty('opacity', '0.92', 'important'); });
      b.addEventListener('click', function () { scarica(b); });
      b.setAttribute('popover', 'manual');
      // Last child of <html>, outside <body>: a transform or filter on <body> cannot turn
      // `position: fixed` into 'fixed to the end of the page', and coming last in the tree it is
      // drawn after every element of the page with the same z-index. This holds on browsers
      // without popovers too (Chromium before 114), where the top layer below does not exist:
      // reported on 2026-11-02 from the phone with 1.12.1, measured the same day by removing
      // showPopover in an emulated Pixel 7 (the pill 8,582 px from the top, off screen).
      document.documentElement.appendChild(b);
      mostraInCima(b);
    } catch (e) { /* mai rompere la pagina */ }
  }

  // The pill lives in the browser's top layer (a manual popover), above everything the page draws
  // (reported on 2026-11-02 from the phone: with 1.12.0 the pill did not show at all). In the top
  // layer no z-index of the site can cover it, and no transform, filter or containment on one of
  // its ancestors can turn `position: fixed` into 'fixed to the end of the page', which is how a
  // pill shows only after scrolling to the bottom. The inline styles above override the popover's
  // own defaults (inset 0, margin auto, border, padding, colours). A pill that the page took out
  // and put back closes its popover, hence the check on every pass. Browsers without popovers
  // keep the plain fixed pill.
  function mostraInCima(b) {
    try {
      if (typeof b.showPopover === 'function' && !b.matches(':popover-open')) b.showPopover();
    } catch (e) { /* not in the document, or popovers unsupported: the fixed pill stays */ }
  }

  // PH è in parte una SPA: il pulsante va (ri)messo quando compare un video.
  function avvio() {
    aggiungiPulsante();
    // PH è una SPA e a volte ricostruisce il DOM: si riprova con l'observer...
    try {
      new MutationObserver(function () { aggiungiPulsante(); })
        .observe(document.documentElement, { subtree: true, childList: true });
    } catch (e) {}
    // ...e con una rete di sicurezza a intervalli (finché il pulsante non c'è).
    let n = 0;
    const iv = setInterval(function () {
      aggiungiPulsante();
      if (++n > 20 || document.getElementById('rb-ph-dl')) clearInterval(iv);
    }, 700);
    window.addEventListener('load', aggiungiPulsante);
  }

  if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('Download the video (highest quality)', function () { scarica(document.getElementById('rb-ph-dl')); });
    GM_registerMenuCommand('Ad check', controlloPubblicita);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
  else avvio();
})();
