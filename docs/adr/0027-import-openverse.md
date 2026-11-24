# ADR 0027 — Importazione di immagini tramite Openverse

## Decisione

La Libreria affianca la ricerca tramite API Openverse alla generazione esplicita OpenAI. La prima versione cerca immagini Wikimedia Commons, con accesso riservato agli amministratori dell’account abilitato al catalogo condiviso. Usa l’API pubblica Openverse e non richiede una seconda chiave. Il motore riceve il termine di ricerca o l’affinamento digitato dall’adulto.

Sono ammesse CC0 1.0 e CC BY 4.0 quando la licenza e i crediti sono verificabili via MediaWiki Action API. Il Worker accetta il riferimento a un file Commons e una foto raster servita dal dominio Wikimedia consentito, senza seguire redirect durante i download. Immagini animate, file non validi e restrizioni ulteriori vengono rifiutati. Il flusso mostra la fonte e la licenza ufficiale e ricalcola l’impronta dell’immagine e dei crediti prima della pubblicazione.

L’approvazione salva il file verificato in R2 e la voce, la fonte, l’autore, la licenza e l’identificativo Openverse in D1. L’immagine è disponibile nel catalogo condiviso e nei link che la usano. Le schede, gli esercizi e le anteprime CAA mostrano i crediti e i riferimenti. Le voci pregresse conservano l’attribuzione già prevista. La ricerca, l’anteprima e la pubblicazione non usano OpenAI. La stessa parola conserva una sola foto nel catalogo condiviso.

La migrazione `0019_openverse_credits` aggiunge un campo facoltativo e si applica prima del deploy. L’accesso resta vincolato a `SCHEDULED_IMAGES_ACCOUNT_ID` e alle risorse D1/R2 dell’ambiente.

[Openverse API](https://api.openverse.org/v1/) · [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en)
