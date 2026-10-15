# PROGRESS — Lettura Globale

**Aggiornato:** 15 ottobre 2026  
**Fase:** prototipo funzionale pubblico  
**Milestone:** M0 completata in parte; avvio M1/M3/M4 in modalità demo

## Completato

- [x] Repository e piano operativo predisposti.
- [x] Repository GitLab privato creato in `bernofx-group/lettura-globale`.
- [x] Sorgente MVP e pipeline completa pubblicati su GitLab `main`.
- [x] Versione PWA pubblicata su ChatGPT Sites e hosting reso pubblico tramite link.
- [x] Accesso terapista dimostrativo con email e PIN locale.
- [x] Selezione fra bambini associati e modifica dei profili terapista/bambino.
- [x] Eliminazione protetta di terapisti e bambini, con conferma esplicita e pulizia dei dati locali collegati.
- [x] Tentativi, aiuti e statistiche filtrati per bambino attivo.
- [x] Versione Sites 3 pubblicata con successo su hosting pubblico; sorgente sincronizzato nel branch GitLab `feat/therapist-profiles`.
- [x] Progetto React/TypeScript strict basato su starter Sites.
- [x] UI responsive adulto per desktop e touch.
- [x] Manifest e service worker PWA con cache dell'app shell.
- [x] Libreria demo con ricerca, metadati e upload privato locale.
- [x] Libreria estesa a 28 parole/immagini e sequenza demo portata a 23 esercizi.
- [x] Otto voci principali aggiornate con fotografie realistiche generate per il progetto e metadati di provenienza.
- [x] Creazione esercizio parola→immagine e aggiornamento sequenza.
- [x] Etichette delle parole in stampatello maiuscolo nelle schede illustrate.
- [x] Variante di sessione solo parole con sintesi vocale italiana e comando per riascoltare.
- [x] Ordine delle risposte casuale e stabile durante ciascuna prova.
- [x] Etichette sempre collocate sotto le immagini nelle risposte illustrate.
- [x] Sintesi vocale italiana affinata con scelta della migliore voce disponibile e ritmo più chiaro.
- [x] Esercizio di categorizzazione `IL / LA` con trascinamento, alternativa touch/tastiera, ritorno dell’immagine in caso di errore e scomparsa dopo l’abbinamento corretto.
- [x] Modalità insegnamento e verifica.
- [x] Primo tentativo separato dalle correzioni.
- [x] Tracciamento manuale degli aiuti.
- [x] Statistiche descrittive ed export CSV.
- [x] Persistenza locale per il prototipo.
- [x] Typecheck e build completati.

## Limitazioni note

- autenticazione server-side, D1 e R2 non ancora collegati; il login attuale non è un confine di sicurezza;
- upload memorizzato nel browser, senza resize server-side;
- catalogo immagini stock solo dimostrativo, nessuna API esterna;
- dati e nomi presenti sono fittizi;
- test automatici applicativi ancora da introdurre.
- la prima pipeline automatica di GitLab era stata bloccata dalla verifica identità richiesta dall'account; la configurazione iniziale è stata sostituita con verifica applicativa e Secret Detection.

## Prossimi passi

1. Proteggere `main` e adottare branch/Merge Request.
2. Approvare e implementare l'identità server-side descritta come passo successivo in ADR-0001; chiudere provider stock e pipeline immagini.
3. Introdurre test unitari per primo tentativo, correzioni e aiuti.
4. Preparare D1/R2 e schema migrazioni in staging.
5. Sostituire storage locale con API autenticata.
6. Completare verifica accessibilità e test cross-device.

## Verifiche ultima versione

- `pnpm lint`: superato con soli avvisi sulle immagini locali della demo.
- `pnpm typecheck`: superato.
- `pnpm build`: superato.
- Browser QA: avvio sessione, errore al primo tentativo, aiuto, correzione e layout mobile verificati.
- Browser QA: login/logout terapista, cambio bambino, modifica e persistenza dei profili verificati.
- Browser QA: libreria con fotografie e scritte maiuscole, selezione della presentazione, sessione `Foto + parole` e variante `Solo parole` con comando di riascolto verificate senza errori console.
- Browser QA: risposta corretta mostrata in posizioni diverse, parole sotto le foto, ordine stabile durante il tentativo e sintesi vocale senza errori console.
- Browser QA: esercizio `IL / LA` verificato con sei immagini, due box visibili, abbinamento errato che conserva la figura e abbinamento corretto che la rimuove.
- Eliminazione profili: vincoli sull'ultimo terapista e sull'ultimo bambino associato coperti dalla UI; conferma distruttiva documentata in ADR-0002.
