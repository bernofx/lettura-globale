# AGENTS.md — Istruzioni per Codex

1. Leggi `MASTER_PLAN.md`, questo file e `PROGRESS.md` prima di modificare il progetto.
2. Controlla branch e working tree; non sovrascrivere lavoro non tuo.
3. Lavora su una issue GitLab e su un branch breve. Mai push diretto a `main` dopo il bootstrap.
4. Non decidere implicitamente autenticazione, licenze, privacy, retention, provider o deploy: crea un ADR e chiedi approvazione.

## Regole non negoziabili

- Un adulto conduce sempre la sessione e sceglie gli aiuti.
- Il primo tentativo è unico, immutabile e separato dalle correzioni.
- Nessun dato reale di minori in sviluppo, test, issue, log o screenshot.
- Provider immagini soltanto tramite API autorizzate; niente scraping.
- Metadati di fonte e licenza sono obbligatori.
- Secrets mai in codice, log, documentazione o file versionati.
- D1, R2, configurazioni e credenziali separati per ambiente.
- Nessun deploy Cloudflare produzione senza richiesta e approvazione esplicita.

## Definition of Done

- acceptance criteria soddisfatti;
- `pnpm lint`, `pnpm typecheck` e `pnpm build` verdi;
- test pertinenti aggiunti;
- responsive, accessibilità, privacy e sicurezza valutate;
- migrazioni e compatibilità documentate;
- `PROGRESS.md` e ADR aggiornati;
- Merge Request piccola e priva di modifiche estranee.
