# ADR 0026 — Coda per le immagini del catalogo condiviso

## Contesto

La prova di Clessidra ha verificato un ciclo Codex Cloud programmato, dalla
generazione ImageGen fino alla PR. Serve una lista persistente gestibile in
Libreria e un modo per riferire gli esiti all’app.

## Decisione proposta

La sezione è accessibile agli amministratori dell’account. La UI salva le
richieste in D1 e mostra stato, eventuale PR ed esito. I termini inseriti
sono destinati al catalogo condiviso e devono poter essere pubblicati.
La migrazione additiva `0017` introduce due tabelle dedicate e lascia
intatti i dati degli esercizi.

L’amministratore può creare o sostituire una chiave opaca limitata alla
coda del proprio account. D1 conserva soltanto il suo hash. La chiave
è mostrata una sola volta, per configurarla come segreto di rete di Codex
Cloud. L’API del task non consente accesso a profili, dati clinici,
immagini private o altre funzioni dell’app.

La presa in carico è atomica, con al massimo tre parole per lotto e
un’ora di validità rinnovata quando si registra la PR. Un ID di lotto stabile
permette di riprendere un branch già inviato anche se il task si è
fermato prima di registrare la PR. Le parole sono deduplicate per account.
Una foto già esistente nella Libreria o nel catalogo demo evita la generazione.

La generazione, il commit e la PR restano nell’ambiente Codex Cloud validato
con la prova. Il Worker gestisce la coda e il task attende la CI e verifica
il deploy dopo l’integrazione su `main`. Gli stati finali rimangono
nell’account per tracciare gli esiti.

La funzionalità e la migrazione sono da approvare e attivare separatamente in
produzione. La frequenza resta una proprietà del task Codex. [Configurazione e prompt](../PROMPT_GENERAZIONE_PROGRAMMATA.md)
