# PROGRESS — Lettura Globale

**Aggiornato:** 20 ottobre 2026

**Fase:** prototipo cloud funzionale pubblico

**Target:** Cloudflare Workers + D1 + R2, distribuito tramite ChatGPT Sites

## Completato

- [x] Repository GitLab privato, piano operativo, ADR iniziali e pipeline di verifica.
- [x] Landing pubblica separata dal pannello adulto autenticato.
- [x] Sessione applicativa server-side e accesso ai profili adulti con email e PIN.
- [x] Profili `Amministratore`, `Genitore`, `Supervisore` e `Terapista`; creazione e associazione molti-a-molti fra adulti e bambini.
- [x] Stato sincronizzato per account in Cloudflare D1; copia locale usata per reattività e migrazione.
- [x] Immagini private ottimizzate nel browser, caricate in Cloudflare R2 e servite da endpoint autenticato.
- [x] Cancellazione logica e versionamento delle immagini: una scheda archiviata non compare nei nuovi esercizi, mentre il file resta disponibile agli storici che lo referenziano.
- [x] Selezione e modifica dei profili terapista/bambino; tentativi, aiuti e statistiche associati al bambino attivo.
- [x] Libreria con ricerca, metadati, upload, sostituzione, eliminazione e assegnazione `IL / LA` persistenti.
- [x] Catalogo ampliato con 50 parole bisillabiche, dieci per ciascuna delle categorie `Animali`, `Parti del corpo`, `Vestiti`, `Oggetti della natura` e `Cibi`, predisposte per la sostituzione dell'emoji con una fotografia.
- [x] Catalogo ampliato con altri 100 elementi testuali verificati: 34 parole di 2 sillabe, 33 di 3 sillabe e 33 di 4 sillabe, inizialmente senza immagine.
- [x] La libreria consente di aggiungere una parola senza fotografia e di completarla in seguito; gli elementi testuali sono ammessi negli esercizi con sole parole ed esclusi automaticamente dalle attività che richiedono immagini.
- [x] Migrazione trasparente dei nomi storici delle categorie negli elementi e negli esercizi già salvati.
- [x] Migrazione automatica dei doppioni: una foto privata caricata prevale sul placeholder omonimo, che viene disattivato, e i riferimenti degli esercizi vengono riallineati.
- [x] Etichette in stampatello maiuscolo, fotografie realistiche disponibili nel catalogo demo e parole sotto le immagini.
- [x] Creazione e modifica degli esercizi parola→immagine, duplicazione e cancellazione logica con storico preservato.
- [x] Configurazione separata dall'avvio: creazione, selezione, rinomina, riordino e cancellazione logica di esercizi e sequenze in un solo pannello.
- [x] Ricerca per parola o categoria in tutte le griglie di selezione degli elementi, inclusi configuratori e avvio rapido.
- [x] Sequenze associate al terapista proprietario; supervisori e amministratori vedono tutte le sequenze con il nome del proprietario.
- [x] Anteprima `Prova` collegata all'esercizio selezionato, esclusa dalle statistiche e con ritorno automatico alla pagina di configurazione.
- [x] Modalità foto + parole e solo parole con parola visibile, sintesi vocale italiana e comando per riascoltare.
- [x] Pronuncia automatica configurabile per ogni esercizio `Trova la parola`, indipendentemente dalla presentazione con immagini o sole parole.
- [x] In `Abbina la parola` la parola di riferimento può essere trascinata sull’immagine scelta con mouse, dito o penna; il tocco diretto sulle immagini resta disponibile.
- [x] Avanzamento vocale sincronizzato: dopo una risposta corretta il turno successivo parte soltanto al termine della pronuncia, evitando sovrapposizioni audio.
- [x] Feedback di errore temporaneo: “Riproviamo insieme”, bordo e X rossa scompaiono automaticamente senza restare davanti alle immagini.
- [x] Ordine casuale e stabile delle risposte durante la singola prova.
- [x] Modalità casuale standard per `Trova la parola`, con 3/4 distrattori, filtri per parole e categorie e modalità fissa avanzata.
- [x] Filtro sillabico per `Trova la parola` casuale (`2`, `3`, `2 o 3`, `4 o più`), applicato dinamicamente alla libreria anche dopo la creazione dell’esercizio.
- [x] Sillabazione automatica dei nuovi elementi con correzione persistente, segnalazione dei casi dubbi e migrazione verificata dei 97 elementi del catalogo iniziale.
- [x] Generazione dei distrattori senza duplicati, con priorità alla stessa categoria e senza ripetizioni consecutive della parola-obiettivo.
- [x] Esercizio `IL / LA` con una sola immagine per volta, drag and drop e alternativa touch/tastiera.
- [x] Trascinamento `IL / LA` tramite Pointer Events su desktop e mobile, con tocco alternativo; su smartphone la figura è più grande e i box articolo più compatti.
- [x] Esercizio `Parola nella categoria` configurabile, inseribile nelle sequenze e utilizzabile con tocco o trascinamento.
- [x] Esercizio `Mix and vary`: una foto senza testo alla volta, scelta casuale o configurata, esito corretto/errato e indicatore di aiuto registrati dall’adulto.
- [x] `Mix and vary` offre tre esiti diretti: errato, corretto con aiuti e corretto; l’esito aiutato registra automaticamente l’aiuto senza checkbox separata.
- [x] Feedback di errore con bordi rossi sull'elemento e sulla categoria selezionati; effetti sonori corretti/errati disattivabili.
- [x] Effetti sonori di conferma ed errore precaricati e riprodotti dal primo campione udibile, eliminando automaticamente l'eventuale silenzio iniziale degli MP3.
- [x] `Trova la parola` avanza automaticamente dopo la risposta corretta, con spunta verde temporanea; l'errore mostra una X rossa temporanea e mantiene il turno corrente.
- [x] Esercizi `IL / LA` configurabili per immagini e numero di turni, inseribili e riordinabili nelle sequenze miste.
- [x] Modalità insegnamento e verifica, primo tentativo unico, correzioni separate e aiuti registrati.
- [x] Test di dominio per primo tentativo, doppio tap, correzione, nuovo item e registrazione aiuti.
- [x] Statistiche descrittive per parola, parola + esercizio ed esercizio, con andamento giornaliero, export CSV e azzeramento controllato per bambino.
- [x] Storico persistente delle sessioni per bambino con esito visivo verde/rosso al primo tentativo, sequenza completa delle risposte, aiuti, miniature e valutazione testuale modificabile dall’autore della sessione.
- [x] Accesso allo storico per ruolo: il terapista vede le proprie sessioni, genitore e supervisore tutte le sessioni dei bambini associati, l’amministratore ha visibilità completa e può cancellare logicamente singoli storici o l’intero storico del bambino.
- [x] L’amministratore può creare, associare, cambiare ruolo ed eliminare i profili adulti non amministrativi.
- [x] Link pubblici di anteprima per singoli esercizi e sequenze: nessun login, nessuna statistica registrata e ritorno alla Home al termine.
- [x] Navigazione interna integrata con la cronologia del browser; durante un esercizio il tasto Indietro mantiene la sessione protetta, mentre fuori dagli esercizi torna alla schermata precedente.
- [x] Con una modale aperta, il tasto Indietro chiude la modale senza cambiare la pagina sottostante.
- [x] Procedura guidata per la nuova sessione con scelta del bambino, sequenze a nuvoletta, avvio rapido, riepilogo e schermata `PRONTI?`.
- [x] Schermata degli esercizi adattiva all'altezza del dispositivo, con prompt e tutte le opzioni visibili senza scroll e riallineamento automatico a inizio turno.
- [x] Blocco del trascinamento oltre il bordo durante gli esercizi mobili, per evitare il pull-to-refresh accidentale e la perdita dello stato della sessione.
- [x] Pull-to-refresh disponibile nelle pagine di gestione per caricare gli aggiornamenti dopo un deploy; il blocco resta attivo durante gli esercizi.
- [x] Uscita protetta durante gli esercizi con pressione continua di quattro secondi, verifica del PIN adulto e pannello di gestione nascosto; i comandi di sistema di Chrome/PWA restano sotto il controllo del dispositivo.
- [x] Salvataggio locale della sessione attiva e proposta di ripristino alla riapertura per lo stesso adulto e bambino, con scadenza automatica dopo 24 ore.
- [x] Configuratore `Aspetto` con quattro temi predefiniti, palette e forme dei controlli combinabili, anteprima dal vivo e persistenza locale/cloud.
- [x] Bootstrap dati con timeout, retry, fallback alla copia locale e retry al resume/ritorno online; service worker network-first per pagina e asset applicativi aggiornabili.
- [x] Navigazione avanti/indietro per singolo turno in tutti gli esercizi, feedback verde uniforme per IL/LA e categorie, trascinamento touch anche nelle attività con sole parole.
- [x] Avvio rapido temporaneo per tutte le tipologie, con elementi casuali, categorie o scelta manuale, turni configurabili e salvataggio facoltativo come sequenza.
- [x] UI responsive desktop, tablet e smartphone; manifest e service worker PWA.

## Scelte di persistenza e costo

- D1 contiene per ora uno snapshot JSON versionato per account. Una singola scrittura con debounce di 500 ms riduce query e mantiene atomici i dati collegati.
- R2 contiene soltanto i file binari privati, separati dallo stato D1. I riferimenti alle immagini sono salvati nello snapshot.
- Esercizi e sequenze cancellati restano nello snapshot con flag `deleted`, così i risultati storici continuano a essere interpretabili senza duplicare dati.
- Le immagini rimosse o sostituite non vengono eliminate fisicamente da R2: la libreria usa la cancellazione logica e ogni storico conserva il riferimento alla versione mostrata durante la sessione.
- La struttura rimane compatibile con una futura migrazione verso tabelle D1 relazionali, da introdurre quando serve ricerca server-side o modifica concorrente.

## Limitazioni note

- Il modello D1 usa ultima scrittura valida: manca ancora la risoluzione dei conflitti fra modifiche simultanee da più dispositivi.
- L'ottimizzazione dell'immagine avviene nel browser; varianti e validazione server-side definitive sono ancora da realizzare.
- Il catalogo stock è dimostrativo e non usa ancora un provider esterno.
- Il ruolo amministratore gestisce i profili nell'interfaccia; permessi server-side più granulari, inviti e recupero accesso richiedono ulteriore hardening.
- Dati e nomi presenti sono fittizi; il prodotto non è ancora approvato per dati reali di minori.
- La modalità protetta è un controllo dell'interfaccia web: Chrome/PWA non può impedire la chiusura dell'app, i gesti del sistema operativo o altri comandi del dispositivo.
- Mancano ancora test end-to-end, accessibilità completa, backup/restore e hardening per il pilot.

## Prossimi passi

1. Approvare gli ADR ancora aperti del piano `docs/PIANO_SESSIONI_GUIDATE_REALTIME.md`.
2. Eseguire uno spike sul supporto Durable Objects/WebSocket nel flusso ChatGPT Sites, senza deploy di produzione.
3. Introdurre autorizzazioni server-side granulari per amministratore, genitore, supervisore e terapista.
4. Migrare sessioni, trial, tentativi e aiuti verso tabelle D1 relazionali e idempotenti.
5. Aggiungere controllo di revisione allo snapshot D1 e gestione esplicita dei conflitti.
6. Spostare validazione, resize e varianti immagini nel Worker mantenendo R2 privato.
7. Completare test end-to-end desktop/mobile, accessibilità e sicurezza.
8. Definire retention, backup e prova di ripristino D1/R2.
9. Preparare ambienti Cloudflare separati e pipeline protetta di promozione verso produzione.
10. Valutare la generazione AI opzionale dopo ADR su provider, privacy, moderazione e budget.

## Verifiche della versione corrente

- Gli esercizi casuali `Trova la parola` accettano da 1 a 4 distrattori; la sessione desktop adatta la griglia al numero di alternative, amplia le immagini e ingrandisce le scelte nella modalità solo parole.
- L’origine dei distrattori è configurabile: per impostazione predefinita vengono estratti da tutte le parole selezionate; il vincolo alla stessa categoria è opzionale ed esplicito.
- Ogni esercizio `Trova la parola` salva la propria presentazione (`Foto + parole` oppure `Solo parole con voce`), quindi una sequenza può alternare le due modalità; gli esercizi precedenti restano su `Foto + parole`.
- Ogni esercizio `Trova la parola` salva anche la scelta di pronunciare automaticamente il prompt; gli esercizi esistenti conservano il comportamento precedente.
- Gli esercizi precedenti senza filtro sillabico continuano a usare tutta la libreria; i link pubblici già creati restano snapshot immutabili e compatibili con i campi mancanti.
- La libreria propone e salva sillabazione e numero di sillabe. Le grafie potenzialmente ambigue compaiono nel filtro `Da verificare`, mentre le correzioni confermate non vengono sovrascritte.
- Su desktop, due, tre, quattro o cinque alternative occupano una sola riga quando lo spazio lo consente, così le foto conservano un’area verticale ampia e restano interamente visibili.
- `pnpm test`: copre anche sillabazione, casi da verificare, correzioni persistenti, filtro sillabico, composizione del catalogo testuale e separazione tra modalità con immagini e sole parole.
- `pnpm lint`: superato con i soli tre avvisi già noti sugli elementi `<img>` usati per anteprime e file dinamici.
- `pnpm typecheck`: superato senza errori.
- `pnpm build`: superato senza errori.
- Pubblicazione Sites successiva alla verifica corrente, con binding D1/R2 invariati.
- Browser QA automatizzata locale non disponibile su questa macchina perché il runtime Workers/Miniflare termina con `ERR_RUNTIME_FAILURE`; build e verifiche statiche sono completati.
