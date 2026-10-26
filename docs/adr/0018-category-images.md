# ADR 0018 — Simboli espliciti delle categorie

Stato: approvato dall’utente il 26 ottobre 2026.

## Decisione

La libreria elenca automaticamente le categorie presenti negli elementi attivi.
L’adulto sceglie un’immagine esistente oppure carica un simbolo privato,
con conferma dei diritti. Non si usano immagini casuali o fallback silenziosi.

Le associazioni sono dati dell’account (`categorySymbols`, categoria → ID libreria),
persistiti in `categories.symbol_library_item_id`. I caricamenti dedicati sono
asset privati D1/R2 con flag `categorySymbolOnly`: non diventano bersagli o
distrattori dei normali esercizi. Fonte, licenza e autore sono conservati.
Il cloud è primario; offline si usano coda e recupero degli upload esistenti.

Parola nella categoria introduce tre opzioni indipendenti, disattivate negli
esercizi storici: pronuncia iniziale della parola, immagine della parola e simboli
delle categorie. `autoPronounce` mantiene il precedente significato di pronuncia
della categoria dopo l’abbinamento corretto.

Configuratore, avvio rapido, compilazione e condivisione controllano tutte le
categorie selezionate. I simboli richiesti ma mancanti, archiviati o senza grafica
bloccano il flusso con un messaggio esplicito. Gli esercizi testuali non richiedono
simboli. La foto del bersaglio richiede grafica per le parole scelte.

Turni compilati e anteprime congelano `categorySymbolIds` per le sole categorie
richieste. La libreria condivisa include solo gli asset necessari, anche se
appartengono a categorie diverse. Nessuna esposizione della mappa completa o di
immagini estranee. I vecchi link rimangono immutabili. Non cambiano autenticazione,
permessi, provider, retention o statistiche.

## Compatibilità e distribuzione

Migrazione forward-only `0016_category_images.sql`: cinque colonne additive,
simbolo nullable e quattro flag con default 0. CHECK storici verificati: nessun
nuovo kind/ruolo persistito o tabella ricreata. Applicare prima del deploy da main.
Il rollback del codice non richiede di eliminare colonne o dati.

Il prompt vuoto è un riferimento opzionale assente, non un ID libreria:
la proiezione lo ignora evitando falsi warning bloccanti nelle categorie e nei
riconoscimenti casuali.

## Verifica

Test dominio, SQLite storico e Worker/Miniflare completo: default, round-trip,
scritture granulari, esclusione dei simboli dai pool, blocco delle immagini
mancanti, snapshot immutabili e perimetro pubblico. Verifica visiva/touch e
ascolto sui dispositivi restano parte della QA sul campo.
