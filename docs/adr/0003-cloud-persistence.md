# ADR 0003: persistenza cloud con D1 e R2

## Stato

Accettato.

## Contesto

L’applicazione salvava profili, libreria, esercizi, sequenze e risultati nel browser. I dati sopravvivevano a un aggiornamento nello stesso browser, ma non erano disponibili su altri dispositivi. Le immagini caricate erano conservate in IndexedDB.

## Decisione

- L’identità fornita da Sites delimita tutti i dati per account ChatGPT.
- D1 conserva un’unica istantanea JSON per utente nella tabella `user_states`, con versione dello schema, revisione e date di creazione e aggiornamento.
- R2 conserva i file immagine in un prefisso derivato dall’identità dell’utente. Le immagini sono servite solo dall’endpoint autenticato `/api/media/:id`.
- Il client continua a usare localStorage e IndexedDB come copia locale, carica lo stato remoto all’avvio e invia gli aggiornamenti a D1 con un debounce di 500 ms.
- Al primo accesso dopo l’aggiornamento, i dati locali vengono migrati automaticamente: i metadati vanno in D1 e le immagini private in R2.

## Motivazione

Una riga per account riduce il numero di query D1 e rende atomico il salvataggio dell’insieme correlato di profili, esercizi e risultati. Separare i file binari evita di gonfiare il database. La copia locale mantiene l’esperienza reattiva e consente di recuperare i dati già presenti durante la migrazione.

## Limiti

Il modello usa l’ultima scrittura valida quando lo stesso account modifica contemporaneamente i dati da più dispositivi. La colonna `revision` permette una futura gestione dei conflitti senza cambiare il formato dei dati salvati.
