# ADR 0005: amministratore e associazioni terapista-bambino

## Stato

Accettato.

## Contesto

Più terapisti possono seguire lo stesso bambino. Serve inoltre un profilo che possa creare le credenziali dei terapisti e gestire le associazioni senza duplicare il profilo o lo storico del bambino.

## Decisione

- Il profilo iniziale di Giuseppe Bernasconi ha ruolo `Amministratore`.
- Solo l'interfaccia dell'amministratore espone la creazione dei terapisti e la matrice di associazione ai bambini.
- La relazione molti-a-molti resta rappresentata dai `childIds` di ogni terapista nello snapshot D1.
- Un nuovo terapista richiede nome, cognome, email univoca, PIN iniziale e almeno un bambino associato.
- Il PIN viene salvato soltanto come hash; la tabella D1 `therapist_credentials` viene riallineata a ogni salvataggio dello stato.
- Le credenziali rimosse dallo snapshot vengono eliminate dalla tabella, evitando accessi residui.
- L'amministratore può eliminare i profili terapista non amministrativi dopo una conferma; il profilo amministratore iniziale non è eliminabile da questa matrice.
- R2 non è coinvolto nelle associazioni e continua a contenere soltanto i file privati.

## Conseguenze

Un bambino mantiene un solo profilo e uno storico condiviso anche quando è seguito da più adulti. Prima dell'uso reale devono essere aggiunti inviti, recupero accesso, audit amministrativo e autorizzazione server-side granulare per ogni operazione.
