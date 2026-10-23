# ADR 0014 — Hardening di identità, PIN e contenuti condivisi

**Stato:** accettato il 22 ottobre 2026

## Contesto

La review ha rilevato che i PIN brevi usavano SHA-256 senza fattore di costo, il login non aveva un limite persistente, lo stato restituiva hash di profili non necessari e i link pubblici non avevano scadenza o revoca.

## Decisione

- I PIN nuovi o modificati usano `PBKDF2-HMAC-SHA-256`, **100.000 iterazioni** (correzione approvata il 23 ottobre 2026; inizialmente 120.000), sale casuale da 16 byte e risultato da 32 byte. Il formato versionato è `pbkdf2-sha256$iterazioni$sale$hash`.
- Gli hash SHA-256 già presenti restano verificabili durante la transizione; il confronto con PIN storici in chiaro viene rimosso. Quando un adulto o l’amministratore cambia il PIN, viene scritto soltanto il formato nuovo.
- L’architettura corrente conserva le credenziali anche nello snapshot necessario al client. Per questo non viene introdotto un pepper server-side che il browser non potrebbe usare. Prima del pilot il PIN dovrà uscire dallo snapshot tramite un endpoint credenziali dedicato; in quel passaggio si valuterà Argon2id o PBKDF2 con pepper gestito come secret.
- Il login limita con chiavi pseudonimizzate sia l’email normalizzata sia l’indirizzo di rete. La quinta risposta errata in una finestra di 15 minuti blocca per 30 secondi; gli errori successivi raddoppiano il blocco fino a 15 minuti. Un accesso riuscito azzera entrambe le chiavi.
- Non esiste recupero automatico via email nella demo. Un amministratore autenticato imposta un nuovo PIN; il recupero self-service richiederà un ADR sul provider di identità.
- I link pubblici scadono dopo 30 giorni e possono essere revocati dal pannello Configurazione. Anche payload e immagini verificano scadenza e revoca e usano `no-store`. I link esistenti ricevono come scadenza `created_at + 30 giorni`.
- La pulizia elimina opportunisticamente gli snapshot scaduti e quelli revocati da almeno sette giorni quando il proprietario crea un nuovo link. I file R2 non vengono rimossi: appartengono alla libreria privata e possono essere usati da altri contenuti o storici.
- La risposta dello stato rimuove i PIN degli altri profili e limita bambini, sequenze e storico in base al profilo adulto. Solo l’amministratore può usare il fallback di sostituzione completa dello stato; gli altri profili usano le modifiche granulari autorizzate.

## Conseguenze

- La migrazione D1 `0014_security_hardening` deve essere applicata prima della versione applicativa che interroga il rate limit.
- Gli accessi esistenti continuano a funzionare; la resistenza offline dei vecchi hash migliora solo dopo il cambio PIN.
- Il rate limit è condiviso tra istanze Worker perché persistito in D1 e non registra email o indirizzi di rete in chiaro.
- La revoca è effettiva alla richiesta successiva e non dipende dalle cache del browser o della CDN.

## Verifica

Test automatici coprono compatibilità dei PIN, sale casuale, soglie e limite del blocco, scadenza/revoca e migrazione dei link esistenti. La visibilità dello stato è coperta da casi amministratore e terapista.

## Correzione del flusso di accesso — 23 ottobre 2026

Approvata dall’utente dopo la riproduzione del falso login al cambio profilo. Ogni accesso al pannello chiama `/api/login` e conserva l’identificativo locale soltanto dopo la conferma server; lo stato React viene ricaricato dal cloud per il profilo autenticato. Il controllo locale del PIN resta esclusivamente per lo sblocco di controlli già autenticati, non per accedere al pannello. Non è previsto un nuovo login offline.

Il logout disabilita subito il pannello, interrompe refresh e nuovi autosalvataggi, tenta di completare la coda sotto la vecchia identità e attende la conferma della revoca prima di consentire un nuovo login. Se il salvataggio fallisce resta la coda offline; se la revoca non è confermata si richiede un retry esplicito, senza aprire un altro accesso. Nessun PIN, hash, ruolo, schema o durata della sessione viene modificato.

Un errore del servizio crittografico durante PBKDF2 non viene più trasformato in PIN errato: produce `503 pin_verification_unavailable`, con solo identificativo diagnostico casuale nei log e senza incrementare gli errori di credenziali. Gli errori di formato e i PIN diversi restano rifiutati. Messaggi client distinti per 401, 429 e indisponibilità tecnica; nessun dettaglio crittografico o personale esposto.

`pnpm test:auth` esegue il Worker compilato su D1 sintetico: login PBKDF2, refresh, revoca, cambio adulto, rifiuto del PIN errato e vista per ruolo. Sono richieste build preliminare e QA del passaggio fra profili sul dispositivo; il test non prova né modifica le credenziali di produzione.

## Compatibilità PBKDF2 produzione — riduzione approvata il 23 ottobre 2026

L’utente approva esplicitamente la riduzione da 120.000 a 100.000 iterazioni e il recupero tramite reimpostazione amministrativa. Il limite Cloudflare di produzione non è applicato dal runtime locale: i test precedenti non riproducevano questo vincolo, come descritto dagli sviluppatori in https://github.com/cloudflare/workerd/issues/1346. La riduzione del fattore di costo è un compromesso consapevole per la demo, non un’approvazione di sicurezza per dati reali. Restano sale casuale, confronto a tempo costante, rate limit e autenticazione server-side.

Gli hash già creati non vengono modificati né reinterpretati con un numero di iterazioni diverso. Il login cloud rileva i parametri superiori al limite e risponde `503 pin_reset_required`, senza creare una sessione o incrementare gli errori di PIN. È una segnalazione di compatibilità, non una conferma del PIN fornito. L’amministratore vede l’avviso accanto ai profili interessati e usa il normale campo `Nuovo PIN`, poi `Salva modifiche ai profili` e attende la conferma cloud prima di uscire. Può reinserire lo stesso PIN, senza comunicarlo all’assistente. Il nuovo hash passa dalle API autorizzate esistenti e aggiorna snapshot, tabelle e credenziali; nessuna migrazione D1, reset diretto del database o modifica a esercizi/statistiche. Lo sblocco locale di una sessione già autenticata può ancora verificare i vecchi hash nel browser; non è un fallback di login.

Test con tetto rigido a 100.000 sia su WebCrypto unitario sia nel Worker completo di `pnpm test:auth`, oltre ai test legacy SHA-256. La prova integra hash sintetico a 120.000, rifiuto senza tentativi errati, reimpostazione amministrativa via API dello stato, login e lettura con lo stesso PIN a 100.000. Nessun segreto o hash reale nei test o log.
