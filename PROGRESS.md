# PROGRESS — Lettura Globale

**Aggiornato:** 17 ottobre 2026

**Fase:** prototipo cloud funzionale pubblico

**Target:** Cloudflare Workers + D1 + R2, distribuito tramite ChatGPT Sites

## Completato

- [x] Repository GitLab privato, piano operativo, ADR iniziali e pipeline di verifica.
- [x] Landing pubblica separata dal pannello adulto autenticato.
- [x] Sessione applicativa server-side e accesso ai profili terapista con email e PIN.
- [x] Profilo amministratore iniziale, creazione di terapisti e associazione molti-a-molti fra terapisti e bambini.
- [x] Stato sincronizzato per account in Cloudflare D1; copia locale usata per reattività e migrazione.
- [x] Immagini private ottimizzate nel browser, caricate in Cloudflare R2 e servite da endpoint autenticato.
- [x] Selezione e modifica dei profili terapista/bambino; tentativi, aiuti e statistiche associati al bambino attivo.
- [x] Libreria con ricerca, metadati, upload, sostituzione, eliminazione e assegnazione `IL / LA` persistenti.
- [x] Catalogo ampliato con 50 parole bisillabiche, dieci per ciascuna delle categorie `Animali`, `Parti del corpo`, `Vestiti`, `Oggetti della natura` e `Cibi`, predisposte per la sostituzione dell'emoji con una fotografia.
- [x] Migrazione trasparente dei nomi storici delle categorie negli elementi e negli esercizi già salvati.
- [x] Etichette in stampatello maiuscolo, fotografie realistiche disponibili nel catalogo demo e parole sotto le immagini.
- [x] Creazione e modifica degli esercizi parola→immagine, duplicazione e cancellazione logica con storico preservato.
- [x] Configurazione separata dall'avvio: creazione, selezione, rinomina, riordino e cancellazione logica di esercizi e sequenze in un solo pannello.
- [x] Sequenze associate al terapista proprietario; supervisori e amministratori vedono tutte le sequenze con il nome del proprietario.
- [x] Anteprima `Prova` collegata all'esercizio selezionato, esclusa dalle statistiche e con ritorno automatico alla pagina di configurazione.
- [x] Modalità foto + parole e solo parole con parola visibile, sintesi vocale italiana e comando per riascoltare.
- [x] Ordine casuale e stabile delle risposte durante la singola prova.
- [x] Modalità casuale standard per `Trova la parola`, con 3/4 distrattori, filtri per parole e categorie e modalità fissa avanzata.
- [x] Generazione dei distrattori senza duplicati, con priorità alla stessa categoria e senza ripetizioni consecutive della parola-obiettivo.
- [x] Esercizio `IL / LA` con una sola immagine per volta, drag and drop e alternativa touch/tastiera.
- [x] Esercizio `Parola nella categoria` configurabile, inseribile nelle sequenze e utilizzabile con tocco o trascinamento.
- [x] Feedback di errore con bordi rossi sull'elemento e sulla categoria selezionati; effetti sonori corretti/errati disattivabili.
- [x] `Trova la parola` avanza automaticamente dopo la risposta corretta, con spunta verde temporanea; l'errore mostra una X rossa temporanea e mantiene il turno corrente.
- [x] Esercizi `IL / LA` configurabili per immagini e numero di turni, inseribili e riordinabili nelle sequenze miste.
- [x] Modalità insegnamento e verifica, primo tentativo unico, correzioni separate e aiuti registrati.
- [x] Test di dominio per primo tentativo, doppio tap, correzione, nuovo item e registrazione aiuti.
- [x] Statistiche descrittive per parola, parola + esercizio ed esercizio, con andamento giornaliero, export CSV e azzeramento controllato per bambino.
- [x] L’amministratore può creare, associare, promuovere a supervisore ed eliminare i profili terapista non amministrativi.
- [x] Link pubblici di anteprima per singoli esercizi e sequenze: nessun login, nessuna statistica registrata e ritorno alla Home al termine.
- [x] Navigazione interna integrata con la cronologia del browser: il tasto Indietro torna alla schermata precedente e interrompe in modo pulito l'attività in corso.
- [x] Procedura guidata per la nuova sessione con scelta del bambino, sequenze a nuvoletta, avvio rapido, riepilogo e schermata `PRONTI?`.
- [x] Schermata degli esercizi adattiva all'altezza del dispositivo, con prompt e tutte le opzioni visibili senza scroll e riallineamento automatico a inizio turno.
- [x] Avvio rapido temporaneo per tutte le tipologie, con elementi casuali, categorie o scelta manuale, turni configurabili e salvataggio facoltativo come sequenza.
- [x] UI responsive desktop, tablet e smartphone; manifest e service worker PWA.

## Scelte di persistenza e costo

- D1 contiene per ora uno snapshot JSON versionato per account. Una singola scrittura con debounce di 500 ms riduce query e mantiene atomici i dati collegati.
- R2 contiene soltanto i file binari privati, separati dallo stato D1. I riferimenti alle immagini sono salvati nello snapshot.
- Esercizi e sequenze cancellati restano nello snapshot con flag `deleted`, così i risultati storici continuano a essere interpretabili senza duplicare dati.
- Le immagini rimosse vengono eliminate da R2; i record applicativi restano marcati come cancellati finché servono ai riferimenti esistenti.
- La struttura rimane compatibile con una futura migrazione verso tabelle D1 relazionali, da introdurre quando serve ricerca server-side o modifica concorrente.

## Limitazioni note

- Il modello D1 usa ultima scrittura valida: manca ancora la risoluzione dei conflitti fra modifiche simultanee da più dispositivi.
- L'ottimizzazione dell'immagine avviene nel browser; varianti e validazione server-side definitive sono ancora da realizzare.
- Il catalogo stock è dimostrativo e non usa ancora un provider esterno.
- Il ruolo amministratore gestisce i profili nell'interfaccia; permessi server-side più granulari, inviti e recupero accesso richiedono ulteriore hardening.
- Dati e nomi presenti sono fittizi; il prodotto non è ancora approvato per dati reali di minori.
- Mancano ancora test end-to-end, accessibilità completa, backup/restore e hardening per il pilot.

## Prossimi passi

1. Approvare gli ADR ancora aperti del piano `docs/PIANO_SESSIONI_GUIDATE_REALTIME.md`.
2. Eseguire uno spike sul supporto Durable Objects/WebSocket nel flusso ChatGPT Sites, senza deploy di produzione.
3. Introdurre autorizzazioni server-side granulari per amministratore, terapista, genitore e bambino.
4. Migrare sessioni, trial, tentativi e aiuti verso tabelle D1 relazionali e idempotenti.
5. Aggiungere controllo di revisione allo snapshot D1 e gestione esplicita dei conflitti.
6. Spostare validazione, resize e varianti immagini nel Worker mantenendo R2 privato.
7. Completare test end-to-end desktop/mobile, accessibilità e sicurezza.
8. Definire retention, backup e prova di ripristino D1/R2.
9. Preparare ambienti Cloudflare separati e pipeline protetta di promozione verso produzione.
10. Valutare la generazione AI opzionale dopo ADR su provider, privacy, moderazione e budget.

## Verifiche della versione corrente

- `pnpm test`: 22 test; copre primo tentativo, correzione, doppio tap, aiuti, esclusione di anteprime e prove dalle statistiche, generazione casuale, filtri dell’avvio rapido, validazione dei distrattori, link pubblici di anteprima e accesso alle sequenze per ruolo/proprietario.
- `pnpm lint`: superato con i soli tre avvisi già noti sugli elementi `<img>` usati per anteprime e file dinamici.
- `pnpm typecheck`: superato senza errori.
- `pnpm build`: superato senza errori.
- Pubblicazione Sites successiva alla verifica corrente, con binding D1/R2 invariati.
- Browser QA automatizzata locale non disponibile su questa macchina perché il runtime Workers/Miniflare termina con `ERR_RUNTIME_FAILURE`; build e verifiche statiche sono completati.
