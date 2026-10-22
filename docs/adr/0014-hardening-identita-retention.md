# ADR 0014 — Hardening di identità, PIN e contenuti condivisi

**Stato:** proposto

## Contesto

La review ha rilevato che i PIN brevi usano SHA-256 senza fattore di costo, il login non ha un limite persistente e i link pubblici non hanno scadenza o revoca. La scelta dei parametri modifica autenticazione, privacy e retention e non deve essere implicita.

## Proposta

- hash PIN server-side in formato versionato, con algoritmo lento supportato dal runtime e pepper conservato come secret;
- migrazione opportunistica al login e rimozione del confronto con PIN storico in chiaro;
- limite per account/email e indirizzo di rete, con ritardo progressivo e finestra persistente;
- link pubblici revocabili, con scadenza predefinita configurabile e pulizia periodica;
- interfaccia che mostri scadenza e permetta di revocare prima del termine.

## Decisioni aperte

- durata predefinita dei link;
- soglie e finestra del rate limit;
- procedura di recupero quando un adulto dimentica il PIN;
- algoritmo e parametri compatibili con Cloudflare Workers.

Non vengono introdotti valori di produzione finché queste decisioni non sono approvate.
