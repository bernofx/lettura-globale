# PROGRESS — Lettura Globale

**Aggiornato:** 16 ottobre 2026

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
- [x] Etichette in stampatello maiuscolo, fotografie realistiche disponibili nel catalogo demo e parole sotto le immagini.
- [x] Creazione e modifica degli esercizi parola→immagine, duplicazione e cancellazione logica con storico preservato.
- [x] Creazione, selezione, rinomina, riordino e cancellazione logica delle sequenze; sequenza attiva salvata in D1.
- [x] Anteprima `Prova` collegata all'esercizio selezionato.
- [x] Modalità foto + parole e solo parole con parola visibile, sintesi vocale italiana e comando per riascoltare.
- [x] Ordine casuale e stabile delle risposte durante la singola prova.
- [x] Esercizio `IL / LA` con una sola immagine per volta, drag and drop e alternativa touch/tastiera.
- [x] Esercizi `IL / LA` configurabili per immagini e numero di turni, inseribili e riordinabili nelle sequenze miste.
- [x] Modalità insegnamento e verifica, primo tentativo unico, correzioni separate e aiuti registrati.
- [x] Test di dominio per primo tentativo, doppio tap, correzione, nuovo item e registrazione aiuti.
- [x] Statistiche descrittive per parola, parola + esercizio ed esercizio, con andamento giornaliero, export CSV e azzeramento controllato per bambino.
- [x] L’amministratore può creare, associare ed eliminare i profili terapista non amministrativi.
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

1. Aggiungere controllo di revisione D1 e gestione esplicita dei conflitti.
2. Definire permessi terapista/genitore, inviti e recupero accesso.
3. Spostare validazione, resize e varianti immagini nel Worker mantenendo R2 privato.
4. Completare test end-to-end desktop/mobile, accessibilità e sicurezza.
5. Definire retention, backup e prova di ripristino D1/R2.
6. Preparare ambienti Cloudflare separati e pipeline protetta di promozione verso produzione.
7. Valutare la generazione AI opzionale dopo ADR su provider, privacy, moderazione e budget.

## Verifiche della versione corrente

- `pnpm test`: copre primo tentativo, correzione, doppio tap e aiuti.
- `pnpm lint`: superato con i soli tre avvisi già noti sugli elementi `<img>` usati per anteprime e file dinamici.
- `pnpm typecheck`: superato senza errori.
- `pnpm build`: superato senza errori.
- Pubblicazione Sites successiva alla verifica corrente, con binding D1/R2 invariati.
- Browser QA prevista su sequenza mista, configuratore IL/LA, ordine stabile delle risposte, statistiche e cancellazione terapista.
