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
- Gli aiuti sono eventi append-only associati, quando possibile, alla sessione e all'item corrente.

## Motivazione

La cancellazione logica preserva la continuità dello storico senza duplicare esercizi dentro ogni tentativo durante il prototipo. Identificatori di sessione e item rendono esplicito il confine del primo tentativo. Conservare tutto nello snapshot D1 mantiene basso il numero di query; R2 non è coinvolto nella gestione di esercizi e sequenze.

## Conseguenze

Lo snapshot può crescere con lo storico e richiederà una politica di retention. Prima del pilot andranno aggiunti snapshot/versioni descrittive dell'esercizio nello storico, controllo di revisione D1 e migrazione relazionale se volume o concorrenza superano i limiti del modello corrente.
