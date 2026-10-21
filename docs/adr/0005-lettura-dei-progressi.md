# ADR 0005: lettura dei progressi di apprendimento

## Contesto

La precedente pagina Progressi offriva viste separate per parola, parola più esercizio ed esercizio. La ripetizione delle stesse informazioni rendeva difficile confrontare immediatamente le competenze e l'andamento nel tempo. Inoltre gli aiuti non erano attribuiti alla parola e i dati di insegnamento e valutazione rischiavano di essere letti come un'unica misura.

## Decisione

- La sintesi principale è una matrice: parole sulle righe, tipi di attività sulle colonne e accuratezza del primo tentativo nelle celle.
- I colori comunicano tre fasce descrittive: almeno 80%, dal 50% al 79%, meno del 50%. La percentuale resta accompagnata dal numero di risposte corrette e prove totali.
- La riga selezionata alimenta un grafico mensile con mesi sull'asse X e accuratezza da 0% a 100% sull'asse Y. Una sola rilevazione viene mostrata come punto, senza suggerire una tendenza.
- `test` è presentata come **Valutazione** ed è la vista predefinita per acquisizione e mantenimento. Considera il primo tentativo prima delle correzioni.
- `teaching` è presentata come **Insegnamento** e descrive la pratica guidata. Accuratezza e aiuti restano visibili, ma separati dalla misura di valutazione.
- Ogni nuovo aiuto conserva `wordId` e modalità. I record precedenti restano leggibili; quando possibile la parola viene ricavata dall'esercizio associato.
- L'export Excel contiene nello stesso file un riepilogo per competenza e per coppia parola × competenza, seguito dal dettaglio dei tentativi. I riepiloghi contano soltanto il primo tentativo e mantengono colonne separate per Valutazione e Insegnamento.
- Lo stato descrittivo nell'export usa soltanto la Valutazione: con meno di cinque prove indica `Dati insufficienti`; da cinque prove indica `Acquisita` con accuratezza almeno 80%, `In consolidamento` dal 50% al 79% e `Da esercitare` sotto il 50%. È un supporto alla lettura dei dati, non una valutazione clinica automatica.
- Il file viene codificato UTF-16 little-endian con BOM e separatore dichiarato `;`, per impedire che Excel interpreti `Sì` e altri caratteri italiani con una codifica errata.

## Motivazione

Le pratiche di progress monitoring rappresentano le prestazioni nel tempo e usano linea, pendenza e cambi di fase per sostenere decisioni didattiche. Nella letteratura sulle prove discrete, le risposte corrette indipendenti o alla prima istruzione vengono inoltre distinte dai livelli di prompt. La separazione evita che un successo ottenuto con aiuto venga interpretato come padronanza indipendente.

## Riferimenti

- IRIS Center, *Create a Goal Line*: https://iris.peabody.vanderbilt.edu/module/pmm/cresource/q2/p05/
- IRIS Center, *Progress Monitoring*: https://iris.peabody.vanderbilt.edu/module/pmm/cresource/q1/p02/
- Stecker et al., comprensione dei grafici CBM: https://pmc.ncbi.nlm.nih.gov/articles/PMC7433367/
- Carroll et al., raccolta dati nelle discrete-trial teaching procedures: https://pmc.ncbi.nlm.nih.gov/articles/PMC3196207/
