# Analisi — esercizio “Numero quantità”

## Valutazione

La nuova tipologia è realizzabile senza servizi esterni, ma richiede un modello di risultato dedicato e una decisione esplicita su chi determina la fine del turno. La complessità è media: l’interazione visiva è semplice, mentre persistenza, statistiche e gestione affidabile dell’inattività toccano più parti dell’app.

## Flusso consigliato

1. A ogni turno viene estratto un numero fra il minimo e il massimo configurati (inizialmente 1–10).
2. Lo schermo mostra sempre 10 oggetti dello stesso insieme, distribuiti in posizioni predefinite con una piccola variazione casuale. Mostrare esattamente il numero richiesto renderebbe l’attività un semplice “tocca tutto”.
3. La voce pronuncia “Tocca N oggetti”; il comando di riascolto resta disponibile.
4. Ogni tocco seleziona un oggetto, applica una spunta visibile e aggiorna un contatore. Un secondo tocco può deselezionarlo, così il bambino può correggersi.
5. Quando il conteggio coincide con il bersaglio parte un breve timer di inattività configurabile. Un nuovo tocco lo annulla.
6. L’adulto dispone sempre di “Numero corretto” e “Numero errato”.

## Chiusura del turno

Il silenzio non dimostra con certezza che il bambino abbia finito. Per questo si raccomanda:

- in modalità insegnamento: completamento automatico opzionale dopo 3 secondi solo se il conteggio è esatto;
- in modalità verifica: conferma dell’adulto come comportamento predefinito; il timer può segnalare “Possibile completamento” senza registrare autonomamente l’esito;
- se il conteggio supera il bersaglio, nessun completamento automatico: il bambino può correggere oppure l’adulto registra l’errore.

Questa distinzione evita che una pausa, una distrazione o un problema motorio vengano interpretati come una risposta conclusa.

## Configurazione proposta

- intervallo dei numeri (predefinito 1–10);
- numero di turni;
- insieme grafico: caramelle, coccinelle, sassolini oppure casuale;
- completamento automatico in insegnamento, con durata del timer;
- pronuncia automatica;
- possibilità di mescolare posizione e dimensione entro limiti che mantengano target tattili accessibili.

Gli oggetti dovrebbero essere asset SVG locali coerenti e non emoji di sistema, che cambiano aspetto fra dispositivi.

## Dati e statistiche

Il tipo `Exercise` deve accogliere `number-quantity` e i parametri sopra. Ogni turno deve conservare almeno:

- quantità richiesta e quantità finale selezionata;
- tipo di oggetto e identificativi selezionati;
- sequenza temporale di selezione/deselezione;
- esito indicato dall’adulto;
- metodo di completamento (`adult`, `idle-teaching`);
- tempo impiegato e aiuti.

Le risposte attuali sono centrate su `wordId` e `answerId`: forzare quantità numeriche dentro questi campi renderebbe gli storici poco affidabili. Serve quindi un evento strutturato dedicato o un payload di risposta tipizzato, più la relativa proiezione D1. È opportuna una ADR prima della migrazione perché il nuovo modello influenzerà anche altri futuri esercizi non basati su parole.

## Piano di implementazione

1. ADR per il modello degli esiti non lessicali e la politica di fine turno.
2. Estensione dei tipi, compilazione delle sessioni e schema D1.
3. Configuratore e asset grafici accessibili.
4. Schermata di esecuzione con contatore, selezione reversibile e controllo adulto.
5. Storico e statistiche specifiche per quantità.
6. Test su timer, tap rapidi/doppi, sospensione dell’app, ripristino sessione e viewport mobile.

## Decisione adottata

In modalità verifica il timer segnala soltanto un possibile completamento e l’adulto conferma sempre l’esito. In insegnamento il completamento automatico può essere attivato nella configurazione. La decisione e il formato degli esiti sono formalizzati nell’ADR 0010.
