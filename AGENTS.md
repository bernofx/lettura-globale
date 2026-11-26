# AGENTS.md — Istruzioni per gli agenti di sviluppo

1. Leggi `MASTER_PLAN.md`, questo file e `PROGRESS.md` prima di modificare il progetto.
2. Controlla branch e working tree; non sovrascrivere lavoro non tuo.
3. Lavora su una issue e su un branch breve del repository autorevole GitHub (`bernofx/lettura-globale`, ADR 0011); integra tramite Pull Request. Mai push diretto a `main` dopo il bootstrap.
4. Non decidere implicitamente autenticazione, licenze, privacy, retention, provider o deploy: crea un ADR e chiedi approvazione.
5. Quando aggiungi una tipologia di esercizio o un nuovo valore enumerato persistito, controlla tutti i `CHECK` D1 già distribuiti (non solo lo schema corrente), inclusi esercizi, item di sessione e storico. Prevedi una migrazione forward-only oppure una codifica retrocompatibile; aggiungi test di round-trip e di scrittura con lo schema storico. Vedi `docs/MIGRAZIONE_DATI_RELAZIONALE.md`.

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
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` verdi (gli stessi controlli della CI GitHub `.github/workflows/ci.yml`);
- test pertinenti aggiunti;
- responsive, accessibilità, privacy e sicurezza valutate;
- migrazioni e compatibilità documentate;
- `PROGRESS.md` e ADR aggiornati;
- Pull Request piccola e priva di modifiche estranee.

## Struttura del codice UI

- `app/page.tsx`: solo composizione dell'app (stato di sessione, navigazione, dialoghi).
- `app/features/<area>/`: componenti e hook per area (`app-state`, `shell`, `home`, `library`, `exercises`, `session`, `stats`, `profiles`, `settings`, `remote`).
- `app/shared/`: tipi, costanti, dati iniziali, client cloud, audio, hook comuni e `shared/ui` (modali, intestazioni, controlli di form). Prima di creare markup ripetuto (modali, conferme, intestazioni, PIN, caselle con descrizione) usa questi componenti.
- `app/domain/`: logica pura e testata, senza React.
- Stili dell’interfaccia (Classico, Studio, Giocoso): il markup è unico e condiviso; le differenze stanno in `app/interface-styles.css` sotto `html[data-style="…"]`. Non duplicare componenti o pagine per stile: se uno stile richiede un elemento in più, aggiungilo al markup comune e nascondilo negli altri stili. Ogni modifica alla UI va verificata nei tre stili.
