# ADR 0025 — Colorare nella sezione Giochi

**Stato:** implementato, in attesa di approvazione esplicita per le parti su privacy e licenze (conservazione in R2 di audio caricati dagli adulti, adozione della traccia CC0 di terzi), come richiesto da `AGENTS.md` regola 4.

## Decisione

Colorare vive nel catalogo Giochi del pannello adulto. Una tessera con immagine e nome apre la galleria dei disegni. L’editor, le forme originali e il motore Canvas sono moduli separati.

Il disegno è costituito da contorni chiusi in ordine di sovrapposizione. L’area visibile sotto il primo contatto possiede il gesto fino al rilascio o annullamento. I segni vengono ritagliati al relativo contorno e le aree sovrapposte coprono i segni sottostanti. Il secchio colora direttamente l’area toccata.

I segni rimangono in memoria durante la visita alla sezione come dati vettoriali (strumento, colore, punti). Per il disegno aperto ogni area dipinta ha una cache grande quanto l’area e alla risoluzione del dispositivo, ricostruita dai vettori quando cambia la scala e liberata all’uscita; se la memoria per il canvas non è disponibile i segni vengono ridisegnati dai vettori, senza andare persi. I dettagli puntiformi (occhi) sono tracciati spessi e le linee sottili, indipendentemente dall’ordine. Questa sezione di giochi è autonoma rispetto ai premi durante o al termine degli esercizi.

Il catalogo comprende 24 disegni originali creati per Lettura Globale. Il riproduttore rispetta l’audio generale, si ferma all’uscita e silenzia la musica quando la scheda va in background.

Il dialogo segue dimensioni e posizione di `VisualViewport` e compensa localmente la scala, così pannelli e tasto Esci sono accessibili anche se la pagina è ingrandita. Se il viewport è più alto che largo, l’interfaccia ruota di 90 gradi e il canvas trasforma le coordinate dei tocchi. Il browser gestisce il gesto a due dita sul disegno. Una variazione del viewport conclude l’eventuale tratto in corso prima di adattare la superficie.

Durante Colorare e i palloncini, l’app usa un passo di cronologia nello stesso documento per assorbire Indietro in silenzio. Esc lascia il gioco aperto; se il browser chiude comunque il dialogo (Esc ripetuto senza attivazione utente) l’app lo riapre subito. L’uscita dalla X rimuove il passo attivo. I palloncini mantengono il timer della festa finale e il comando remoto del premio.

Pennello, pastello e secchio sono disposti in una colonna verticale compatta, a fianco della colonna scorrevole dei colori. Musica ed Esci sono sopra le due colonne, così il foglio può occupare tutta l’altezza disponibile.

Il canvas riempie il pannello. Il disegno scala uniformemente e i margini del foglio diventano parte dello sfondo colorabile. I segni usano le coordinate del disegno, così restano al loro posto anche quando cambia la larghezza del foglio. La selezione privilegia le zone sovrapposte e la figura copre i segni dipinti sullo sfondo.

Il sottofondo predefinito è «Tummy-Rumble Calypso» di DURU-AI, [pubblicato dall’autore](https://github.com/uncle-sheepsky/duru-ai-cc0-bgm/tree/21f08fd3e3e63454e6993666ae48a45ab7db60cc) con licenza [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Il file locale `public/audio/coloring-calypso.mp3` è un estratto mono dei primi 64 secondi, con brevi dissolvenze. È distribuito insieme all’app.

La Libreria permette a un adulto di sostituire il sottofondo di Giochi con un MP3 di massimo 6 MB e 5 minuti. Il Worker convalida il formato e salva un singolo oggetto privato in R2 per account. Il caricamento richiede fonte o autore, licenza e conferma dei diritti, salvati nei metadati dell’oggetto insieme alla data della conferma. La traccia può essere ascoltata in anteprima, anche con richieste parziali (Range aperti, finali, 416 se non soddisfacibili), e rimossa dalla Libreria. Il controllo MP3 accetta tag e riempimenti finali comuni (ID3v1/v2, APEv2, Lyrics3, zeri) e un ultimo frame troncato, e rifiuta altri dati. Il service worker risponde alle richieste Range con un 206 ricavato dalla cache e non memorizza risposte parziali. Colorare riproduce Calypso quando la traccia personalizzata è assente o indisponibile.
