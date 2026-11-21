# ADR 0025 — Colorare nella sezione Giochi

**Stato:** implementato.

## Decisione

Il catalogo Giochi del pannello adulto mostra una tessera con immagine e nome per ogni gioco. Ogni dettaglio ha il titolo del gioco e il ritorno al catalogo. Colorare apre la galleria dei disegni. L’editor, le forme originali e il motore Canvas sono moduli separati.

Il disegno è costituito da contorni chiusi in ordine di sovrapposizione. L’area visibile sotto il primo contatto possiede il gesto fino al rilascio o annullamento. I segni vengono ritagliati al relativo contorno e le aree sovrapposte coprono i segni sottostanti. Il secchio colora direttamente l’area toccata.

I segni rimangono in memoria durante la visita alla sezione. Questa sezione di giochi è autonoma rispetto ai premi durante o al termine degli esercizi.

Il catalogo comprende 24 disegni originali creati per Lettura Globale. Il riproduttore rispetta l’audio generale, si ferma all’uscita e silenzia la musica quando la scheda va in background.

Il dialogo segue dimensioni e posizione di `VisualViewport` e compensa localmente la scala, così pannelli e tasto Esci sono accessibili anche se la pagina è ingrandita. Se il viewport è più alto che largo, l’interfaccia ruota di 90 gradi e il canvas trasforma le coordinate dei tocchi. Il browser gestisce il gesto a due dita sul disegno. Una variazione del viewport conclude l’eventuale tratto in corso prima di adattare la superficie.

Durante Colorare e i palloncini, l’app usa un passo di cronologia nello stesso documento per assorbire Indietro in silenzio. Esc lascia il gioco aperto. L’uscita dalla X rimuove il passo attivo. I palloncini mantengono il timer della festa finale e il comando remoto del premio.

Pennello, pastello e secchio sono disposti in una colonna verticale compatta, a fianco della colonna scorrevole dei colori. Musica ed Esci sono sopra le due colonne, così il foglio può occupare tutta l’altezza disponibile.

Il canvas riempie il pannello. Il disegno scala uniformemente e i margini del foglio diventano parte dello sfondo colorabile. I segni usano le coordinate del disegno, così restano al loro posto anche quando cambia la larghezza del foglio. La selezione privilegia le zone sovrapposte e la figura copre i segni dipinti sullo sfondo.

Il sottofondo predefinito è «Tummy-Rumble Calypso» di DURU-AI, [pubblicato dall’autore](https://github.com/uncle-sheepsky/duru-ai-cc0-bgm/tree/21f08fd3e3e63454e6993666ae48a45ab7db60cc) con licenza [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Il file locale `public/audio/coloring-calypso.mp3` è un estratto mono dei primi 64 secondi, con brevi dissolvenze. È distribuito insieme all’app.

La Libreria permette a un adulto di sostituire il sottofondo di Giochi con un MP3 di massimo 6 MB e 5 minuti. Il Worker convalida il formato e salva un singolo oggetto privato in R2 per account. La traccia può essere ascoltata in anteprima e rimossa dalla Libreria. I giochi del catalogo riproducono Calypso quando la traccia personalizzata è assente o indisponibile.

Palloncini riusa le ondate, gli scoppi e l’animazione del premio in una partita libera. La partita avviata dal catalogo usa la colonna sonora di Giochi e termina con la X. Il premio e la festa di fine attività usano la propria colonna sonora.

Puzzle a incastro riusa la vista orizzontale e la protezione Indietro dei giochi. La galleria mostra un’anteprima per immagine, con avvio diretto nei formati 4 × 4, 4 × 5 e 5 × 5, indicati come righe × colonne. I pezzi si possono riordinare sul vassoio e quello afferrato passa davanti agli altri. L’immagine intera conserva le proporzioni. Dove serve, lo sfondo sfumato riempie lo spazio attorno alla foto. Casa viene dal catalogo demo esistente. La Libreria dell’account e i file del dispositivo possono aggiungere anteprime per la visita al gioco.

Libreria → Puzzle salva immagini WebP in R2 dentro un prefisso privato dell’account, con titolo, fonte e dichiarazione del diritto d’uso. La galleria le include automaticamente. I dati degli esercizi restano separati. Se la rete cade, il browser tiene in coda solo i caricamenti non confermati di un account già verificato e li ritenta quando torna la connessione. Lo stesso identificativo rende sicuri i tentativi ripetuti. La rimozione sostituisce l’immagine con un marcatore vuoto, così un ritentativo tardivo non la ripristina.
