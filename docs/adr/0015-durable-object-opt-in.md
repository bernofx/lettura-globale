# ADR 0015 — Collegamento Durable Object facoltativo

Stato: accettato su richiesta dell'utente del 22 ottobre 2026, attivazione controllata tramite QR.

## Aggiornamento approvato — 23 ottobre 2026

Dopo le prove sul campo l’utente richiede Realtime come unico metodo per i nuovi QR, anche prima dell’avvio. Questa decisione sostituisce il default e il selettore descritti nella prima versione dell’ADR, conservata sotto come cronologia. Le API classiche restano compatibili con client già aperti, ma il nuovo host non avvia polling né propone il selettore.

La schermata `PRONTI?` prepara il piano e un solo identificativo di sessione, mostra immediatamente il QR DO e pubblica lo stato `ready`. Il telefono mostra soltanto `Inizia`; anche il DO rifiuta gli altri comandi fino allo stato `active`. L’avvio è possibile dal PC senza telefono o dal telefono autenticato, senza rigenerare QR, piano, lease o connessione. Un guard locale rende l’avvio unico anche in caso di pressioni simultanee; il registro D1 conserva l’evento remoto `start` con idempotenza e ordine. L’ora di inizio, il ripristino locale e le statistiche iniziano soltanto dopo l’avvio esplicito. Tornare al riepilogo chiude il collegamento preparato, senza risultati fittizi. Nessuna migrazione D1/R2/DO: comando testuale e fase nello snapshot JSON, compatibili con lo schema distribuito.

Snapshot precedenti senza fase restano `active`. Le nuove console espongono i comandi secondo le capacità dell’esercizio. Realtime conserva autenticazione, lease, revoca dell’ultimo telefono e fallback ai controlli locali; se il QR non è disponibile si può comunque iniziare dal PC. Un rollback al client classico richiede un deploy esplicito, non un fallback automatico durante la sessione.

## Comportamento

Ogni nuova sessione parte in modalità `Classico`, mantenendo le API, il QR e il polling esistenti. Nel pannello QR l'adulto può scegliere `Realtime DO · prova`. Questo genera un QR distinto con trasporto e identificativo della sessione espliciti; il telefono non interpreta mai un QR classico come DO.

Il cambio di modalità è esplicito: il server chiude il collegamento corrente prima di crearne un altro, invalida il vecchio controller e conserva sessione, turno, tentativi e registro dei comandi. Se un telefono è collegato o risulta perso, il cambio richiede conferma e nuova scansione. Non esiste un passaggio automatico tra polling e WebSocket durante una connessione.

## Implementazione

Un Durable Object SQLite `RealtimeSession` per account/sessione viene esportato dallo stesso Worker dell'app. Il binding `SESSIONS` e la migrazione additiva `realtime-v1` sono presenti sia nella configurazione Vite generata sia in quella di produzione. Il deploy da Git resta unico. La classe usa il costruttore DO standard, per consentire il prerender Node della shell senza caricare classi base specifiche di Workers.

Le API dell'app verificano autenticazione, accesso al bambino e proprietario della sessione. Le operazioni interne raggiungono il DO esclusivamente tramite il namespace, non tramite URL pubblico. Il WebSocket pubblico `/api/controller/realtime/connect` richiede stessa origine e un ticket monouso di 30 secondi ottenuto dopo i controlli di accesso. Token QR e chiavi sono conservati come hash; il ticket limita ruolo e identità. Il telefono non può ottenere una connessione host.

Il coordinatore serializza le operazioni, conserva lo stato minimo nel proprio storage cloud e registra i comandi nelle tabelle D1 già esistenti prima dell'ack. Mantiene `client_event_id` e `server_sequence`, esegue replay paginato dopo la riconnessione e revoca socket/chiave precedenti quando si collega un altro telefono. Il PC applica gli eventi ordinatamente e ignora sequenze già ricevute.

Un heartbeat WebSocket ogni 2,5 secondi e un lease di 8 secondi rilevano sospensione o perdita di uno dei dispositivi. Il PC riattiva i controlli locali quando il controller non risulta presente. Il canale tenta di riconnettersi allo stesso DO con ticket nuovamente autenticati; non passa silenziosamente al polling. La chiusura della sessione azzera lo snapshot mostrato al telefono e riporta alla home.

## Compatibilità e ripristino

Nessuna migrazione di tabelle D1 o spostamento di dati storici: vengono riusati registro, snapshot e audit del controller. Nessuna modifica a R2. La migrazione Cloudflare introduce unicamente la nuova classe DO SQLite ed è forward-only: non cancellare namespace, binding o registro di migrazioni per ripristinare il metodo classico.

Il ripristino operativo consiste nel selezionare `Classico` nel pannello QR e collegare nuovamente il telefono. Le nuove sessioni restano comunque classiche per impostazione predefinita. Un rollback del codice che preceda l'introduzione della classe DO richiede una verifica separata dei vincoli di migrazione Cloudflare.

Lo storage del DO contiene soltanto lo stato corrente già esposto dalla console; risultati, tentativi e aiuti restano nelle raccolte cloud dell'app. Le regole definitive di conservazione/cancellazione prima del pilot si applicano anche al nuovo namespace. Il prototipo continua a usare dati dimostrativi.

## Verifiche

`pnpm test:realtime` compila il DO ed esegue Miniflare con D1 e WebSocket reali, simulando PC e due telefoni. Verifica origine, isolamento account, accesso host, ticket monouso, invio e conferma dei comandi, idempotenza, pausa/ripresa, scadenza del lease, replay, revoca del primo telefono, disconnessione e fine sessione. La configurazione del Worker autonomo in `realtime/wrangler.jsonc` è usata esclusivamente per questo test locale; la produzione usa il Worker dell'app.

Dopo `pnpm build`, `pnpm test:realtime --app-build` verifica anche il pacchetto completo dell'app: classe DO esportata, API senza autenticazione respinta e upgrade WebSocket sullo stesso dominio con ticket valido.

Restano da confermare sul campo comportamento in background su Android/iOS e resa del selettore QR. Non promuovere DO a modalità predefinita prima di queste prove.
