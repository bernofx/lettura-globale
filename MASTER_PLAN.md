# MASTER PLAN — Lettura Globale

## Obiettivo

Realizzare una PWA per un solo bambino nell'MVP, usata sempre in presenza di un adulto. Terapista o genitore prepara l'attività, conduce la sessione e decide ogni aiuto.

## Vincoli di prodotto

- esercizi singoli e sequenze salvabili;
- esercizi singoli e sequenze condivisibili tramite link pubblico di anteprima, senza login e senza registrazione di statistiche;
- `Trova la parola` casuale come modalità standard, con configurazione fissa avanzata;
- classificazione di immagini per articolo e di parole per categorie configurabili;
- feedback visivo, testuale e sonoro disattivabile;
- modalità insegnamento e valutazione, analizzate separatamente;
- primo tentativo unico e immutabile, separato dalle correzioni;
- tracciamento del tipo, del momento, della parola e della modalità degli aiuti;
- statistiche separate per modalità, con matrice parola × attività ed evoluzione mensile;
- storico persistente delle sessioni per bambino, con fotografia di immagini, opzioni, risposte, errori, aiuti e valutazione dell’adulto;
- PC/mouse come riferimento, touch responsive su tablet e smartphone;
- nessuna diagnosi o raccomandazione clinica automatica.

## Contenuti e immagini

- libreria privata di parole e immagini;
- vocabolario iniziale organizzato nelle categorie didattiche `Animali`, `Parti del corpo`, `Vestiti`, `Oggetti della natura` e `Cibi`, con termini semplici e facilmente rappresentabili;
- upload JPEG/PNG/WebP validato, normalizzato e ridimensionato;
- ricerca futura soltanto tramite API ufficiali di provider stock approvati;
- generazione AI opzionale, attivabile dall'adulto, tramite API ufficiale di un provider approvato;
- niente scraping né download da URL arbitrari;
- import con un click/tap e conservazione di provider, asset ID, autore, fonte, licenza e data;
- R2 privato e accesso autenticato o firmato nella versione cloud.
- cancellazione logica degli asset usati nello storico e conservazione della versione mostrata al bambino;

Il catalogo attuale è esclusivamente dimostrativo. Prima di integrare immagini stock reali occorre un ADR sul provider e sulle licenze.

### Opzione futura — Generazione immagini AI

La generazione AI è una funzione facoltativa della libreria, non un requisito dell'MVP. L'adulto inserisce una descrizione breve, per esempio `paperella di gomma verde`; il backend la combina con un modello di prompt fisso per produrre un'immagine semplice, fotorealistica, con un solo soggetto, sfondo neutro e senza testo o marchi. L'immagine viene mostrata in anteprima e salvata nella libreria soltanto dopo conferma esplicita.

Vincoli previsti:

- chiamata al provider esclusivamente server-side e chiave API conservata nei secrets dell'ambiente;
- una sola proposta per richiesta, rigenerazione manuale e nessuna generazione automatica;
- formato WebP compresso e salvataggio nel bucket R2 privato già associato all'utente;
- parola, categoria e assegnazione `IL / LA` confermate prima dell'import;
- limite mensile, rate limit, contatore dei consumi e blocco al raggiungimento del budget;
- riuso di risultati già approvati per descrizioni equivalenti, quando appropriato;
- nessun nome, volto, fotografia o altro dato personale del bambino nei prompt;
- registrazione di provider, modello, prompt normalizzato, costo/uso restituito dall'API e data di creazione;
- disponibilità subordinata a un ADR dedicato su provider, trattamento dati, moderazione, costi e retention.

Configurazione iniziale proposta per la valutazione: OpenAI Images API con modello rapido/economico, qualità bassa, immagine quadrata e tetto di spesa configurabile. La scelta del provider resta aperta fino all'approvazione dell'ADR; l'abbonamento ChatGPT personale non viene considerato una credenziale API dell'applicazione.

### Opzione futura — Storie sociali personalizzabili

La creazione di storie sociali dovrà poter funzionare anche senza AI. L'adulto sceglie uno dei tre percorsi: composizione interamente manuale, procedura guidata con domande pertinenti alla situazione oppure generazione di una bozza modificabile. In tutti i casi il controllo editoriale resta all'adulto.

Ogni scena è indipendente e consente di:

- scrivere liberamente il proprio testo, accettare un suggerimento AI oppure modificare il testo generato;
- caricare una propria immagine, sceglierla dalla libreria o generarne una, combinando liberamente le tre fonti nella stessa storia;
- sostituire, ritagliare o rigenerare soltanto l'immagine della scena;
- usare sintesi vocale, registrazione personale o nessun audio;
- riordinare, duplicare, aggiungere ed eliminare scene;
- applicare una modifica alla singola scena oppure, quando pertinente, all'intera storia;
- rivedere lo storyboard prima della generazione delle immagini ed esportarlo in un formato stampabile/PDF.

Il flusso guidato non usa un questionario fisso: parte dalla descrizione libera e pone soltanto le domande mancanti rilevanti, per esempio persone presenti, luogo reale, sequenza degli eventi, sensibilità sensoriali, passaggio difficile, aiuti e conclusione rassicurante. Personaggi, ambienti e stile devono restare coerenti tra le scene, senza impedire l'uso di fotografie reali.

Prima dell'implementazione serve un ADR dedicato a consenso e immagini di minori o terzi, trattamento dei prompt e delle fotografie, conservazione e cancellazione, provider AI, moderazione, costi e divieto di usare i contenuti per addestramento. Le storie e i relativi asset seguono il principio cloud-first dell'app, con coda locale soltanto in assenza di rete.

## Architettura target

- React + TypeScript strict, PWA responsive;
- Cloudflare Workers per API e autorizzazione;
- Cloudflare D1 per dati relazionali;
- Cloudflare R2 per immagini e varianti;
- API versionate e convalida degli input al confine server;
- ambienti dev, staging e prod completamente separati.

La demo è pubblicata direttamente su Cloudflare Workers. La pagina iniziale e le anteprime condivise sono pubbliche, mentre pannello e dati privati richiedono la sessione dell'applicazione. D1 conserva lo stato per account, le credenziali dei profili adulto e gli snapshot minimali delle anteprime protetti da token casuali; R2 conserva le immagini e le rende disponibili all’anteprima soltanto tramite il relativo token. Il browser mantiene una copia locale per reattività e migrazione. Il PIN seleziona il profilo adulto all'interno dell'account e non sostituisce l'identità principale. Un amministratore crea i profili adulti e li associa ai bambini; lo stesso bambino può essere condiviso da più terapisti senza duplicarne dati e storico. Il terapista consulta le sessioni che ha condotto, mentre genitore e supervisore consultano tutte le sessioni dei bambini associati; l’amministratore ha visibilità completa e, nella fase di prova, può cancellare logicamente gli storici. Nessun dato reale di minori è ammesso prima della privacy review e del pilot approvato.

Per tutti i dati e le preferenze dell’account il cloud è la fonte primaria. Il salvataggio locale è ammesso solo come copia reattiva o coda offline; ogni modifica rimasta locale deve essere sincronizzata automaticamente alla prima occasione utile quando la rete e il backend tornano disponibili.

La demo è pubblicata direttamente su Cloudflare Workers e gli aggiornamenti applicativi di `main` vengono distribuiti da Cloudflare Workers Builds secondo l'ADR 0011. D1 e R2 esistenti restano collegati al Worker e le migrazioni D1 richiedono un passaggio esplicito separato. La separazione completa staging/produzione e la promozione protetta restano necessarie prima di usare dati reali. Lo snapshot JSON attuale riduce query e costi nella fase iniziale; il passaggio a tabelle relazionali separate avverrà soltanto quando concorrenza, ricerca o volume lo renderanno necessario.

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

### M0 — Fondazioni *(in corso)*

Repository, pipeline, ambienti, ADR iniziali, threat model e documentazione. Accettazione: lint, typecheck e build verdi; nessun secret; hosting di prova privato.

### M1 — Libreria e accesso adulto *(base cloud completata, hardening in corso)*

Autenticazione, ruoli, parole, upload privato, varianti R2 e audit. Accettazione: utente non autorizzato escluso, upload validato e interfaccia mouse/touch verificata.

### M2 — Immagini stock e generazione AI opzionale

Provider ufficiali, import sicuro, metadati di provenienza e generazione AI facoltativa con anteprima. Accettazione: un click/tap completa import e resize; la generazione richiede conferma esplicita; chiavi soltanto server-side; limiti e costi verificabili.

### M3 — Esercizi e sequenze *(flusso applicativo completato)*

Configurazione separata dall'avvio, con creazione, anteprima, duplicazione, riordino, generazione casuale, classificazioni, versioni e validazione. Il catalogo include `Mix and vary`: mostra una foto senza testo e affida all’adulto la registrazione dell’esito e dell’eventuale aiuto. Le prove avviate dalla configurazione non alimentano le statistiche e, al termine o alla chiusura, riportano alla schermata di provenienza. La navigazione interna usa la cronologia del browser. Le sequenze appartengono al terapista che le crea; supervisori e amministratori possono consultarle tutte con proprietario esplicito. Accettazione: flusso completo desktop e touch.

### M4 — Sessioni *(flusso applicativo e test dominio completati)*

Insegnamento, verifica, aiuti e idempotenza. Accettazione: un solo primo tentativo per item e correzioni separate anche con retry/doppio tap.

### M5 — Statistiche *(nuova sintesi applicativa completata; validazione sul campo da fare)*

Matrice con parole sulle righe e tipologie di attività sulle colonne, compreso `Mix and vary`, separazione fra valutazione e insegnamento, andamento mensile, aiuti per parola, azzeramento controllato ed export. Accettazione: risultati verificati su dataset noto, leggibilità validata con terapista e accesso riservato all'adulto.

### M6 — Hardening e pilot

PWA, accessibilità, sicurezza, privacy, backup/restore, UAT e runbook. Accettazione: nessun finding critico/alto aperto e approvazione esplicita prima di Cloudflare produzione.

### M7 — Sessioni guidate e console realtime *(MVP QR/D1 completato; WebSocket DO disponibile su scelta esplicita)*

Il prototipo include selezione esplicita del bambino, sequenze a nuvoletta, avvio rapido, riepilogo e schermata `PRONTI?`; la creazione delle sequenze resta nel pannello Configurazione. L'MVP pubblicato separa i controlli adulti tramite console mobile collegata con QR e ripristina i controlli locali se il telefono perde il lease. Con il telefono collegato l'adulto conferma ogni avanzamento e può navigare fra turni e attività, gestire audio, pausa, conclusione e aiuti e rimescolare le scelte di riconoscimento/categorizzazione; tutte le azioni sono tracciate. Il metodo predefinito resta D1 con polling; il pannello QR offre anche Durable Objects/WebSocket come prova facoltativa, secondo ADR 0015. Entrambi mantengono idempotenza e audit D1. Restano le verifiche sul campo e l'hardening dei permessi prima del pilot. Dettagli in `docs/PIANO_SESSIONI_GUIDATE_REALTIME.md`.

`Abbina la frase` estende le attività con scene soggetto + verbo: frase scritta e pronunciata, 2 o 4 immagini e difficoltà a uno o due gradi di libertà. La struttura dati riserva già il complemento per uno sviluppo successivo, senza esporlo nell’interfaccia corrente.

`Numero quantità` offre conteggio vocale opzionale delle selezioni e apprendimento senza errori: al raggiungimento della quantità corretta blocca la selezione e richiede avanzamento esplicito, senza timer. Le prove senza errori sono riconoscibili negli storici e nei CSV e separate dall'accuratezza autonoma.

## ADR ancora necessari

1. permessi distinti fra terapista e genitore, inviti e recupero accesso;
2. provider stock e licenze;
3. pipeline definitiva di resize e varianti immagini;
4. promozione protetta fra ambienti Cloudflare separati;
5. tipi di esercizio e catalogo aiuti;
6. retention, RPO/RTO e backup;
7. osservabilità e browser supportati;
8. provider e governance della generazione AI: trattamento dei prompt, moderazione, budget, retention e diritti d'uso.
9. modello della sessione e protocollo idempotente degli eventi;
10. trasporto realtime e topologia di deploy;
11. identità, ruoli, autorizzazioni e pairing QR;
12. completare il cambio delle letture e delle scritture dopo la prima fase shadow della migrazione relazionale, definita nell'ADR 0008.
