# ADR 0020 — Prima versione di storie in CAA

Stato: implementazione richiesta dall’utente il 2 novembre 2026; prototipo non commerciale, non abilitazione all’uso commerciale o clinico.

## Ambito e fonti

Testi propri e simboli revisionati dall’adulto, non storie sociali né generazione AI. ARASAAC è il catalogo candidato approvato per il prototipo: le condizioni ufficiali consultate su https://arasaac.org/terms-of-use richiedono uso non commerciale, attribuzione a Sergio Palao/ARASAAC/Governo di Aragona e distribuzione dei derivati sotto CC BY-NC-SA. L’interfaccia richiede conferma per storia prima della ricerca, mostra le condizioni e conserva i crediti in ogni pagina stampata. La futura commercializzazione richiederà una verifica/autorizzazione specifica o un catalogo differente. Non si dichiara una compatibilità commerciale implicita.

La ricerca italiana usa l’API pubblica ARASAAC dal browser per il solo termine esplicitamente richiesto; niente scraping, download di interi cataloghi, testo completo inviato, LLM o credenziali terze. Il provider vede termini e IP del browser; le immagini provengono dal suo host statico, senza referrer dell’app. Il consenso non autorizza l’invio di dati reali di minori. La rete dell’ambiente di sviluppo non consente i due host ARASAAC: contratti e flussi sono verificati con risposte sintetiche e resta da confermare l’accesso live dal browser del cliente. Nessun tentativo di aggirare la policy di rete.

La libreria esistente può fornire immagini con metadati validi e riferimenti cloud/stabili. Upload privati riusano validazione/normalizzazione e API media esistenti, previa conferma di diritti e consenso. Nessun asset di altri profili/account è ricercabile tramite URL arbitrari.

## Persistenza e isolamento

Correzione della ricerca: il filtro iniziale di due caratteri ammette ora anche A, E, È, I e O isolate, in entrambi i casi, escludendo consonanti e U isolate; termini più lunghi invariati. Il validatore è condiviso da pulsante e invio. La ricerca conserva gli accenti per distinguere E da È; il confronto locale dei termini del catalogo resta senza accenti. Nessuna ricerca automatica aggiunta, nessuna garanzia implicita sulla presenza del simbolo nel catalogo e nessun cambiamento a provider, consenso o licenza.

Documenti JSON schema 1 nel bucket R2 privato già approvato, sotto prefisso distinto derivato dall’hash della coppia account/profilo adulto. Le route dedicate richiedono una sessione adulta valida e ricavano il prefisso solo dall’identità server; non accettano proprietari dal client. Storie visibili soltanto al proprietario in questa prima versione; niente condivisione fra profili, bambini o supervisori e nessun ampliamento dei permessi sulle sessioni esistenti. Titoli e testo non vengono aggiunti a log o statistiche.

R2 ETag e scritture condizionali evitano sovrascritture concorrenti; ID operazione e hash del payload rendono sicuro il retry dopo risposta persa. Un conflitto conserva la bozza e richiede di salvarne una copia, non forza il last-writer-wins. Archivio logico, massimo 100 documenti per profilo nel prototipo, limiti su dimensione/testo/frasi/token. Nessun nuovo enum D1, binding, migrazione o cambiamento allo snapshot degli esercizi.

Il cloud rimane primario; IndexedDB conserva copia reattiva e coda offline isolata per profilo e media da caricare. Invio delle immagini prima del documento e retry al ritorno online/in primo piano e periodico mentre l’app è aperta, anche fuori dalla sezione CAA. Errori di cache/cloud o conflitti non mostrano falso verde; aggiornamento dell’app bloccato se restano scritture CAA pendenti. Nessuna nuova politica di cancellazione fisica o retention dei file: restano le limitazioni già documentate della demo, prima del pilot.

La cache usa uno scope opaco account+profilo verificato dal server, non il solo ID del profilo (che potrebbe coincidere in account diversi). Il fallback offline richiede lo stesso login locale già verificato; un 401 non autorizza il recupero della vecchia identità. Le richieste includono asserzioni di profilo/scope confrontate con l’identità del cookie, mai usate per scegliere un altro proprietario. La stessa verifica opzionale protegge gli upload della coda CAA, lasciando invariati gli upload ordinari della libreria, così un cambio di cookie/account non può inviare una vecchia foto al nuovo account.

## Impaginazione

Foglio A4/A5 verticale/orizzontale oppure libretto A5 su A4 orizzontale, solo fronte. Il libretto non è un fascicolo da piegare: per otto pagine i fogli sono 1|5, 2|6, 3|7, 4|8. Pagine dispari completate con metà vuota. Una o più frasi per pagina, interruzioni esplicite, copertina facoltativa. Parole e gruppi di parole rimangono modificabili e i simboli invariati sopravvivono alle correzioni del testo.

Anteprima con misure fisiche; stampa del browser/Salva PDF, controllo immagini e overflow prima di procedere. I PDF da browser sono la prima uscita: non è un exporter PDF nativo nell’APK, dove si invita ad aprire il browser. Nessuna nuova dipendenza o APK. La resa della stampante reale e il montaggio fisico restano verifiche utente necessarie.

## Estensione leggibilità e formati — 2 novembre 2026

Richiesta dell’utente: stampatello maiuscolo predefinito nelle nuove storie, opzione iniziale per mantenere il testo originale, parole mai spezzate e formato PDF selezionabile con A4 predefinito. `letterCase` è una preferenza editoriale reversibile: non riscrive i testi/token e non perde i simboli, si applica a titoli e parole di lettura/stampa, non ai crediti legali. I documenti e snapshot storici senza campo conservano il testo originale, senza cambiare il payload canonico o l’idempotenza delle scritture.

Le etichette hanno larghezza naturale e non sono sillabate né spezzate: la griglia può andare a capo solo fra token/espressioni. Resta la verifica degli ingombri prima di stampare, anche per parole o titoli troppo larghi: non si riduce il carattere o ritaglia silenziosamente il testo per farlo entrare.

Foglio singolo A3/A4/A5/A6, Letter/Legal nelle due orientazioni o dimensioni personalizzate intere di 80–600 mm per lato. Libretto su A4/A3/Letter orizzontali, con pagina finita larga metà del foglio; stessa imposizione da taglio/impilamento. Le dimensioni fisiche alimentano sia anteprima sia CSS `@page` e PDF, non soltanto lo zoom. Campi opzionali nello schema JSON/R2 1, validati server-side e conservati nelle nuove condivisioni. Nessun enum D1, migrazione, nuovo provider, permesso, binding o APK. L’impostazione stampante deve comunque rispettare il foglio e la scala 100%.

## Percentuale immagini — scelta manuale

Su richiesta successiva dell’utente la riduzione non è automatica: preferenza opzionale `symbolScale` intera 50–100, con 100% implicito nei documenti precedenti. La dimensione fisica dei simboli è `symbolSize × symbolScale / 100`; la dimensione del testo non cambia, così come il contenuto e la scelta originale/maiuscolo. Campo e cursore sono disponibili in configurazione e direttamente nell’anteprima dell’autore, aggiornano live lettura/fogli/PDF e seguono la normale coda cloud. Gli esterni ricevono la percentuale fissata nello snapshot e non modificano la storia dell’autore. Il blocco stampa resta se la riduzione scelta non basta, indicando le pagine che eccedono. Nessun mutamento di licenze, provider, permessi o schema D1; payload vecchi senza campo non riscritti automaticamente.

## Stampa nell’APK 0.1.3

La limitazione iniziale della stampa al browser è superata dal bridge PrintManager dell’APK 0.1.3 (ADR 0017 aggiornato), su richiesta dell’utente. Dopo i medesimi controlli di media, accesso e ingombri, il sito invia soltanto titolo/dimensioni fisiche/ID di richiesta e apre il dialogo nativo con verifica adulta. Salva come PDF è una destinazione del dialogo Android, non un nuovo servizio o provider PDF. Vecchie APK richiedono aggiornamento; browser invariato. Il salvataggio effettivo e la resa su hardware Android richiedono verifica dell’utente.

## Futuro

La bacchetta AI richiesta dall’utente è registrata nel MASTER_PLAN: proposta CAA con confronto e conferma adulta, preferenza per soluzioni gratuite/locali, eventuali API autorizzate (non password ChatGPT), con ADR privacy/provider/costi prima di attivarla. Il formato delle storie rimane indipendente dal catalogo di simboli.
