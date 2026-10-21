import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionHistoryItems, historyItemUsesArtwork } from "../app/domain/session-history.ts";

test("preserva immagine, opzioni, errori e aiuti della sessione", () => {
  const result = buildSessionHistoryItems("session-1", [{ id: "exercise-1", title: "Trova Mela", kind: "recognition", presentation: "words", promptId: "mela", optionIds: ["mela", "pera"] }], [
    { id: "a1", sessionId: "session-1", sessionItemId: "turn-1", exerciseId: "exercise-1", wordId: "mela", answerId: "pera", correct: false, firstAttempt: true, mode: "test", createdAt: "2026-10-17T10:00:00Z" },
    { id: "a2", sessionId: "session-1", sessionItemId: "turn-1", exerciseId: "exercise-1", wordId: "mela", answerId: "mela", correct: true, firstAttempt: false, mode: "test", createdAt: "2026-10-17T10:00:03Z" },
  ], [{ id: "h1", sessionId: "session-1", sessionItemId: "turn-1", exerciseId: "exercise-1", wordId: "mela", label: "Indicazione gestuale", createdAt: "2026-10-17T10:00:01Z" }], [
    { itemId: "mela", word: "Mela", category: "Cibi", remoteImageId: "media-old" },
    { itemId: "pera", word: "Pera", category: "Cibi", emoji: "🍐" },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].firstCorrect, false);
  assert.equal(result[0].presentation, "words");
  assert.equal(result[0].target?.word, "Mela");
  assert.equal(result[0].target?.remoteImageId, "media-old");
  assert.deepEqual(result[0].helpLabels, ["Indicazione gestuale"]);
  assert.deepEqual(result[0].responses.map((response) => [response.label, response.correct]), [["Pera", false], ["Mela", true]]);
  assert.deepEqual(result[0].options.map((option) => option.word), ["Mela", "Pera"]);
});

test("mostra immagini nel riepilogo soltanto per le attività che le prevedevano", () => {
  assert.equal(historyItemUsesArtwork({ kind: "recognition", presentation: "images" }), true);
  assert.equal(historyItemUsesArtwork({ kind: "recognition", presentation: "words" }), false);
  assert.equal(historyItemUsesArtwork({ kind: "word-categories" }), false);
  assert.equal(historyItemUsesArtwork({ kind: "articles" }), true);
  assert.equal(historyItemUsesArtwork({ kind: "naming" }), true);
  assert.equal(historyItemUsesArtwork({ kind: "number-quantity" }), false);
  assert.equal(historyItemUsesArtwork({ kind: "sentence-matching" }), true);
});

test("rende leggibile il risultato numerico nello storico", () => {
  const result = buildSessionHistoryItems("session-q", [{ id: "quantity", title: "Numero quantità", kind: "number-quantity", optionIds: [] }], [
    { id: "q1", sessionId: "session-q", sessionItemId: "turn-q", exerciseId: "quantity", answerId: "quantity:5:4:adult", correct: false, firstAttempt: true, mode: "test", createdAt: "2026-10-20T10:00:00Z" },
  ], [], []);
  assert.equal(result[0].responses[0].label, "Richiesti 5 · selezionati 4 · conferma adulta");
});
