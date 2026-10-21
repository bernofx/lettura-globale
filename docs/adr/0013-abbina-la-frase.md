# ADR 0013 — Esercizio “Abbina la frase”

## Stato

Accettato e implementato.

## Decisione

La libreria distingue parole singole e scene-frase. La prima versione usa soltanto frasi semplici `soggetto + verbo`; i campi per il complemento sono già presenti ma non sono selezionabili.

L’esercizio presenta la frase scritta e pronunciata automaticamente, con 2 o 4 immagini:

- un grado di libertà: stesso soggetto e azioni diverse;
- due gradi di libertà: solo con 4 immagini, matrice completa di due soggetti per due azioni.

Le opzioni sono calcolate e validate prima dell’avvio. Il telecomando può rimescolarle e, quando connesso, mantiene il controllo dell’avanzamento come per gli altri esercizi.

## Persistenza e compatibilità

La migrazione `0012_sentence_matching.sql` aggiunge metadati semantici senza modificare i vincoli storici. Nelle tabelle che hanno un `CHECK` preesistente il valore fisico resta `recognition`, mentre `semantic_kind` conserva `sentence-matching`. In questo modo anche database creati dalle migrazioni storiche restano aggiornabili senza ricostruzione distruttiva.

## Catalogo iniziale

Sono incluse 20 scene generate appositamente: gatto, cane, bimbo e mamma, ciascuno nelle azioni mangia, dorme, corre, salta e gioca. Le combinazioni complete rendono disponibili entrambi i livelli di difficoltà.
