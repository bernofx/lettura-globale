# ADR 0025 — Colorare nella sezione Giochi

**Stato:** implementato.

## Decisione

Colorare vive in una sezione globale del pannello adulto. L’editor, le forme originali e il motore Canvas sono moduli separati. La navigazione principale monta la vista come per le altre sezioni.

Il disegno è costituito da contorni chiusi in ordine di sovrapposizione. L’area visibile sotto il primo contatto possiede il gesto fino al rilascio o annullamento. I segni vengono ritagliati al relativo contorno e le aree sovrapposte coprono i segni sottostanti. Il secchio colora direttamente l’area toccata.

La rotazione in verticale sospende il gesto in corso e mostra l’invito a girare il dispositivo. I segni rimangono in memoria durante la visita alla sezione. Il primo rilascio non collega i giochi alla fine di un esercizio o alla console remota e non aggiunge dati da sincronizzare.

Il catalogo comprende 24 disegni originali creati per Lettura Globale. La colonna sonora originale è sintetizzata dallo spartito in `scripts/render-coloring-music.mjs` e distribuita con l’app come `public/audio/coloring-game.mp3`; autore e fonte sono il progetto Lettura Globale e la licenza segue quella del repository, ove dichiarata. Il riuso del riproduttore dei premi consente volume basso, rispetto dell’audio generale, interruzione all’uscita e silenzio in verticale o in background. Gli strumenti sono icone in fila accanto alla colonna scorrevole dei colori, con nomi accessibili e aree di tocco da 44 px.

Il dialogo segue dimensioni e posizione di `VisualViewport` e compensa localmente la scala, così pannelli e tasto Esci sono accessibili anche se la pagina è ingrandita. Il browser gestisce il gesto a due dita sul disegno. Una variazione del viewport conclude l’eventuale tratto in corso prima di adattare la superficie.

Pennello, pastello e secchio sono disposti in una colonna verticale compatta, a fianco della colonna scorrevole dei colori.

Lo sfondo è la prima area del foglio. La selezione delle zone privilegia quelle sovrapposte e la figura copre i segni dipinti sullo sfondo, indipendentemente dallo strumento.

Il sottofondo predefinito è «Tummy-Rumble Calypso» di DURU-AI, [pubblicato dall’autore](https://github.com/uncle-sheepsky/duru-ai-cc0-bgm/tree/21f08fd3e3e63454e6993666ae48a45ab7db60cc) con licenza [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Il file locale `public/audio/coloring-calypso.mp3` è un estratto mono dei primi 64 secondi, con brevi dissolvenze. È distribuito insieme all’app.
