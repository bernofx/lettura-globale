# ADR 0009: journal tecnico dei salvataggi

## Contesto

Il salvataggio di una sequenza può apparire riuscito nel browser mentre il `PATCH /api/state/changes` fallisce. La diagnostica precedente mostrava solo uno stato cloud generico, insufficiente per distinguere un problema di migrazione D1 da un timeout o un conflitto.

## Decisione

- Il browser conserva sul dispositivo un journal circolare delle ultime 60 operazioni tecniche. Registra timestamp, evento, identificatore casuale dell'operazione, revisione, stato HTTP, codice di errore e conteggi di sequenze; esclude titoli, parole, immagini, dati dei bambini e identità degli adulti.
- Il puntino cloud nell'header apre il journal e permette di copiarlo volontariamente per l'assistenza. Il journal non viene inviato automaticamente al server.
- L'API incrementale verifica la presenza di `state_operations` e restituisce `state_operations_migration_missing` con HTTP 503 quando manca la migrazione `0007`.
- Gli errori imprevisti dell'API riportano una fase tecnica e un identificatore diagnostico casuale. Il log del Worker contiene solo questi due campi, senza payload né messaggi del database.
- Il journal diagnostico non è la fonte dei dati: il delta pendente rimane nel meccanismo di recupero locale separato.

## Verifica operativa

Dopo aver creato o modificato una sequenza, il journal deve mostrare `sequence_changed`, poi `save_started` e `save_succeeded` con revisione crescente. `save_failed` mostra codice e stato HTTP. Se appare `state_operations_migration_missing`, verificare e applicare la migrazione D1 `0007` nell'ambiente interessato prima di ritentare. Se compare `state_change_failed_batch`, cercare l'identificatore diagnostico nei log del Worker.

Il limite di 60 record evita che la diagnostica cresca senza controllo. Si cancella eliminando i dati del sito nel browser; una politica generale di conservazione dei dati applicativi resta da definire prima del pilot.
