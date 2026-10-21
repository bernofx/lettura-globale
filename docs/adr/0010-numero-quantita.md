# ADR 0010: esercizio Numero quantità ed esiti non lessicali

## Contesto

Gli esercizi esistenti registrano risposte riferite soprattutto a elementi della libreria. `Numero quantità` richiede invece un bersaglio numerico, un conteggio selezionato, il metodo di completamento e una regola affidabile per distinguere una pausa dalla fine intenzionale del turno.

## Decisione

- Ogni turno mostra dieci oggetti vettoriali e sorteggia un bersaglio nell’intervallo configurato. Gli oggetti selezionati possono essere deselezionati.
- In valutazione non ci sono timer: l’adulto registra sempre `Numero corretto` o `Numero errato` e passa subito al turno seguente.
- In insegnamento una barra neutra mostra il tempo di inattività, configurabile e uguale per conteggi corretti ed errati, così non anticipa l’esito. Ogni clic, tocco o pressione di tasto riavvia la barra. Se il conteggio è corretto e il riconoscimento automatico è abilitato, compare la spunta; altrimenti serve la conferma adulta. Un conteggio errato produce suono e X rossa. Dopo l’esito solo l’adulto avanza con `Continua`; dopo un errore può anche scegliere `Riprova`, conservando nello storico gli esiti precedenti. Il link condiviso usa sempre il timer dell’insegnamento senza salvare risultati.
- La configurazione viene persistita in colonne dedicate della tabella `exercises`.
- L’esito usa un identificatore discriminato e versionabile nel formato `quantity:<target>:<selected>:<method>[:<attemptKey>]`. La chiave univoca permette di conservare più esiti identici nello stesso turno senza indebolire la protezione generale dai doppi tap; un blocco sincrono evita il doppio invio dello stesso gesto. Un parser di dominio produce l’etichetta italiana salvata nello storico relazionale. Gli identificatori degli oggetti toccati non vengono conservati perché sono equivalenti e rigenerati a ogni turno; vengono conservati bersaglio, conteggio finale, esito, metodo, modalità, adulto, bambino e timestamp.
- Le quantità non entrano nella matrice “parole × attività”. Restano incluse nell’accuratezza generale, nello storico sessione e nei raggruppamenti per esercizio.

## Conseguenze

La soluzione mantiene compatibilità con il journal degli eventi e con le scritture granulari senza introdurre una tabella per ogni futura attività non lessicale. Il prefisso discriminato deve essere interpretato soltanto da funzioni di dominio, non costruito liberamente dai componenti UI. Se futuri esercizi richiederanno traiettorie complete dei gesti o payload più articolati, sarà introdotta una colonna JSON tipizzata o una tabella `attempt_payloads` con una nuova ADR.

Lo schema D1 storico di `session_items.kind` non include `number-quantity`. Per evitare l'errore 500 `state_change_failed_batch` nelle installazioni già pubblicate, la proiezione salva questi item con il valore compatibile `recognition` e ne ricostruisce il tipo tramite l'identificatore discriminato delle risposte. È una compatibilità intenzionale, coperta da test di round-trip; un'eventuale migrazione del `CHECK` richiede verifica separata sullo schema distribuito.

## Verifica

I test devono coprire generazione entro i limiti, oggetti misti, compilazione in turni, round-trip relazionale, etichette dello storico, tentativi ripetuti e assenza di immagini nel riepilogo. La prova manuale deve verificare barra riavviata da clic e tocchi ovunque, selezione reversibile, `Riprova` e `Continua` dopo errore e conferma adulta obbligatoria in valutazione.
