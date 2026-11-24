# ADR 0026 — Coda per le immagini del catalogo condiviso

## Contesto

La prova di Clessidra ha verificato un ciclo programmato dalla generazione ImageGen fino alla PR. La versione iniziale dava allo stesso agente le descrizioni della coda e i permessi di scrittura e merge. Anche una descrizione scritta da un amministratore può contenere testo proveniente da terzi e influenzare le azioni dell’agente.

## Decisione proposta

La coda D1 è gestita dagli amministratori dell’account. Conserva le richieste e le proposte da verificare. Ogni proposta contiene un WebP statico limitato a 400.000 byte e metadati da uno schema chiuso. L’immagine temporanea viene rimossa dalla coda quando la proposta è annullata, risulta duplicata o è disponibile a catalogo. Le precisazioni restano visibili all’amministratore e al solo generatore. La sezione riguarda termini destinati a un catalogo pubblico.

Un ambiente Codex dedicato riceve una chiave che consente soltanto di prendere fino a tre richieste alla volta, inviare le relative proposte o segnalare un esito codificato. L’ambiente deve escludere repository, connettori e credenziali estranee alla generazione. La migrazione additiva `0017` conserva in D1 solo gli hash delle due chiavi. Le prese in carico scadono dopo un’ora, sono atomiche e vengono revocate quando si ruota la chiave del ruolo relativo.

L’amministratore approva l’anteprima specifica prima che l’immagine sia esposta al publisher. GitHub Actions, con una chiave di pubblicazione e una credenziale GitHub dedicate, trasforma i dati approvati in una voce JSON e in un asset WebP. A parità di parola conserva gli ID delle schede senza foto e rispetta le foto già presenti, incluse quelle private dell’account che ha chiesto la generazione. Le fonti e licenze sono determinate in codice. Solo il publisher verifica il commit, attende i controlli CI, effettua il merge su `main` e conferma la presenza nel catalogo distribuito.

L’isolamento limita le azioni possibili al generatore, mentre la verifica umana copre la pertinenza dei contenuti. L’applicazione delle protezioni di `main`, la configurazione delle credenziali e l’attivazione della schedulazione in produzione richiedono approvazione. [Configurazione e prompt](../PROMPT_GENERAZIONE_PROGRAMMATA.md)
