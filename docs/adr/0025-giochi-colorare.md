# ADR 0025 — Colorare nella sezione Giochi

**Stato:** implementato.

## Decisione

Colorare vive in una sezione globale del pannello adulto. L’editor, le forme originali e il motore Canvas sono moduli separati. La navigazione principale monta la vista come per le altre sezioni.

Il disegno è costituito da contorni chiusi in ordine di sovrapposizione. L’area visibile sotto il primo contatto possiede il gesto fino al rilascio o annullamento. I segni vengono ritagliati al relativo contorno e le aree sovrapposte coprono i segni sottostanti. Il secchio colora direttamente l’area toccata.

La rotazione in verticale sospende il gesto in corso e mostra l’invito a girare il dispositivo. I segni rimangono in memoria durante la visita alla sezione. Il primo rilascio non collega i giochi alla fine di un esercizio o alla console remota e non aggiunge dati da sincronizzare.

Il catalogo comprende 24 disegni originali creati per Lettura Globale. La colonna sonora originale è sintetizzata dallo spartito in `scripts/render-coloring-music.mjs` e distribuita con l’app come `public/audio/coloring-game.mp3`; autore e fonte sono il progetto Lettura Globale e la licenza segue quella del repository, ove dichiarata. Il riuso del riproduttore dei premi consente volume basso, rispetto dell’audio generale, interruzione all’uscita e silenzio in verticale o in background. Gli strumenti sono icone in fila accanto alla colonna scorrevole dei colori, con nomi accessibili e aree di tocco da 44 px.
