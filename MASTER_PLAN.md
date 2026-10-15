# MASTER PLAN — Lettura Globale

## Obiettivo

Realizzare una PWA per un solo bambino nell'MVP, usata sempre in presenza di un adulto. Terapista o genitore prepara l'attività, conduce la sessione e decide ogni aiuto.

## Vincoli di prodotto

- esercizi singoli e sequenze salvabili;
- modalità insegnamento e verifica;
- primo tentativo unico e immutabile, separato dalle correzioni;
- tracciamento del tipo e del momento degli aiuti;
- statistiche separate per modalità, primo tentativo e correzioni;
- PC/mouse come riferimento, touch responsive su tablet e smartphone;
- nessuna diagnosi o raccomandazione clinica automatica.

## Contenuti e immagini

- libreria privata di parole e immagini;
- upload JPEG/PNG/WebP validato, normalizzato e ridimensionato;
- ricerca futura soltanto tramite API ufficiali di provider stock approvati;
- niente scraping né download da URL arbitrari;
- import con un click/tap e conservazione di provider, asset ID, autore, fonte, licenza e data;
- R2 privato e accesso autenticato o firmato nella versione cloud.

Il catalogo attuale è esclusivamente dimostrativo. Prima di integrare immagini stock reali occorre un ADR sul provider e sulle licenze.

## Architettura target

- React + TypeScript strict, PWA responsive;
- Cloudflare Workers per API e autorizzazione;
- Cloudflare D1 per dati relazionali;
- Cloudflare R2 per immagini e varianti;
- API versionate e convalida degli input al confine server;
- ambienti dev, staging e prod completamente separati.

Durante la prototipazione il frontend viene pubblicato privatamente su ChatGPT Sites e usa storage locale. Nessun dato reale di minori è ammesso in questa fase.

## Dati essenziali

Entità previste: adult users, child profile, words, images, image variants, licenses, exercises, sequences, sessions, session items, attempts, assistance events e audit events.

Vincoli fondamentali:

- massimo un primo tentativo per item di sessione;
- tentativi e aiuti append-only;
- snapshot/versione dell'esercizio nello storico;
- timestamp UTC;
- cancellazione e retention coerenti anche fra D1, R2 e backup.

## Sicurezza e privacy

- dati minimi e pseudonimi;
- autorizzazione server-side deny-by-default;
- bucket privati e secrets mai nel client o repository;
- controlli upload, SSRF, XSS, CSRF, injection e rate limit;
- nessun tracker o cookie marketing;
- threat model, privacy review e restore test prima del pilot;
- verifica legale applicabile ai dati di minori prima dell'uso reale.

## Workflow GitLab

- repository privato e `main` protetto;
- branch brevi `feat/`, `fix/`, `docs/`, `chore/` collegati a issue;
- Merge Request con pipeline verde e revisione;
- `git pull --ff-only` prima del lavoro e push prima di cambiare postazione;
- migrazioni D1 numerate, versionate e forward-only;
- produzione soltanto da job protetto e approvato.

## Milestone

### M0 — Fondazioni

Repository, pipeline, ambienti, ADR iniziali, threat model e documentazione. Accettazione: lint, typecheck e build verdi; nessun secret; hosting di prova privato.

### M1 — Libreria e accesso adulto

Autenticazione, ruoli, parole, upload privato, varianti R2 e audit. Accettazione: utente non autorizzato escluso, upload validato e interfaccia mouse/touch verificata.

### M2 — Immagini stock

Provider ufficiale, import sicuro e metadati licenza. Accettazione: un click/tap completa import e resize; chiavi soltanto server-side.

### M3 — Esercizi e sequenze

Creazione, anteprima, duplicazione, riordino, versioni e validazione. Accettazione: flusso completo desktop e touch.

### M4 — Sessioni

Insegnamento, verifica, aiuti e idempotenza. Accettazione: un solo primo tentativo per item e correzioni separate anche con retry/doppio tap.

### M5 — Statistiche

Dashboard, filtri ed export. Accettazione: risultati verificati su dataset noto e accesso riservato all'adulto.

### M6 — Hardening e pilot

PWA, accessibilità, sicurezza, privacy, backup/restore, UAT e runbook. Accettazione: nessun finding critico/alto aperto e approvazione esplicita prima di Cloudflare produzione.

## ADR ancora necessari

1. identità e permessi terapista/genitore;
2. provider stock e licenze;
3. pipeline di resize immagini;
4. CI/CD definitiva e strategia deploy Cloudflare;
5. tipi di esercizio e catalogo aiuti;
6. retention, RPO/RTO e backup;
7. osservabilità e browser supportati.
