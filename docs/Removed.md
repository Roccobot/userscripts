# Removed.md: le cose tolte dagli userscript, e come si recuperano

> **Cos'è questo file.** L'archivio di quello che è uscito dagli userscript: per ogni cosa tolta,
> che cosa faceva, quando è stata tolta, e da quale commit si recupera. Si legge su richiesta,
> quando qualcuno vuole riportare indietro una funzione o capire dove viveva.
> ⚠️ **Nei file di regole resta solo la decisione** (che la cosa non c'è più, e perché): ogni
> appunto su come recuperarla vive qui, corto o lungo che sia (regola universale in
> `rules/Roccobot.md` di `Roccobot/tools`, § '🗄️ Le cose tolte vivono in Removed.md').
> Le voci vanno dalla più recente alla più vecchia.

## 🎞️ javguru.fit e il ponte coi frame

- **Che cosa faceva**: `ENFRoccobot.user.js` copriva anche javguru.fit, dove il video è in un
  iframe di `upload18` col suo jwplayer. Per vederlo lo script girava **anche nei frame**, con
  due comportamenti:
  - dentro il frame nessuna interfaccia, solo un annuncio al livello sopra degli indirizzi visti
    passare, **ripetuto** perché il player chiede il manifest qualche secondo dopo il
    caricamento;
  - nella pagina in cima raccoglieva gli annunci, li univa alle sue fonti, e **bussava** ai
    frame quando si apriva dopo che il player aveva già chiesto il manifest; nel picker quelle
    voci avevano l'etichetta `embedded player (<dominio>)`.
- **Tolto nella `1.3.0`** (2026-08-18): il perché, cioè la misura sul player cifrato e che cosa
  farebbe riaprire la questione, resta in `Rules.md` § '📥 ENF Roccobot: il picker, e il sito
  che è stato tolto'. Con lui è tornato `@noframes`.
- **Si recupera dal commit `2798ca2^`**, cioè il genitore del commit di `main` della `1.3.0`
  (il repo non ha tag), dove lo script è alla `1.2.0`. Dove viveva, tutto in
  `ENFRoccobot.user.js`:
  - nell'intestazione, i `@match` di `javguru.fit`, `*.javguru.fit`, `upload18.org` e
    `upload18.cc`, i `@connect` degli stessi domini, e l'assenza di `@noframes`;
  - la sezione `2c) PLAYER DENTRO UN IFRAME`, con le costanti `CANALE` e `CHIEDI`, l'elenco
    `daiFrame` e le funzioni `dentroUnFrame`, `annunciaAlPadre`, `ascoltaIFrame`,
    `bussaAiFrame` e `avvioNelFrame`;
  - i loro agganci in `fonti()`, nel picker e nell'avvio.
- Il comando che mostra lo script di allora: `git show 2798ca2^:ENFRoccobot.user.js`.
