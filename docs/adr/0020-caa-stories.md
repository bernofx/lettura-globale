# ADR 0020 — Prima versione di storie in CAA

Stato: implementazione richiesta dall’utente il 2 novembre 2026; prototipo non commerciale, non abilitazione all’uso commerciale o clinico.

## Ambito e fonti

Testi propri e simboli revisionati dall’adulto, non storie sociali né generazione AI. ARASAAC è il catalogo candidato approvato per il prototipo: le condizioni ufficiali consultate su https://arasaac.org/terms-of-use richiedono uso non commerciale, attribuzione a Sergio Palao/ARASAAC/Governo di Aragona e distribuzione dei derivati sotto CC BY-NC-SA. L’interfaccia richiede conferma per storia prima della ricerca, mostra le condizioni e conserva i crediti in ogni pagina stampata. La futura commercializzazione richiederà una verifica/autorizzazione specifica o un catalogo differente. Non si dichiara una compatibilità commerciale implicita.

La ricerca italiana usa l’API pubblica ARASAAC dal browser per il solo termine esplicitamente richiesto; niente scraping, download di interi cataloghi, testo completo inviato, LLM o credenziali terze. Il provider vede termini e IP del browser; le immagini provengono dal suo host statico, senza referrer dell’app. Il consenso non autorizza l’invio di dati reali di minori. La rete dell’ambiente di sviluppo non consente i due host ARASAAC: contratti e flussi sono verificati con risposte sintetiche e resta da confermare l’accesso live dal browser del cliente. Nessun tentativo di aggirare la policy di rete.

La libreria esistente può fornire immagini con metadati validi e riferimenti cloud/stabili. Upload privati riusano validazione/normalizzazione e API media esistenti, previa conferma di diritti e consenso. Nessun asset di altri profili/account è ricercabile tramite URL arbitrari.

## Persistenza e isolamento

Documenti JSON schema 1 nel bucket R2 privato già approvato, sotto prefisso distinto derivato dall’hash della coppia account/profilo adulto. Le route dedicate richiedono una sessione adulta valida e ricavano il prefisso solo dall’identità server; non accettano proprietari dal client. Storie visibili soltanto al proprietario in questa prima versione; niente condivisione fra profili, bambini o supervisori e nessun ampliamento dei permessi sulle sessioni esistenti. Titoli e testo non vengono aggiunti a log o statistiche.

R2 ETag e scritture condizionali evitano sovrascritture concorrenti; ID operazione e hash del payload rendono sicuro il retry dopo risposta persa. Un conflitto conserva la bozza e richiede di salvarne una copia, non forza il last-writer-wins. Archivio logico, massimo 100 documenti per profilo nel prototipo, limiti su dimensione/testo/frasi/token. Nessun nuovo enum D1, binding, migrazione o cambiamento allo snapshot degli esercizi.

Il cloud rimane primario; IndexedDB conserva copia reattiva e coda offline isolata per profilo e media da caricare. Invio delle immagini prima del documento e retry al ritorno online/in primo piano e periodico mentre l’app è aperta, anche fuori dalla sezione CAA. Errori di cache/cloud o conflitti non mostrano falso verde; aggiornamento dell’app bloccato se restano scritture CAA pendenti. Nessuna nuova politica di cancellazione fisica o retention dei file: restano le limitazioni già documentate della demo, prima del pilot.

La cache usa uno scope opaco account+profilo verificato dal server, non il solo ID del profilo (che potrebbe coincidere in account diversi). Il fallback offline richiede lo stesso login locale già verificato; un 401 non autorizza il recupero della vecchia identità. Le richieste includono asserzioni di profilo/scope confrontate con l’identità del cookie, mai usate per scegliere un altro proprietario. La stessa verifica opzionale protegge gli upload della coda CAA, lasciando invariati gli upload ordinari della libreria, così un cambio di cookie/account non può inviare una vecchia foto al nuovo account.

## Impaginazione

Foglio A4/A5 verticale/orizzontale oppure libretto A5 su A4 orizzontale, solo fronte. Il libretto non è un fascicolo da piegare: per otto pagine i fogli sono 1|5, 2|6, 3|7, 4|8. Pagine dispari completate con metà vuota. Una o più frasi per pagina, interruzioni esplicite, copertina facoltativa. Parole e gruppi di parole rimangono modificabili e i simboli invariati sopravvivono alle correzioni del testo.

Anteprima con misure fisiche; stampa del browser/Salva PDF, controllo immagini e overflow prima di procedere. I PDF da browser sono la prima uscita: non è un exporter PDF nativo nell’APK, dove si invita ad aprire il browser. Nessuna nuova dipendenza o APK. La resa della stampante reale e il montaggio fisico restano verifiche utente necessarie.

## Futuro

La bacchetta AI richiesta dall’utente è registrata nel MASTER_PLAN: proposta CAA con confronto e conferma adulta, preferenza per soluzioni gratuite/locali, eventuali API autorizzate (non password ChatGPT), con ADR privacy/provider/costi prima di attivarla. Il formato delle storie rimane indipendente dal catalogo di simboli.
