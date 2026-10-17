# Piano futuro — Sessioni guidate e console realtime

**Stato:** procedura guidata implementata nel prototipo; console realtime e pairing ancora pianificati  
**Origine:** audit tecnico Fase 0 del 17 ottobre 2026  
**Vincolo:** nessun deploy Cloudflare di produzione senza approvazione esplicita

## Obiettivo

Separare l'interfaccia mostrata al bambino dai controlli dell'adulto. Il PC presenta soltanto lo stimolo e le risposte; il terapista o genitore conduce la sessione da una console mobile collegata tramite QR oppure da un pannello adulto protetto sullo stesso PC.

## Funzioni già implementate nel prototipo

- scelta esplicita del bambino all'apertura della nuova sessione;
- sequenze preparate mostrate come nuvolette, ordinate per uso recente e titolo;
- riepilogo prima dell'avvio con scelta Insegnamento/Valutazione;
- builder completo per creare, ordinare e salvare una sequenza, con creazione degli esercizi nello stesso flusso;
- avvio rapido temporaneo per tutte le tipologie, con libreria intera, filtro per categoria o scelta manuale;
- configurazione di turni, distrattori e presentazione, con schermata finale `PRONTI?`;
- riepilogo al termine e salvataggio facoltativo dell'avvio rapido come sequenza.

Queste funzioni usano ancora lo snapshot D1 corrente. Il modello relazionale, il pairing QR, la console mobile e la separazione completa dei controlli adulto restano oggetto delle fasi successive descritte qui sotto.

## Esperienza prevista

1. L'adulto seleziona esplicitamente bambino e attività o sequenza.
2. Il PC mostra una schermata neutra `PRONTI?`, senza stimoli.
3. L'adulto sceglie se collegare un telefono o usare i controlli sul PC.
4. Il collegamento mobile usa un QR con token monouso, scadenza breve e approvazione dal PC.
5. Durante l'attività il bambino vede soltanto il materiale dell'esercizio.
6. La console adulta gestisce aiuti, riascolto, pausa, correzione, avanzamento e conclusione.
7. Alla fine viene salvato e mostrato un riepilogo della sessione.

## Prerequisiti di sicurezza

Prima del pairing occorre sostituire l'autorizzazione implicita basata sul proprietario dello snapshot con permessi server-side per singola risorsa:

- ruoli distinti per amministratore, terapista e genitore;
- relazione server-side molti-a-molti fra adulti e bambini;
- verifica dell'accesso al bambino su ogni API;
- password/PIN con algoritmo dedicato, salt, rate limit e revoca delle sessioni;
- audit delle operazioni amministrative e degli accessi alle sessioni;
- token di pairing memorizzati solo come hash, monouso e senza dati del bambino nell'URL.

## Modello dati proposto

La migrazione deve essere progressiva. Libreria, esercizi e sequenze possono restare temporaneamente nello snapshot esistente; sessioni ed eventi diventano relazionali in D1.

Entità previste:

- `adult_users`;
- `children`;
- `therapist_child_access`;
- `learning_sessions`;
- `session_activities`;
- `trials`;
- `answer_events`;
- `help_events`;
- `pairing_requests`;
- `controller_leases`;
- `audit_events`.

Vincoli minimi:

- un solo primo tentativo immutabile per trial;
- `client_event_id` univoco per rendere i comandi idempotenti;
- `server_sequence` crescente e univoco nella sessione;
- un solo controller adulto attivo per sessione;
- tentativi e aiuti append-only;
- riferimenti obbligatori a sessione, bambino, attività e parola;
- snapshot/versione dell'esercizio conservati nello storico.

## Architettura realtime proposta

D1 rimane l'archivio durevole e R2 il deposito privato delle immagini. Un coordinatore realtime per sessione serializza i comandi, assegna l'ordine server, salva l'evento prima della conferma e aggiorna PC e telefono.

La prima opzione da verificare è un Durable Object Cloudflare con WebSocket. Il supporto dei relativi binding nel flusso di pubblicazione ChatGPT Sites non è documentato nel progetto attuale, che espone soltanto D1 e R2. Prima dell'implementazione serve quindi uno spike tecnico. Se Sites non supporta questa configurazione, usare un Worker Cloudflare realtime separato con autenticazione coordinata. Il polling resta soltanto un fallback MVP.

Il pannello adulto sul PC deve inviare gli stessi comandi della console mobile, evitando due implementazioni diverse della logica di sessione.

## Decisioni da approvare

- durata della `LearningSession`: raccomandata una sessione continua composta da più attività;
- comportamento dopo un errore: raccomandato avanzamento controllato dall'adulto, configurabile per esercizio;
- modalità di apertura e protezione dei controlli adulto sul PC;
- matrice completa dei permessi di amministratore, terapista e genitore;
- soluzione realtime dopo lo spike su Sites e Durable Objects;
- retention, cancellazione, esportazione e backup dei dati dei minori.

## ADR da redigere

- modello della sessione e protocollo degli eventi;
- trasporto realtime e topologia di deploy;
- identità, ruoli, autorizzazioni e pairing;
- privacy e retention dei dati dei minori;
- migrazione dallo snapshot JSON alle tabelle relazionali.

## Ordine di realizzazione

1. Approvare le decisioni di prodotto e gli ADR.
2. Eseguire lo spike realtime senza deploy di produzione.
3. Rafforzare autenticazione, autorizzazioni e relazione adulto-bambino.
4. Introdurre sessioni, trial ed eventi relazionali e idempotenti.
5. Estrarre una state machine condivisa e aggiungere il nuovo flusso PC.
6. Implementare pairing QR e console mobile.
7. Aggiungere riepilogo, statistiche e migrazione dello storico.
8. Verificare riconnessione, replay, doppio tap, accessibilità e uso con due dispositivi.

## Criteri di completamento

- il bambino non vede comandi o aiuti dell'adulto durante l'esercizio;
- un terapista può operare soltanto sui bambini assegnati;
- il primo tentativo rimane unico anche dopo retry, refresh o riconnessione;
- token scaduti, riutilizzati o appartenenti ad altri utenti vengono rifiutati;
- telefono e PC recuperano lo stato corretto dopo una disconnessione;
- la modalità adulto sul PC e quella mobile producono gli stessi eventi;
- test unitari, API, sicurezza ed E2E con due browser sono inclusi nella CI;
- privacy review e approvazione esplicita precedono qualsiasi pilot con dati reali.
