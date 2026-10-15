# PROGRESS — Lettura Globale

**Aggiornato:** 15 ottobre 2026  
**Fase:** prototipo funzionale  
**Milestone:** M0 completata in parte; avvio M3/M4 in modalità demo

## Completato

- [x] Repository e piano operativo predisposti.
- [x] Repository GitLab privato creato in `bernofx-group/lettura-globale`.
- [x] Progetto React/TypeScript strict basato su starter Sites.
- [x] UI responsive adulto per desktop e touch.
- [x] Libreria demo con ricerca, metadati e upload privato locale.
- [x] Creazione esercizio parola→immagine e aggiornamento sequenza.
- [x] Modalità insegnamento e verifica.
- [x] Primo tentativo separato dalle correzioni.
- [x] Tracciamento manuale degli aiuti.
- [x] Statistiche descrittive ed export CSV.
- [x] Persistenza locale per il prototipo.
- [x] Typecheck e build completati.

## Limitazioni note

- autenticazione, D1 e R2 non ancora collegati;
- upload memorizzato nel browser, senza resize server-side;
- catalogo immagini stock solo dimostrativo, nessuna API esterna;
- dati e nomi presenti sono fittizi;
- test automatici applicativi ancora da introdurre.
- pipeline GitLab bloccata dalla verifica identità richiesta dall'account, non da un job applicativo.

## Prossimi passi

1. Proteggere `main` e adottare branch/Merge Request.
2. Chiudere ADR su identità, provider stock e pipeline immagini.
3. Introdurre test unitari per primo tentativo, correzioni e aiuti.
4. Preparare D1/R2 e schema migrazioni in staging.
5. Sostituire storage locale con API autenticata.
6. Completare verifica accessibilità e test cross-device.

## Verifiche ultima versione

- `pnpm lint`: superato con soli avvisi sulle immagini locali della demo.
- `pnpm typecheck`: superato.
- `pnpm build`: superato.
- Browser QA: avvio sessione, errore al primo tentativo, aiuto, correzione e layout mobile verificati.
