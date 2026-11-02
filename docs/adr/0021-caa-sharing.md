# ADR 0021 — Condivisione selettiva delle storie CAA

Stato: implementazione richiesta esplicitamente dall’utente il 2 novembre 2026, fra terapisti e tramite link pubblico. Estende il solo ambito CAA dell’ADR 0020; nessuna apertura della libreria o dei dati degli esercizi.

## Accesso e consenso

Ogni condivisione richiede un comando esplicito dell’autore, conferma dei diritti di redistribuzione/consensi e assenza di dati reali di minori. Il prototipo rimane non commerciale; attribuzioni e CC BY-NC-SA ARASAAC sono conservate. Condividere non cambia il provider né autorizza usi commerciali o clinici.

Il destinatario interno è identificato dall’email di login cloud già registrata: Terapista, Supervisore o Amministratore attivo, anche di un altro account. Nessun invito/email inviato, nuova identità, ricerca globale o elenco utenti. L’email inserita risolve server-side la coppia account/profilo; non si accettano proprietari o scope destinatari dal client. La storia compare in Ricevute ed è di sola lettura/stampabile; non concede accesso alla libreria dell’autore né modifica dell’originale.

Il link esterno contiene un token casuale di 256 bit: chi lo possiede può leggere/stampare la specifica copia, senza login. Pagina dedicata `/caa?share=<token>`, indipendente dal bootstrap/login degli esercizi; token mantenuto alla ricarica, nessuna indicizzazione o referrer. Avviso esplicito che il link è inoltrabile e non va usato per dati riservati.

Entrambi i percorsi scadono dopo 30 giorni e l’autore può revocarli. Controllo uniforme su documento e media a ogni richiesta, risposte private/no-store. Il lettore riconvalida al ritorno in primo piano, periodicamente e prima della stampa. Revoca non ritira PDF, stampe o copie già ottenute: limite dichiarato nell’interfaccia.

## Snapshot e persistenza

Prima della creazione il client completa il flush cloud e verifica che l’operazione selezionata non sia cambiata; il server esige l’ETag atteso, frasi strutturate aggiornate, contenuto non vuoto/non archiviato e tutte le immagini cloud disponibili. La copia è immutabile: modifiche successive all’originale richiedono nuova condivisione. Le immagini private vengono copiate in un prefisso R2 dedicato, con nuovi identificativi e senza esportare chiavi di account, così non cambiano se l’originale è sostituito/rimosso. Si copiano soltanto media citati dal documento e appartenenti all’account autenticato; niente URL arbitrari.

R2 esistente: record/snapshot sotto `caa-shares/<token>/`, indici privati `caa-sent/<scope>/` e `caa-inbox/<scope>/`. Si pubblica il record solo dopo le immagini, poi i puntatori; retry con stesso token/configurazione ripara i puntatori senza duplicare la condivisione. Record verificato sempre, mai autorizzazione derivata dal solo indice. Limiti: 100 condivisioni per autore nel prototipo, 60 immagini proprie uniche e 30 MB complessivi per copia. Nessun nuovo binding, enum, migrazione D1, APK o credenziale.

Revoca logica durevole; non si introduce una cancellazione fisica implicita dei contenuti e dei backup. Retention e pulizia dei record/media scaduti restano subordinate alla policy del pilot, già aperta nell’ADR 0020. Nessun testo, email destinatario, token o dato reale di minori nei log/test; test esclusivamente sintetici.

## Correzione catalogo

I media storici ammettono identificativi di 1–80 caratteri alfanumerici/trattino (`letto`); gli ID di storie/frasi/token mantengono il vincolo separato di 8–80. Validazione della scelta e del documento allineata alle API media; selezione non chiusa in caso di rifiuto e metadati incompleti non selezionabili. Nessuna migrazione dei documenti esistenti.
