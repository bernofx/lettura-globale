# ADR 0007: modalità protetta, ripristino della sessione e temi

## Stato

Accettato.

## Contesto

Durante un esercizio il bambino può usare i controlli dell'app o la cronologia del browser e uscire involontariamente dall'attività. Chrome e le PWA non consentono a una pagina web di bloccare in modo affidabile i comandi del sistema operativo, la chiusura dell'app o tutti i gesti del browser. Una sospensione o una chiusura può inoltre interrompere una sessione in corso. Il bootstrap cloud poteva restare in attesa quando una richiesta, il lifecycle della pagina o una risorsa servita dal service worker non terminavano correttamente.

L'aspetto dell'app era fisso e non offriva una configurazione semplice e persistente di colori e forme.

## Decisione

- La modalità protetta si attiva soltanto mentre un esercizio è in corso. Nasconde la navigazione adulta e intercetta la navigazione indietro interna.
- Il comando `Termina` richiede una pressione continua di quattro secondi. Al termine della pressione viene richiesto il PIN del profilo adulto attivo.
- Questa protezione riduce le uscite accidentali nell'interfaccia. Non viene presentata come blocco dei comandi di sistema, della chiusura di Chrome/PWA o dei controlli del dispositivo.
- Lo stato minimo della sessione attiva viene salvato in `localStorage`: piano compilato, posizione corrente e massima raggiunta, modalità, presentazione, bambino, adulto e riferimenti della sessione. Le anteprime pubbliche non vengono salvate. Lo snapshot scade dopo 24 ore ed è rimosso al completamento, all'uscita o quando l'adulto lo scarta.
- Alla riapertura, dopo il caricamento dei dati e l'identificazione dell'adulto, l'app propone di riprendere o scartare la sessione. Il ripristino è consentito soltanto allo stesso profilo adulto e a un bambino ancora associato.
- Il PIN resta un controllo applicativo locale all'interno dell'account autenticato. Viene confrontato con l'hash già contenuto nello stato dell'account e non sostituisce autenticazione o autorizzazione server-side.
- Il configuratore `Aspetto` espone sette temi predefiniti, sette palette, quattro forme dei controlli e un'anteprima immediata. Il preset `Lettura Globale` riprende il giallo, il blu notte e l'azzurro dell'icona applicativa mantenendo il blu scuro come colore primario leggibile. La preferenza è salvata nella copia locale e nello snapshot cloud dell'account.
- Il bootstrap cloud applica timeout e retry limitati. In caso di errore rende comunque disponibile la copia locale e offre retry manuale. Alla ripresa della pagina o al ritorno della rete aggiorna il service worker e ritenta il bootstrap se non era stato completato.
- Il service worker usa una strategia network-first con timeout per navigazioni, script, stili e worker, mantenendo la cache come fallback offline. Il nome della cache viene incrementato a ogni modifica incompatibile degli asset.

## Conseguenze

La sessione può essere recuperata dopo refresh, sospensione o chiusura, ma le interazioni avvenute fra l'ultimo salvataggio e l'interruzione possono dover essere ripetute. `localStorage` può essere cancellato dal browser o non essere disponibile, quindi il recupero è una funzione di continuità e non un backup.

La preferenza visiva è condivisa a livello di account cloud; l'ultima modifica sincronizzata prevale come per il resto dello snapshot. L'avvio non resta più bloccato indefinitamente per un errore cloud: il pannello locale rimane utilizzabile e segnala lo stato di sincronizzazione.

## Aggiornamento: stili dell’interfaccia

Oltre a palette e forma dei controlli, Aspetto offre tre stili dell’interfaccia: **Classico** (l’aspetto di sempre, predefinito), **Studio** (menu laterale scuro raggruppato in Lavoro e Contenuti, pagine dense, riquadro «Da sistemare» in Oggi e, durante l’esercizio su schermi grandi, aiuti dell’adulto in un pannello laterale scuro) e **Giocoso** (aree a colori, forme morbide, carattere Nunito, riquadri delle aree in Oggi e carte colorate nell’esercizio). I componenti condividono dati e logica. Lo stile applica `data-style` sull’elemento radice, mentre la navigazione Studio segue lo stesso ordine nel markup e sullo schermo. Palette e forma si applicano a tutti gli stili.

Su telefono e tablet Studio gli aiuti si aprono in un pannello modale con controlli da almeno 44 px. Su tablet le quattro risposte occupano due righe. Negli esercizi Trova la parola e Abbina la frase il feedback ha uno spazio dedicato sotto le risposte. Aspetto mostra le tre opzioni affiancate e l’anteprima dello stile attivo su telefono. In Libreria i filtri delle parole sono condivisi e Studio presenta i risultati in righe compatte.

La barra mobile e il menu espanso condividono le voci. Il menu espanso riceve il focus e lo restituisce all’apertura quando si chiude. L’avanzamento usa una sola riga scorrevole e registra i turni effettivamente avanzati anche nel recupero locale. Per riordinare una sequenza si può trascinare, usare la tastiera o scegliere direttamente una posizione. Progressi usa i primi tentativi della modalità attiva e riconosce la tipologia degli avvii rapidi tramite lo storico disponibile. Il grafico mensile mantiene le distanze tra mesi e lascia una discontinuità dove mancano prove.

La preferenza `interfaceStyle` (`classic` | `studio` | `playful`) è sincronizzata con l’account nello snapshot cloud, con copia locale, come `tracingOrderRequired`: nessuna colonna o migrazione D1, gli snapshot precedenti valgono come Classico, i valori ignoti sono rifiutati dal server e un salvataggio completo che la omette la conserva. I caratteri Inter, Space Grotesk e Nunito sono inclusi nell’app (`@fontsource`, licenza SIL OFL 1.1) e non comportano richieste a servizi esterni.
