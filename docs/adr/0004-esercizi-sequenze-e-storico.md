# ADR 0004: gestione di esercizi, sequenze e storico

## Stato

Accettato.

## Contesto

Terapisti e genitori devono poter creare, modificare, duplicare, ordinare e rimuovere esercizi e sequenze. I tentativi già registrati devono restare leggibili anche quando la programmazione cambia. La persistenza attuale usa uno snapshot JSON per account in D1 e file separati in R2.

## Decisione

- Ogni esercizio e sequenza ha un identificatore stabile e una data `updatedAt`.
- La sequenza attiva viene salvata nello stato D1 con `activeSequenceId`.
- La cancellazione di esercizi e sequenze è logica tramite `deleted: true`.
- Un esercizio cancellato viene rimosso dalle sequenze attive, ma tentativi e aiuti conservano il suo identificatore.
- La cancellazione di una sequenza non cancella gli esercizi che contiene né i risultati storici.
- La duplicazione crea un nuovo identificatore e aggiunge la copia alla sequenza attiva.
- Ogni item della sessione ha un `sessionItemId`; il primo evento accettato è il primo tentativo e gli eventi successivi sono correzioni.
- Una risposta identica ripetuta sullo stesso item viene ignorata per rendere innocuo il doppio tap.
- Gli aiuti sono eventi append-only associati, quando possibile, alla sessione, alla parola, all'item corrente e alla modalità (`teaching` o `test`).
- Ogni esercizio dichiara il proprio tipo: riconoscimento oppure classificazione `IL / LA`; una sequenza può mescolare liberamente entrambi.
- Un esercizio `IL / LA` salva l'insieme delle immagini ammesse e il numero di turni; a ogni esecuzione l'ordine viene casualizzato e viene mostrata una sola immagine alla volta.
- I tentativi salvano anche l'identificatore della parola. La vista principale usa una matrice con le parole sulle righe e i tipi di attività sulle colonne; evita aggregazioni ridondanti per esercizio.
- Le modalità restano separate: `test` rappresenta la valutazione del primo tentativo, `teaching` la pratica guidata e il carico di aiuti.
- L'evoluzione temporale è aggregata per mese, con il tempo sull'asse X e l'accuratezza del primo tentativo sull'asse Y. Le serie dei diversi tipi di attività restano distinguibili.
- La Home apre la configurazione della sessione; da lì l'adulto può avviare una singola attività oppure scegliere esplicitamente una sequenza salvata.
- Durante la preparazione è disponibile un azzeramento esplicito dei tentativi e degli aiuti del solo bambino attivo, protetto da conferma.

## Motivazione

La cancellazione logica preserva la continuità dello storico senza duplicare esercizi dentro ogni tentativo durante il prototipo. Identificatori di sessione e item rendono esplicito il confine del primo tentativo. Conservare tutto nello snapshot D1 mantiene basso il numero di query; R2 non è coinvolto nella gestione di esercizi e sequenze.

## Conseguenze

Lo snapshot può crescere con lo storico e richiederà una politica di retention. Prima del pilot andranno aggiunti snapshot/versioni descrittive dell'esercizio nello storico, controllo di revisione D1 e migrazione relazionale se volume o concorrenza superano i limiti del modello corrente.
