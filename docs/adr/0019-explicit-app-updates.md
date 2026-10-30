# ADR 0019 — Versione visibile e aggiornamento con ripresa

Stato: accettato su richiesta dell’utente, 30 ottobre 2026.

## Decisione

Ogni build identifica il codice con il contatore dei commit raggiungibili e hash breve (`rN-hash`), uguale nel browser e nel Worker. La piccola API pubblica `/api/app-version`, senza cache e senza dati dell’account, permette il confronto al caricamento, ogni minuto in primo piano e al ritorno online/in primo piano. Il contatore è crescente sulla storia ordinaria di main; l’hash distingue branch e versioni della stessa profondità. Non è la versione dell’APK contenitore.

Home e barra degli esercizi mostrano la versione caricata, la disponibilità di una release diversa e il pulsante Aggiorna. Nessun reload automatico all’attivazione del service worker. Home include un riquadro apribile con le note editoriali dell’ultima versione caricata, versionate insieme al codice.

L’aggiornamento esplicito attende la coda cloud e blocca l’interazione durante la preparazione; se cloud o storage non sono disponibili lascia aperta la sessione. Un handoff schema 1 in sessionStorage della sola scheda conserva stato committato di sessione/turno: piano casuale, run ID, posizione, risposte, ordine delle opzioni, avanzamento interno delle classificazioni, selezioni quantità, giudizio e schermata Pronti. Non genera nuovi tentativi. Il contenuto viene consumato al primo bootstrap, accettato solo per stessa identità locale e URL e valido al massimo cinque minuti. Non sostituisce il cloud né estende la conservazione degli eventi clinici: il checkpoint operativo è locale/transitorio, come il ripristino già esistente. Nessun nuovo log, provider, permesso o schema D1.

Il ricaricamento conserva la URL pubblica e riprende lo snapshot già avviato. Il PC conserva URL del pairing e ultima sequenza applicata: si ricollega al DO esistente senza creare un nuovo token o revocare il telefono. Se prima era collegato un controller, mantiene l’avanzamento manuale durante la prima riconnessione; errore/perdita ripristinano il comportamento locale. I comandi arrivati durante la breve assenza sono ripresi dal journal ordinato. Il fallback di recupero ordinario dopo chiusura/crash non cambia. Audio e timer ripartono, non sono ripresi al millisecondo; il collegamento può essere brevemente indisponibile.

## Verifica

Test di dominio per isolamento, scadenza, serializzazione Set, stato committato, cleanup e fallimento della preparazione. Regressione Chromium locale con preview sintetica per avviso, mancato reload automatico, storage indisponibile, conservazione della URL e del turno, selezioni/blocco quantità e ordine delle immagini. Prove DO/WebSocket e Worker completo con dati sintetici; verifica su Android/iPhone del cliente resta necessaria. Per cambi futuri incompatibili del formato di sessione occorre alzare lo schema dell’handoff.
