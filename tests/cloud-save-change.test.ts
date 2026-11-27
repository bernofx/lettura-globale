import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudSaveChange, rebaseCloudSaveChange, replayEditsAfterSave } from "../app/domain/cloud-save-change.ts";
import { parsePendingCloudSave, serializePendingCloudSave } from "../app/domain/pending-cloud-save.ts";
import { applyStateChange, parseStateChangeRequest } from "../app/domain/state-changes.ts";
import type { BackendState } from "../app/shared/types";

const sequence = { id: "s", title: "Demo", therapistId: "adult", exerciseIds: ["model", "model"] };
const baseline: BackendState = { schemaVersion: 1, activeChildId: "child", exercises: [], sequences: [sequence],
  library: [], therapists: [], children: [], attempts: [], helps: [], sessionHistory: [] };
const first = "2026-11-27T09:00:00Z", second = "2026-11-27T11:00:00Z";
const launched = { ...baseline, sequences: [{ ...sequence, lastUsedAt: first }] };
const edited = { ...sequence, title: "Programma aggiornato", exerciseIds: ["model", "copia", "altro"] };
const latest = { ...baseline, sequences: [{ ...sequence, id: "seconda" }, edited] };
const operation = "synthetic-operation";

test("l'avvio offline conserva la data e lascia al cloud titolo, ordine, copie e aggiunte concorrenti", () => {
  const change = buildCloudSaveChange(baseline, launched, operation, 2)!;
  const pending = parsePendingCloudSave(serializePendingCloudSave(change))!;
  const result = rebaseCloudSaveChange(latest, pending.change, operation, 4);
  assert.deepEqual(result.state.sequences, [latest.sequences[0], { ...edited, lastUsedAt: first }]);
  assert.deepEqual(applyStateChange(latest, result.change), result.state);
  assert.deepEqual(applyStateChange(baseline, parseStateChangeRequest(change)), launched);
  assert.ok(!("sequenceEdits" in parseStateChangeRequest(change)));
});

test("un avvio non recupera una sequenza rimossa, archiviata o fuori vista e conserva gli altri dati in coda", () => {
  const change = buildCloudSaveChange(baseline, { ...launched, activeSequenceId: sequence.id, tracingOrderRequired: true }, operation, 2)!;
  for (const sequences of [[], [{ ...edited, deleted: true }]]) {
    const current = { ...baseline, sequences };
    const result = rebaseCloudSaveChange(current, change, operation, 5);
    assert.deepEqual(result.state, { ...current, tracingOrderRequired: true });
    assert.equal(result.change?.collections.sequences, undefined);
    assert.equal(change.values.activeSequenceId, sequence.id, "la bozza in coda resta immutata");
  }
});

test("la data più recente prevale in entrambi gli ordini di arrivo e un avvio già recepito non scrive", () => {
  const newer = { ...baseline, sequences: [{ ...sequence, lastUsedAt: second }] };
  const use = buildCloudSaveChange(baseline, launched, operation, 2)!;
  assert.equal(rebaseCloudSaveChange(newer, use, operation, 3).change, null);
  const edit = buildCloudSaveChange(baseline, { ...baseline, sequences: [edited] }, operation, 2)!;
  assert.deepEqual(rebaseCloudSaveChange(newer, edit, operation, 3).state.sequences, [{ ...edited, lastUsedAt: second }]);
});

test("una coda precedente conserva le modifiche esplicite e un riordino intenzionale resta applicabile", () => {
  const other = latest.sequences[0];
  const base = { ...baseline, sequences: [sequence, other] };
  const reordered = { ...launched, sequences: [other, launched.sequences[0]] };
  const change = buildCloudSaveChange(base, reordered, operation, 2)!;
  const current = { ...baseline, sequences: [edited, other] };
  assert.deepEqual(rebaseCloudSaveChange(current, change, operation, 3).state.sequences, [other, { ...edited, lastUsedAt: first }]);
  const old = parseStateChangeRequest(buildCloudSaveChange(base, { ...base, sequences: [edited, other] }, operation, 2)!);
  assert.deepEqual(rebaseCloudSaveChange(base, old, operation, 3).state.sequences, [edited, other]);
});

test("un secondo salvataggio preparato durante il primo conserva il programma riconciliato e le modifiche successive", () => {
  const confirmed = { ...latest, sequences: [latest.sequences[0], { ...edited, lastUsedAt: first }] };
  const local = { ...launched, tracingOrderRequired: true };
  assert.deepEqual(replayEditsAfterSave(launched, local, confirmed, 4), { ...confirmed, tracingOrderRequired: true });
  assert.equal(replayEditsAfterSave(launched, launched, confirmed, 4), confirmed);
});

test("una rinomina accodata durante il salvataggio conserva i passi modificati nel frattempo", () => {
  const local = { ...launched, sequences: [{ ...launched.sequences[0], title: "Nuovo titolo" }] };
  const confirmed = { ...latest, sequences: [latest.sequences[0], { ...edited, lastUsedAt: first }] };
  assert.deepEqual(replayEditsAfterSave(launched, local, confirmed, 4).sequences,
    [confirmed.sequences[0], { ...confirmed.sequences[1], title: "Nuovo titolo" }]);
});
