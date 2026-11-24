# ADR 0026 — Generazione di immagini per il catalogo condiviso

## Contesto

La prova di Clessidra ha verificato il ciclo ImageGen e PR. Un task Codex che leggeva le note della coda e accedeva a GitHub avrebbe richiesto un ambiente isolato. Su richiesta dell’utente, la proposta passa alla chiamata diretta all’API OpenAI, avviata esplicitamente dalla sezione **Generazione con OpenAI** in Libreria. La creazione e la modifica di schede manuali persistono soltanto i dati della Libreria e gli eventuali file caricati.

## Decisione

Un amministratore dell’account abilitato accoda parole destinate al catalogo pubblico. D1 deduplica le richieste e Cloudflare Queues avvia il lavoro con il solo ID della richiesta e del tentativo. Un trigger automatico recupera consegne mancate e sblocca tentativi interrotti. La migrazione `0017` è additiva e indipendente dai dati didattici degli esercizi.

Il Worker chiama direttamente l’endpoint OpenAI Images con GPT-Image-2.6 Flare, formato quadrato WebP, qualità bassa e moderazione automatica. Invia solo la parola e un’eventuale precisazione visiva adatta alla pubblicazione e lascia al provider soltanto la generazione dell’immagine. La chiave API è un secret del Worker. L’account e il massimo mensile di tentativi devono essere configurati esplicitamente. I tentativi sono conteggiati in D1 su mesi UTC prima di contattare il provider. La funzionalità parte disattivata e i tentativi d’esito incerto richiedono un nuovo invio esplicito.

La sezione riguarda termini generici. L’interfaccia chiede di escludere dati personali, contatti, link e immagini di minori. Il worker scarta URL e altri campi restituiti dal provider, convalida formato e dimensioni e conserva un’anteprima privata statica e quadrata in WebP, PNG o JPEG. Il limite è 1.350.000 byte per l’anteprima in D1. La conversione in WebP senza metadati e con un limite di 400.000 byte avviene alla pubblicazione. Il contenuto temporaneo viene rimosso quando la proposta è annullata, risulta duplicata o è pubblicata. Rimane uno storico della richiesta e dei suoi stati.

I metadati didattici provengono dal catalogo o dall’analisi locale della parola. L’amministratore li può correggere nell’anteprima e approva esplicitamente l’immagine e i metadati prima della pubblicazione. Le fonti e le licenze seguono le schede ImageGen del catalogo. GitHub Actions usa una chiave di pubblicazione distinta custodita in GitHub per preparare un commit con la voce JSON e il WebP, controlla il contenuto del commit, attende la CI e integra su `main`. La conferma richiede che l’asset sia nel catalogo attivo.

Il collaudo con un account reale, la creazione delle risorse, le protezioni di `main` e l’attivazione del provider in produzione richiedono configurazione e approvazione. [Configurazione](../GENERAZIONE_IMMAGINI.md)
