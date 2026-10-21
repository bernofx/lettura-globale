# ADR 0012 — Console remota tramite QR

**Stato:** proposto, implementato sul branch ma non distribuito
**Data:** 21 ottobre 2026

## Contesto

Durante una sessione il bambino usa lo schermo principale, mentre l'adulto deve poter guidare da telefono avanzamento, navigazione, audio, pausa, shuffle, valutazioni e aiuti. Senza telefono l'applicazione deve conservare il comportamento attuale. La configurazione Cloudflare esistente espone D1 e R2, ma non Durable Objects.

## Decisione proposta

L'MVP usa un relay autenticato in D1 con polling ogni 1,25 secondi. Il QR contiene soltanto un token casuale; token di pairing e chiave del controller sono conservati come hash. Ogni API verifica sessione applicativa e associazione adulto-bambino. Il PC deve approvare il telefono prima che possa inviare comandi.

È attivo un solo controller per sessione. Una nuova richiesta valida sostituisce subito chiave e lease correnti, porta la sessione in stato `pending`, invalida il telefono precedente e registra `controller_replaced` nell'audit. Vale quindi la regola “vince l'ultimo”, ma il nuovo telefono ottiene i comandi soltanto dopo l'approvazione sul PC.

I comandi hanno `client_event_id` univoco e `server_sequence` crescente. Sono salvati prima dell'esecuzione sul PC. Un heartbeat mantiene un lease di otto secondi; alla sua scadenza il PC riattiva i controlli locali e rimuove un'eventuale pausa, senza cambiare il turno. Una verifica della chiave anche nella scrittura SQL impedisce al controller sostituito di vincere una gara mentre invia un comando.

## Conseguenze

- non servono nuovi binding Cloudflare per il primo test;
- D1 riceve richieste frequenti durante le sole sessioni guidate;
- una latenza fino a circa 1,25 secondi è accettata nell'MVP;
- la migrazione `0011_remote_session_controller.sql` è forward-only e va applicata separatamente dal deploy Git;
- il deploy di produzione resta bloccato fino ad approvazione dell'ADR, migrazione esplicita e prova con due dispositivi;
- Durable Objects/WebSocket resta l'evoluzione prevista se latenza, concorrenza o costo del polling lo richiedono.

## Alternative considerate

- **Durable Object + WebSocket:** migliore realtime e coordinamento, rinviato perché richiede binding e pipeline di deploy aggiuntivi.
- **Solo stato nel browser o QR con dati di sessione:** rifiutato perché non garantisce autorizzazione, revoca, ordinamento né audit server-side.
