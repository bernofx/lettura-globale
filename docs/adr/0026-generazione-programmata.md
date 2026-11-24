# ADR 0026 — Generazione di immagini per il catalogo condiviso

## Contesto

La prova di Clessidra ha verificato il ciclo ImageGen e PR. Un task Codex che leggeva le note della coda e accedeva a GitHub avrebbe richiesto un ambiente isolato. Su richiesta dell’utente, la proposta passa alla chiamata diretta all’API OpenAI, avviata esplicitamente dalla sezione **Generazione con OpenAI** in Libreria. La creazione e la modifica di schede manuali persistono soltanto i dati della Libreria e gli eventuali file caricati.

## Decisione

Un amministratore dell’account abilitato accoda parole destinate al catalogo pubblico. D1 deduplica le richieste e Cloudflare Queues avvia il lavoro con il solo ID della richiesta e del tentativo. Un trigger automatico recupera consegne mancate e sblocca tentativi interrotti. La migrazione `0017` è additiva e indipendente dai dati didattici degli esercizi.

Il Worker chiama direttamente l’endpoint OpenAI Images con GPT-Image-2.6 Flare, formato quadrato WebP, qualità bassa e moderazione automatica. Invia solo la parola e un’eventuale precisazione visiva adatta alla pubblicazione e lascia al provider soltanto la generazione dell’immagine. La chiave API è un secret del Worker. L’account e il massimo mensile di tentativi devono essere configurati esplicitamente. I tentativi sono conteggiati in D1 su mesi UTC prima di contattare il provider. La funzionalità parte disattivata e i tentativi d’esito incerto richiedono un nuovo invio esplicito.

La sezione riguarda termini generici. L’interfaccia chiede di escludere dati personali, contatti, link e immagini di minori. Il worker scarta URL e altri campi restituiti dal provider, convalida formato e dimensioni e conserva un’anteprima privata statica e quadrata in WebP, PNG o JPEG. Il limite è 1.350.000 byte per l’anteprima in D1. I blocchi accessori (per esempio EXIF, XMP, ICC e C2PA) vengono rimossi dai file pubblicati. Il contenuto temporaneo viene rimosso quando la proposta è annullata, risulta duplicata o è pubblicata. Rimane uno storico della richiesta e dei suoi stati.

I metadati didattici provengono dal catalogo o dall’analisi locale della parola. L’amministratore li può correggere nell’anteprima e approva esplicitamente l’immagine e i metadati prima della pubblicazione. Le fonti e le licenze seguono le schede ImageGen del catalogo. L’approvazione dell’amministratore dell’account abilitato autorizza la diffusione nel catalogo condiviso, compresi i link pubblici agli esercizi. Il Worker verifica il digest approvato, salva i byte in un prefisso R2 dedicato e registra la voce in D1 in modo atomico con lo stato della richiesta. La rotta immagine serve i soli oggetti registrati nel catalogo. La migrazione `0018` revoca la credenziale del publisher GitHub. Il trigger Cloudflare recupera anche le proposte approvate dal sistema precedente e riusa lo stesso file in caso di nuovo tentativo. Le voci incluse nel catalogo originale mantengono URL e identificativi.

Ogni ambiente compila con la propria configurazione Wrangler (`LETTURA_WRANGLER_CONFIG`, predefinita produzione), così Worker, coda e trigger non si mescolano tra staging e produzione. Una parola segnata come già illustrata può essere richiesta di nuovo se non ha più un’immagine.

Le risorse e l’attivazione del provider in produzione richiedono configurazione e approvazione. [Configurazione](../GENERAZIONE_IMMAGINI.md)
