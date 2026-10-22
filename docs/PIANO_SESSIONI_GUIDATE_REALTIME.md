# Piano — Sessioni guidate e console realtime

**Stato:** MVP QR/D1 pubblicato; percorso Durable Object/WebSocket opt-in implementato secondo ADR 0015, metodo classico ancora predefinito
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

L'MVP include pairing QR autenticato, console mobile, lease con heartbeat, registro ordinato dei comandi e fallback locale. Usa polling breve su D1: il PC interroga i comandi ogni 450 ms con una sola richiesta e sincronizza lo snapshot soltanto quando cambia; la console aggiorna lo stato ogni 650 ms. I tasti mostrano pressione, invio, conferma ed errore e usano una breve vibrazione sui dispositivi compatibili. Lo spike Durable Objects/WebSocket e la migrazione completa dello storico restano fasi successive.

## Esperienza prevista

1. L'adulto seleziona esplicitamente bambino e attività o sequenza.
2. Il PC mostra una schermata neutra `PRONTI?`, senza stimoli.
3. L'adulto sceglie se collegare un telefono o usare i controlli sul PC.
4. Il collegamento mobile usa un QR limitato alla singola sessione, con token casuale a scadenza breve e approvazione dal PC.
5. Durante l'attività il bambino vede soltanto il materiale dell'esercizio.
6. Quando il telefono è collegato, ogni cambio di turno o attività richiede una conferma esplicita dell'adulto: il PC non avanza automaticamente dopo la risposta del bambino.
7. La console adulta gestisce aiuti, riascolto, audio, pausa, correzione, riordino delle scelte, navigazione e conclusione.
8. Se il telefono non è collegato, l'esperienza e i controlli sul PC restano quelli attuali.
9. Il telefono può essere collegato anche a sessione già iniziata, senza riavviarla e senza perdere il turno corrente.
10. Se il telefono si disconnette, i controlli tornano disponibili sul PC; alla riconnessione la console mobile recupera lo stato corrente e riprende il controllo.
11. Alla fine viene salvato e mostrato un riepilogo della sessione.

## Comandi della console adulta

La console sul telefono deve consentire almeno queste azioni:

- confermare il passaggio al turno successivo, mantenendo fermo lo stimolo corrente fino alla conferma;
- tornare al turno precedente o andare a quello successivo;
- passare all'attività precedente o successiva della sequenza;
- mettere in pausa, riprendere o interrompere la sessione;
- ripetere la consegna vocale e disattivare o riattivare l'audio;
- registrare uno o più aiuti scegliendoli dall'elenco previsto dall'attività;
- registrare le valutazioni e le correzioni previste dal tipo di esercizio;
- negli esercizi `Trova la parola` e `Parola nella categoria`, rimescolare le scelte mostrate senza cambiare parola-obiettivo né insieme dei distrattori.

Il rimescolamento serve a distinguere una risposta basata sulla comprensione da una scelta basata sulla posizione. Cambia soltanto l'ordine visivo delle opzioni, conserva il trial corrente e non crea un nuovo primo tentativo. Le risposte date dopo un aiuto o una prima risposta restano correzioni dello stesso trial.

I comandi devono essere definiti una sola volta nella state machine condivisa. La console mobile e i controlli locali sul PC inviano gli stessi comandi e producono gli stessi eventi, con l'origine `mobile` o `desktop` registrata esplicitamente.

## Pairing, indicatore e fallback

- Durante tutta la sessione il PC mostra in un angolo un QR discreto per collegare o ricollegare il telefono senza coprire lo stimolo.
- Accanto al QR compare un indicatore di stato con almeno: non collegato, collegamento in corso, collegato e connessione persa.
- Un pallino verde indica che la console mobile è collegata e ha il lease di controllo attivo; lo stato non deve basarsi soltanto sull'apertura della pagina, ma su heartbeat e conferma del coordinatore realtime.
- È ammesso un solo controller mobile attivo per sessione. Se due telefoni tentano di collegarsi, vince l'ultimo: la nuova richiesta valida revoca immediatamente chiave e lease del controller precedente, viene mostrata sul PC per l'approvazione ed è registrata nell'audit.
- Il pairing può avvenire prima dell'avvio o durante una sessione già in corso. Il telefono riceve lo snapshot del turno corrente e l'ultimo `server_sequence` confermato.
- La perdita del collegamento non interrompe né fa avanzare la sessione: il PC rende nuovamente disponibili i controlli locali con il comportamento attuale.
- Alla riconnessione il telefono esegue il replay degli eventi mancanti, recupera il turno corrente e torna a controllare la sessione senza duplicare comandi già confermati.
- Senza telefono collegato non cambia nulla rispetto all'applicazione corrente, inclusi avanzamenti automatici e controlli locali già disponibili.

## Tracciamento delle azioni adulte

Oltre a risposte e aiuti, il registro append-only della sessione conserva almeno:

- collegamento, approvazione, disconnessione, riconnessione e revoca della console;
- avanzamento e ritorno tra turni;
- passaggio all'attività precedente o successiva;
- pausa, ripresa e interruzione della sessione;
- riproduzione della consegna e cambio dello stato audio;
- rimescolamento delle opzioni, con ordine precedente e nuovo ordine;
- aiuti selezionati dall'adulto;
- origine del comando, profilo adulto, data, `client_event_id` e `server_sequence`.

Gli eventi di controllo non modificano retroattivamente il primo tentativo. Il riepilogo deve permettere di ricostruire che cosa ha visto il bambino e quali interventi dell'adulto hanno preceduto ogni risposta, evitando però di registrare dati tecnici ridondanti nell'export didattico standard.

## Prerequisiti di sicurezza

Prima del pairing occorre sostituire l'autorizzazione implicita basata sul proprietario dello snapshot con permessi server-side per singola risorsa:

- ruoli distinti per amministratore, terapista e genitore;
- relazione server-side molti-a-molti fra adulti e bambini;
- verifica dell'accesso al bambino su ogni API;
- password/PIN con algoritmo dedicato, salt, rate limit e revoca delle sessioni;
- audit delle operazioni amministrative e degli accessi alle sessioni;
- token di pairing memorizzati solo come hash, limitati alla singola sessione, a scadenza breve e senza dati del bambino nell'URL; un riuso valido applica la regola “vince l'ultimo” e richiede una nuova approvazione sul PC.

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
- `controller_events`;
- `pairing_requests`;
- `controller_leases`;
- `audit_events`.

Vincoli minimi:

- un solo primo tentativo immutabile per trial;
- `client_event_id` univoco per rendere i comandi idempotenti;
- `server_sequence` crescente e univoco nella sessione;
- un solo controller adulto attivo per sessione;
- tentativi e aiuti append-only;
- comandi di controllo append-only, idempotenti e attribuiti al dispositivo e all'adulto;
- ordine delle opzioni versionato a ogni shuffle per ricostruire la presentazione effettiva;
- riferimenti obbligatori a sessione, bambino, attività e parola;
- snapshot/versione dell'esercizio conservati nello storico.

## Architettura realtime proposta

Prima di cambiare trasporto consolidare le regole di esecuzione: pausa che blocca i comandi modificativi anche in batch e conferma delle transizioni da telefono. Il Durable Object non sostituisce questi controlli applicativi.

Il passaggio va verificato in tre fasi: spike di build/deploy con binding Durable Objects e WebSocket in ambiente di prova; integrazione del trasporto conservando identificativi idempotenti, ordine e audit D1; QA con PC e due telefoni su pausa, cambio attività, riconnessione, sospensione dello smartphone, logout e chiusura della sessione. Abilitare il nuovo trasporto per nuove sessioni selezionate, mantenendo il polling ripristinabile senza cambiare trasporto a metà sessione. Nessuna migrazione realtime di produzione viene eseguita con queste correzioni.

D1 rimane l'archivio durevole e R2 il deposito privato delle immagini. Un coordinatore realtime per sessione serializza i comandi, assegna l'ordine server, salva l'evento prima della conferma e aggiorna PC e telefono. Gestisce inoltre il lease dell'unico controller mobile, l'heartbeat, il passaggio automatico al fallback desktop e il replay alla riconnessione.

L'MVP usa polling breve su D1 per non introdurre nuovi binding nel deploy corrente. La prima evoluzione da verificare è un Durable Object Cloudflare con WebSocket. Se integrare il coordinatore nello stesso Worker rendesse fragile il deploy dell'applicazione, usare un Worker Cloudflare realtime separato con autenticazione coordinata.

Il pannello adulto sul PC deve inviare gli stessi comandi della console mobile, evitando due implementazioni diverse della logica di sessione.

## Decisioni da approvare

- durata della `LearningSession`: raccomandata una sessione continua composta da più attività;
- modalità di apertura e protezione dei controlli adulto sul PC;
- matrice completa dei permessi di amministratore, terapista e genitore;
- soluzione realtime dopo lo spike su Cloudflare Workers e Durable Objects;
- retention, cancellazione, esportazione e backup dei dati dei minori.

## ADR da redigere

- modello della sessione e protocollo degli eventi;
- trasporto realtime e topologia di deploy;
- identità, ruoli, autorizzazioni e pairing;
- privacy e retention dei dati dei minori;
- migrazione dallo snapshot JSON alle tabelle relazionali.

## Ordine di realizzazione

1. Approvare l'ADR 0012 e applicare la migrazione D1 0011 in modo esplicito.
2. Verificare l'MVP con due browser/dispositivi, inclusi sostituzione del controller, riconnessione, doppio tap e accessibilità.
3. Eseguire lo spike Durable Objects/WebSocket senza deploy di produzione.
4. Estrarre una state machine condivisa anche per i controlli locali sul PC.
5. Aggiungere gli eventi di controllo al riepilogo e completare la migrazione relazionale dello storico.

## Criteri di completamento

- il bambino non vede comandi o aiuti dell'adulto durante l'esercizio;
- con telefono collegato nessun turno o esercizio avanza senza conferma dell'adulto;
- senza telefono collegato l'app mantiene integralmente il comportamento attuale;
- il telefono può essere collegato durante una sessione già iniziata;
- dopo una disconnessione il PC recupera i controlli senza cambiare turno e la riconnessione non duplica eventi;
- lo shuffle cambia la posizione delle scelte ma non il target, i distrattori o l'identità del trial;
- ogni comando adulto rilevante è attribuito, ordinato e ricostruibile nello storico tecnico;
- un terapista può operare soltanto sui bambini assegnati;
- il primo tentativo rimane unico anche dopo retry, refresh o riconnessione;
- token scaduti o appartenenti ad altri utenti vengono rifiutati; il riuso valido nella stessa sessione sostituisce il controller precedente e richiede approvazione;
- telefono e PC recuperano lo stato corretto dopo una disconnessione;
- la modalità adulto sul PC e quella mobile producono gli stessi eventi;
- test unitari, API, sicurezza ed E2E con due browser sono inclusi nella CI;
- privacy review e approvazione esplicita precedono qualsiasi pilot con dati reali.
