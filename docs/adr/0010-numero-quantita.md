# ADR 0010: esercizio Numero quantità ed esiti non lessicali

## Contesto

Gli esercizi esistenti registrano risposte riferite soprattutto a elementi della libreria. `Numero quantità` richiede invece un bersaglio numerico, un conteggio selezionato, il metodo di completamento e una regola affidabile per distinguere una pausa dalla fine intenzionale del turno.

## Decisione

- Ogni turno mostra dieci oggetti vettoriali e sorteggia un bersaglio nell’intervallo configurato. Gli oggetti selezionati possono essere deselezionati.
- In valutazione l’inattività produce soltanto un suggerimento: l’adulto registra sempre `Numero corretto` o `Numero errato`.
- In insegnamento il completamento automatico è opzionale e avviene soltanto quando il conteggio coincide con il bersaglio per l’intera durata configurata. Ogni nuovo tocco annulla e riavvia il timer.
- La configurazione viene persistita in colonne dedicate della tabella `exercises`.
- L’esito usa un identificatore discriminato e versionabile nel formato `quantity:<target>:<selected>:<method>`. Un parser di dominio produce l’etichetta italiana salvata nello storico relazionale. Gli identificatori degli oggetti toccati non vengono conservati perché sono equivalenti e rigenerati a ogni turno; vengono conservati bersaglio, conteggio finale, esito, metodo, modalità, adulto, bambino e timestamp.
- Le quantità non entrano nella matrice “parole × attività”. Restano incluse nell’accuratezza generale, nello storico sessione e nei raggruppamenti per esercizio.

## Conseguenze

La soluzione mantiene compatibilità con il journal degli eventi e con le scritture granulari senza introdurre una tabella per ogni futura attività non lessicale. Il prefisso discriminato deve essere interpretato soltanto da funzioni di dominio, non costruito liberamente dai componenti UI. Se futuri esercizi richiederanno traiettorie complete dei gesti o payload più articolati, sarà introdotta una colonna JSON tipizzata o una tabella `attempt_payloads` con una nuova ADR.

Lo schema D1 storico di `session_items.kind` non include `number-quantity`. Per evitare l'errore 500 `state_change_failed_batch` nelle installazioni già pubblicate, la proiezione salva questi item con il valore compatibile `recognition` e ne ricostruisce il tipo tramite l'identificatore discriminato delle risposte. È una compatibilità intenzionale, coperta da test di round-trip; un'eventuale migrazione del `CHECK` richiede verifica separata sullo schema distribuito.

## Verifica

I test devono coprire generazione entro i limiti, oggetti misti, compilazione in turni, round-trip relazionale, etichette dello storico e assenza di immagini nel riepilogo. La prova manuale deve verificare timer annullato dai tocchi, selezione reversibile e conferma adulta obbligatoria in valutazione.
