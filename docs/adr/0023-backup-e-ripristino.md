# ADR 0023 — Backup e prova di ripristino di D1 e R2

## Stato

Proposto, in attesa di approvazione. Le scelte su retention, luogo di conservazione e accesso ai backup sono decisioni di privacy e restano al titolare del progetto.

## Contesto

D1 conserva profili, esercizi, storico e tentativi; R2 conserva le immagini e le storie CAA. ADR 0008 subordina il ritiro del mirror JSON a una prova di backup e ripristino, ADR 0011 richiede un backup prima di ogni migrazione D1 e `PROGRESS.md` elenca backup/restore fra i requisiti del pilot. Oggi l'unica protezione è il Time Travel di D1 (ripristino a un punto nel tempo entro la finestra del piano), che non copre R2 e non è mai stato provato.

## Proposta

1. **D1, ripristino puntuale.** Prima di ogni migrazione si annota il bookmark con `wrangler d1 time-travel info`, così il ripristino del database intero a quel punto è immediato.
2. **D1, esportazione periodica.** Una volta a settimana e prima di ogni migrazione si esegue `wrangler d1 export` (schema e dati) verso un bucket R2 dedicato ai backup, separato da quello applicativo e senza accesso pubblico. È necessaria un'approvazione esplicita prima di usare dati reali.
3. **R2.** Gli oggetti applicativi non vengono mai cancellati fisicamente (cancellazione logica, ADR 0003/0021). Si attiva una copia periodica verso il bucket di backup, oppure si accetta come rischio residuo la sola durabilità di R2.
4. **Prova di ripristino.** Ogni trimestre, e prima del pilot, si ripristina l'ultimo export in un D1 dello staging (ADR 0022) e si verifica `/api/state/relational-status` = `ready`, che storico e statistiche siano equivalenti e che le immagini si aprano. L'esito va riportato in `PROGRESS.md`.
5. **Retention dei backup.** Proposta: 8 settimanali e 3 mensili, poi cancellazione. Da allineare alla policy di retention dei dati dei minori prima del pilot.
6. **Accesso.** Solo l'amministratore tecnico. Token Cloudflare con permessi minimi, conservati nei segreti dell'ambiente e mai nei file.

## Punti da decidere

- Frequenza, retention e luogo dei backup (stesso account Cloudflare o esterno).
- Se automatizzare l'export con un Worker programmato (Cron Trigger) o eseguirlo a mano con uno script.
- Cifratura aggiuntiva degli export, che diventa necessaria con dati reali di minori.

## Conseguenze

Il ritiro del mirror JSON (ADR 0008) e il pilot con dati reali restano bloccati finché il punto 4 non viene superato almeno una volta.
