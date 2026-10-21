# ADR 0006: generazione delle attività e feedback multimodale

## Stato

Accettato.

## Contesto

Configurare un esercizio distinto per ogni parola rendeva rigida la programmazione di `Trova la parola`. Le classificazioni richiedono inoltre una variante testuale oltre al gioco con immagini `IL / LA`. Il feedback di errore era affidato soprattutto al messaggio testuale e non evidenziava sempre la scelta compiuta.

## Decisione

- `Trova la parola` usa per impostazione standard una configurazione casuale con numero di turni, tre o quattro distrattori, categorie e parole ammesse. La configurazione fissa resta disponibile come modalità avanzata.
- All'avvio della sessione la configurazione casuale viene compilata in turni concreti. Ogni turno conserva parola-obiettivo e ordine delle opzioni fino alla risposta, evitando riordinamenti durante il tentativo.
- Le parole-obiettivo non si ripetono consecutivamente. I distrattori privilegiano la stessa categoria, poi parole simili per iniziale o lunghezza e infine il resto del catalogo ammesso. Duplicati e parola-obiettivo vengono esclusi.
- Le configurazioni casuali restano normali esercizi inseribili nelle sequenze. I turni generati registrano l'identificatore dell'esercizio sorgente e la parola realmente presentata.
- `Parola nella categoria` presenta una parola in stampatello maiuscolo e categorie configurabili. Usa la categoria già salvata nella libreria, accetta tocco e trascinamento e registra tentativi e aiuti per parola.
- Una scelta errata evidenzia temporaneamente in rosso sia l'oggetto sia la destinazione interessata. Il messaggio testuale con regione live resta sempre disponibile.
- Gli effetti corretti ed errati sono sintetizzati localmente con Web Audio API. L'adulto può disattivarli; la preferenza resta nel browser. Nella modalità solo parole il suono positivo precede la sintesi vocale per evitare sovrapposizioni.
- Il formato salvato rimane additivo e compatibile con gli esercizi precedenti. Non sono necessarie nuove tabelle o nuovi oggetti R2.
- Le quattro scelte audio globali (corretto, errato, fine esercizio nella sequenza, selezione in `Numero quantità`) usano un elenco fisso di asset inclusi e brevi varianti Web Audio. Si salvano nel browser, come l'interruttore dei suoni; il caricamento di asset da libreria richiederà una decisione separata su upload, limiti e sincronizzazione.
- La fine di una sequenza regolare attiva una decorazione trasparente CSS non interattiva di sei secondi; i movimenti sono ridotti se il sistema richiede animazioni ridotte.

## Conseguenze

La generazione casuale non richiede scritture aggiuntive sul backend: D1 conserva soltanto la configurazione e gli eventi già previsti. Le statistiche distinguono riconoscimento, articolo e classificazione per categoria. Le categorie della libreria diventano dati didattici e devono quindi essere curate dall'adulto.
