# Runbook della migrazione relazionale

## Nuove tipologie e compatibilità con i vincoli D1

Prima di salvare una nuova tipologia di esercizio, verificare **tutte** le tabelle che persistono `kind`, anche quelle dello storico. Una migrazione che aggiunge colonne o amplia `exercises.kind` non modifica automaticamente il `CHECK` di `session_items.kind` nelle installazioni esistenti. In SQLite un `CHECK` storico resta attivo finché la tabella non viene ricreata con una migrazione forward-only.

L'incidente di `Numero quantità` lo ha mostrato: la proiezione relazionale provava a inserire `number-quantity` in `session_items.kind`, che nello schema distribuito accettava soltanto `recognition`, `articles`, `word-categories` e `naming`. Il batch atomico di `PATCH /api/state/changes` falliva con `SQLITE_CONSTRAINT` e il client registrava `state_change_failed_batch` (HTTP 500), anche se `changedSequences` era zero: quel contatore non identifica la tabella che ha causato l'errore.

La compatibilità attuale proietta lo storico quantità con `kind = 'recognition'` e ricostruisce il tipo applicativo dalle risposte `quantity:<target>:<selected>:<method>`. Prima di introdurre un'altra tipologia, scegliere e documentare esplicitamente una delle due strade:

1. migrazione numerata e forward-only che aggiorni ogni `CHECK` interessato, verificata su un database creato dalle migrazioni precedenti;
2. codifica compatibile con i valori storici, con ricostruzione deterministica e test di round-trip.

In entrambi i casi testare una sessione completa e il relativo salvataggio contro lo **schema già distribuito**, non soltanto contro un database nuovo. Dopo la pubblicazione controllare un salvataggio reale, la revisione cloud e `/api/state/relational-status`. Se ricompare `state_change_failed_batch`, cercare nel log server il `diagnosticId`, la fase e il codice SQLite; non ripetere alla cieca il salvataggio né concludere dai soli contatori del journal quale entità sia difettosa. La copia locale va preservata finché il cloud non conferma il salvataggio.

## Prima della pubblicazione

1. Esportare il D1 dell'ambiente interessato e conservarlo secondo la policy approvata.
2. Eseguire soltanto query aggregate, senza copiare payload o dati personali nei log:

```sql
SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;
SELECT COUNT(*) AS accounts, MAX(length(payload)) AS max_payload_bytes FROM user_states;
SELECT COUNT(*) AS invalid_payloads FROM user_states WHERE json_valid(payload) = 0;
```

3. Applicare in ordine le migrazioni da `0004_relational_data.sql` a `0008_account_scoped_adult_email.sql` prima di servire la nuova applicazione. La `0008` rende l'email del profilo adulto univoca per account, non globalmente; il login globale continua a usare `therapist_credentials`.
4. Verificare che le quattro tabelle precedenti e le nuove tabelle coesistano.

## Modalità shadow

`GET /api/state` confronta revisione, checksum e identità delle righe di **tutte** le tabelle shadow con lo snapshot. Un record `data_migrations` marcato `verified` non basta: versioni precedenti potevano avanzarlo dopo una scrittura parziale. Se mancano righe, il GET tenta un reintegro non distruttivo in batch di massimo 100 istruzioni. Il registro viene aggiornato solo dopo la verifica delle identità e della revisione sorgente. Le righe estranee non vengono cancellate automaticamente: in quel caso la proiezione resta `pending` e richiede analisi manuale.

`PUT /api/state` salva prima lo snapshot compatibile e poi aggiorna la proiezione. Un errore della proiezione lascia quindi disponibile la fonte precedente e restituisce `relationalStatus: pending`.

La proiezione completa del `PUT` usa un batch D1 atomico: cancellazione delle sole righe shadow di quell'account, reinserimento ordinato e marcatura `verified`. Il reintegro del `GET` aggiunge o aggiorna invece le righe attese, senza cancellazioni. Non vengono letti o spostati i file R2.

## Verifica dopo la pubblicazione

Con una sessione autenticata, `GET /api/state/relational-status` deve restituire `status: "ready"`, revisioni uguali e `mismatches: []`. La risposta contiene soltanto conteggi e diagnostica tecnica.

```sql
SELECT status, COUNT(*) FROM data_migrations GROUP BY status;

SELECT COUNT(*) AS snapshots_without_current_projection
FROM user_states u
LEFT JOIN data_migrations m
  ON m.account_id = u.user_id
 AND m.migration_key = 'snapshot-to-relational-v3'
 AND m.status = 'verified'
 AND m.source_revision = u.revision
WHERE m.account_id IS NULL;

PRAGMA foreign_key_check;
```

Per ogni account verificare solo i conteggi contenuti in `data_migrations.details`. Le anomalie sono codici tecnici e identificatori, mai nomi o contenuti clinici.

## Rollback

Ripubblicare la versione precedente dell'applicazione. `user_states`, `therapist_credentials`, `auth_sessions` e `shared_launches` restano compatibili. Non eliminare le nuove tabelle durante il rollback: sono isolate per account e possono essere rigenerate dallo snapshot.

## Passaggio al relazionale

`GET /api/state` usa la ricostruzione relazionale soltanto quando revisione e checksum dello snapshot coincidono, gli identificativi di tutte le entità coincidono e non esistono anomalie bloccanti. La risposta indica `dataSource: "relational"`. In caso di errore o differenza restituisce immediatamente lo snapshot con `dataSource: "snapshot"`.

Prima di ritirare lo snapshot devono comunque risultare zero proiezioni incomplete, zero violazioni di chiave esterna e parità di storico e statistiche sul dataset di prova.

## Scritture incrementali

Il client usa `PATCH /api/state/changes` e invia le sole entità modificate con `baseRevision` e `operationId`. L'endpoint aggiorna direttamente le tabelle coinvolte nello stesso batch che registra l'operazione e il mirror JSON. Per esempio, una modifica della libreria non riscrive sessioni, tentativi o aiuti.

Prima della scrittura relazionale, `PATCH` verifica che lo shadow corrisponda allo snapshot su tutte le identità delle righe. Se è incompleto, salva comunque in modo atomico snapshot, revisione e idempotenza, risponde con `relationalStatus: "pending"` e `writeMode: "snapshot"`, e lascia al successivo `GET` il reintegro. Questo evita errori di chiave esterna, ad esempio quando si salva una sequenza e gli esercizi parent non sono ancora nello shadow.

Verificare dopo la pubblicazione che `/api/state/relational-status` restituisca anche `writeMode: "direct"` dopo una modifica e che le operazioni vengano registrate senza contenuti applicativi:

```sql
SELECT COUNT(*) AS operations, COUNT(DISTINCT account_id) AS accounts
FROM state_operations;
```

Una risposta `409 revision_conflict` indica una modifica concorrente e non deve essere risolta ripetendo un salvataggio completo. La UI segnala lo stato cloud in errore e conserva la copia locale. Il `PUT /api/state` resta disponibile per la prima migrazione del browser e come fallback compatibile quando l'endpoint incrementale non esiste nella versione pubblicata.
