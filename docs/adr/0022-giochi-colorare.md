# ADR 0022 — Colorare nella sezione Giochi

**Stato:** implementato sul branch della funzionalità.

## Decisione

Colorare vive in una sezione globale del pannello adulto. L’editor, le forme originali e il motore Canvas sono moduli separati. La navigazione principale monta la vista come per le altre sezioni.

Il disegno è costituito da contorni chiusi in ordine di sovrapposizione. L’area visibile sotto il primo contatto possiede il gesto fino al rilascio o annullamento. I segni vengono ritagliati al relativo contorno e le aree sovrapposte coprono i segni sottostanti. Il secchio colora direttamente l’area toccata.

La rotazione in verticale sospende il gesto in corso e mostra l’invito a girare il dispositivo. I segni rimangono in memoria durante la visita alla sezione. Il primo rilascio non collega i giochi alla fine di un esercizio o alla console remota e non aggiunge dati da sincronizzare.
