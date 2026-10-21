# Lettura Globale

PWA assistiva per esercizi di lettura globale guidati da un terapista o genitore.

## Stato

La release attuale è un prototipo funzionale pubblico su Cloudflare Workers. Lo stato applicativo è conservato in D1 e le immagini caricate in R2; il browser mantiene una copia locale per reattività e migrazione. Il deploy applicativo parte automaticamente dagli aggiornamenti del branch `main` su GitHub. Nessun dato reale di minori è ammesso in questa fase.

Funzioni disponibili:

- dashboard adulto responsive;
- pagina iniziale pubblica e accesso al pannello adulto con PIN;
- profili adulti `Amministratore`, `Genitore`, `Supervisore` e `Terapista`, con gestione centralizzata da parte dell’amministratore;
- scelta fra i bambini associati, modifica ed eliminazione protetta dei profili;
- libreria di parole e immagini con provenienza, licenza, cancellazione logica e rimozione automatica dei placeholder duplicati quando è disponibile una foto caricata;
- upload privato con dichiarazione del diritto d'uso;
- esercizi singoli e più sequenze salvabili, anche miste, associate al terapista proprietario, compresa l’attività `Mix and vary` con valutazione manuale dell’adulto;
- avvio rapido di una singola attività o di una sequenza scelta;
- modalità insegnamento e valutazione separate;
- primo tentativo distinto dalle correzioni;
- aiuti scelti dall'adulto e registrati per parola;
- storico persistente per bambino con riepilogo immediato degli errori, dettaglio delle risposte, miniature e valutazione testuale della sessione;
- matrice dei risultati per parola e attività, andamento mensile ed export CSV.

## Sviluppo

Requisiti: Node.js 22+ e pnpm 11.25.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Controlli prima di una Merge Request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Cloudflare Workers Builds usa `pnpm run build` e poi `pnpm run deploy:cloudflare`. La configurazione di produzione è in `wrangler.production.jsonc`; il nome distinto evita che Vinext tenti di risolvere l'artefatto prima di averlo generato. Le migrazioni D1 restano un'operazione separata e controllata. La decisione e le impostazioni del collegamento Git sono documentate in `docs/adr/0011-deploy-cloudflare-da-git.md`.

Leggere sempre `MASTER_PLAN.md`, `AGENTS.md` e `PROGRESS.md` prima di modificare il progetto.

## Hosting

- Demo pubblica: Cloudflare Workers + D1 + R2.
- Deploy applicativo: automatico da `main` tramite Cloudflare Workers Builds.
- Repository autorevole: GitHub, `bernofx/lettura-globale`.

## Credenziali demo

- Email: `giulia@letturaglobale.demo`
- PIN: `1234`
- Email alternativa: `marco@letturaglobale.demo`
- PIN alternativo: `5678`

Sono dati fittizi riservati alla demo. Le credenziali non sono mostrate nella schermata di accesso.
