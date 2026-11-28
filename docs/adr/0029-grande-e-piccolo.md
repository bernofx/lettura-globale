# ADR 0029 — Grande e Piccolo

## Stato

Proposto, in attesa di approvazione.

## Esperienza del bambino e configurazione

Ogni turno mostra la stessa immagine due volte, una grande e una piccola. Per esempio, il bambino vede due pere e sente «Tocca il più piccolo». Cambia soltanto la scala dell’immagine. Le due carte hanno la stessa superficie di tocco e mantengono le proporzioni della figura. Su telefono in verticale le carte seguono la disposizione delle altre attività a due immagini. La consegna è anche scritta e rispetta volume e silenzioso.

L’adulto imposta il numero di turni (da 1 a 50, inizialmente 6) e sceglie una delle tre fonti.

- **Tutte le immagini** usa le immagini di parole disponibili in Libreria.
- **Categorie specifiche** usa le immagini delle categorie selezionate.
- **Immagini puntuali** usa solo le schede scelte dall’adulto.

Sono ammesse le schede di parole attive con un’immagine utilizzabile. Scene-frase e simboli riservati alle categorie sono esclusi. Per una fonte esplicita occorre almeno una scelta valida. Se il gruppo diventa vuoto, il pannello indica come correggerlo. Basta una sola immagine per giocare.

Le immagini si estraggono senza ripetizioni fino a esaurire il gruppo. Le due consegne sono bilanciate nella sessione e la posizione del grande varia indipendentemente dalla consegna. Si fissa il turno all’avvio, inclusi soggetto, consegna e posizione, anche durante una pausa, un nuovo tentativo o la ripresa della sessione. Feedback, aiuti, primo tentativo e avanzamento seguono il normale flusso di insegnamento, valutazione e controllo adulto.

## Rappresentazione proposta

- Lo snapshot usa il tipo semantico `size-comparison`, il numero di turni e gli elenchi di ID delle immagini o nomi delle categorie. Per la fonte «tutte» entrambi gli elenchi sono vuoti. Quando si cambia fonte si salva solo la selezione attiva. La scomparsa di tutti i riferimenti espliciti durante la risoluzione non deve trasformare l’esercizio in «tutte».
- I CHECK storici di `drizzle/0004_relational_data.sql` limitano `exercises.kind`, `session_items.kind` e i ruoli dei riferimenti. La migrazione 0012 ha già aggiunto `semantic_kind` a entrambe le tabelle. Scrivere il valore fisico `recognition` e quello semantico `size-comparison` in entrambe, come per «Abbina la frase». Usare i ruoli esistenti `recognition_pool` e `recognition_filter` per i riferimenti e la colonna `rounds`. I tipi storici continuano a essere letti con le regole attuali. La proposta non richiede DDL o riscrittura dei dati.
- Il turno usa due risposte distinte e stabili, `size:large` e `size:small`, anche quando le due carte puntano allo stesso media. Nello storico il bersaglio conserva una fotografia della consegna e del soggetto. Le due opzioni conservano lo stesso riferimento al media con etichetta «Grande» o «Piccolo», in ordine di presentazione. La tabella `session_item_content` identifica le opzioni per ruolo e posizione. Registrare l’ID della risposta e l’esito con il normale protocollo dei tentativi.
- Progressi e CSV distinguono il confronto di grandezza dal riconoscimento della parola. Un successo nel confronto fra due pere non attesta l’acquisizione della parola «pera». Lo storico resta interpretabile dopo la modifica dell’esercizio o della scheda di Libreria.
- Catalogo, copie di sequenza, riepilogo accessibile dall’occhio, avvio rapido, salvataggio offline, sostituzione di riferimenti e anteprima condivisa usano la stessa configurazione. Il link contiene soltanto gli asset necessari ai turni compilati e non registra risultati. Si mantengono i permessi e le regole per i media del catalogo.

## Verifiche per l’implementazione

Con dati sintetici verificare le tre fonti, i gruppi vuoti, una singola immagine, turni pari e dispari, entrambi gli ordini di risposta e il ripristino esatto a metà sessione. Eseguire un round-trip snapshot → tabelle → snapshot su esercizio e storico, con scrittura su D1 locale costruito dalle migrazioni distribuite. Verificare un primo tentativo errato seguito da una correzione, statistiche, CSV, anteprima condivisa e il riepilogo di una copia di sequenza. Provare il flusso da tastiera e touch nei tre temi.
