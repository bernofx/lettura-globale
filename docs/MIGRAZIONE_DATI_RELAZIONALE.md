# Runbook della migrazione relazionale

## Prima della pubblicazione

1. Esportare il D1 dell'ambiente interessato e conservarlo secondo la policy approvata.
2. Eseguire soltanto query aggregate, senza copiare payload o dati personali nei log:

```sql
SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;
SELECT COUNT(*) AS accounts, MAX(length(payload)) AS max_payload_bytes FROM user_states;
SELECT COUNT(*) AS invalid_payloads FROM user_states WHERE json_valid(payload) = 0;
```

3. Applicare `0004_relational_data.sql` prima di servire la nuova applicazione.
4. Verificare che le quattro tabelle precedenti e le nuove tabelle coesistano.

## Modalità shadow

`GET /api/state` confronta la revisione dello snapshot con `data_migrations`. Se la proiezione manca o è precedente, rigenera le righe dell'account. `PUT /api/state` salva prima lo snapshot compatibile e poi aggiorna la proiezione. Un errore della proiezione lascia quindi disponibile la fonte precedente e restituisce `relationalStatus: pending`.

La proiezione di un account usa un batch D1: cancellazione delle sole righe shadow di quell'account, reinserimento ordinato e marcatura `verified`. Non vengono letti o spostati i file R2.

## Verifica dopo la pubblicazione

```sql
SELECT status, COUNT(*) FROM data_migrations GROUP BY status;

SELECT COUNT(*) AS snapshots_without_current_projection
FROM user_states u
LEFT JOIN data_migrations m
  ON m.account_id = u.user_id
 AND m.migration_key = 'snapshot-to-relational-v1'
 AND m.status = 'verified'
 AND m.source_revision = u.revision
WHERE m.account_id IS NULL;

PRAGMA foreign_key_check;
```

Per ogni account verificare solo i conteggi contenuti in `data_migrations.details`. Le anomalie sono codici tecnici e identificatori, mai nomi o contenuti clinici.

## Rollback

Ripubblicare la versione precedente dell'applicazione. `user_states`, `therapist_credentials`, `auth_sessions` e `shared_launches` restano compatibili. Non eliminare le nuove tabelle durante il rollback: sono isolate per account e possono essere rigenerate dallo snapshot.

## Passaggio al relazionale

Il cambio delle letture è una release separata. Prima del cambio devono risultare zero snapshot senza proiezione corrente, zero violazioni di chiave esterna e parità di storico e statistiche sul dataset di prova.
