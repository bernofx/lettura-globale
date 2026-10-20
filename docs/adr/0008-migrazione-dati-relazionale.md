# ADR 0008: migrazione progressiva dallo snapshot alle tabelle relazionali

## Stato

Accettato. Proiezione shadow, ricostruzione e diagnostica implementate. Il cambio delle letture è automatico soltanto quando revisione, checksum dello snapshot, identità delle entità e anomalie bloccanti risultano allineati; in ogni altro caso resta attivo lo snapshot.

## Contesto

Lo stato applicativo è conservato in una singola riga `user_states` per account. Il campo `payload` contiene profili, bambini, libreria, esercizi, sequenze, tentativi, aiuti, storico e aspetto. Ogni modifica riscrive l'intero documento e modifiche concorrenti possono sovrascriversi. Il database non può inoltre applicare vincoli alle relazioni interne al JSON.

## Decisione

- Introdurre tabelle relazionali separate per identità, libreria, configurazione e risultati.
- Usare chiavi composte `account_id + id`, perché gli identificativi dimostrativi non sono globalmente univoci.
- Conservare file e immagini in R2; D1 contiene riferimenti e metadati.
- Trattare tentativi e aiuti come eventi append-only e ricostruire lo storico dalle sessioni.
- Conservare nelle sessioni una fotografia relazionale dei contenuti mostrati.
- Mantenere temporaneamente `user_states.payload` come fonte autorevole e rollback.
- Proiettare lo snapshot nelle nuove tabelle al primo accesso e a ogni nuova revisione.
- Registrare revisione, checksum, conteggi e anomalie in `data_migrations`.
- Non modificare `shared_launches.payload` nella prima fase: i link pubblici esistenti sono snapshot immutabili e devono continuare a funzionare.

## Fasi

1. Tabelle additive e proiezione shadow, senza cambio delle letture.
2. Confronto sul D1 pubblicato di revisioni, conteggi, riferimenti e statistiche.
3. Lettura relazionale condizionata dalla verifica di parità, con fallback allo snapshot.
4. API granulari con versionamento ottimistico e operazioni idempotenti.
5. Arresto delle scritture dello snapshot dopo backup e prova di ripristino.

## Compatibilità e rollback

La migrazione non cancella né modifica lo snapshot. Una versione precedente dell'app può quindi essere ripubblicata senza downgrade del database. Le nuove tabelle sono additive. Il ritiro di `user_states` richiederà un ADR separato su retention e backup.

I profili adulto o bambino già rimossi ma ancora referenziati dallo storico diventano record tombstone privi dei dati originari. Questo conserva le relazioni senza reintrodurre dati personali cancellati.

## Condizioni per il cambio delle letture

- tutte le righe `user_states` hanno una migrazione `verified` alla stessa revisione;
- nessuna violazione di chiave esterna;
- conteggi e checksum attesi verificati;
- statistiche e storico equivalenti su un dataset noto;
- login, link pubblici e immagini R2 verificati;
- backup e rollback provati in staging.

La diagnostica autenticata `/api/state/relational-status` espone soltanto stato, revisioni, conteggi, aree non allineate e numero di anomalie. Non restituisce contenuti, nomi o altri dati personali.

Le posizioni delle raccolte vengono persistite esplicitamente: SQLite non garantisce l'ordine delle righe in assenza di un ordinamento. I campi opzionali che modificano i default applicativi, come `autoPronounce`, conservano anche l'informazione che la scelta sia stata configurata.
