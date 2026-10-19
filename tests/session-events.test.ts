import assert from "node:assert/strict";
import test from "node:test";
import { appendAttempt, appendHelp, shouldRecordSessionEvents, type AttemptEvent, type HelpEventRecord } from "../app/domain/session-events.ts";

const baseAttempt = {
  sessionId: "session-1",
  sessionItemId: "session-1:exercise-1:0",
  exerciseId: "exercise-1",
  mode: "test" as const,
  childId: "child-1",
  therapistId: "therapist-1",
};

test("registra un solo primo tentativo per item di sessione", () => {
  const first = appendAttempt([], { ...baseAttempt, id: "a1", answerId: "wrong", correct: false, createdAt: "2026-10-16T10:00:00.000Z" });
  const correction = appendAttempt(first.events, { ...baseAttempt, id: "a2", answerId: "right", correct: true, createdAt: "2026-10-16T10:00:01.000Z" });

  assert.equal(first.added?.firstAttempt, true);
  assert.equal(correction.added?.firstAttempt, false);
  assert.equal(correction.events.filter((event) => event.firstAttempt).length, 1);
});

test("ignora un doppio tap sulla stessa risposta", () => {
  const first = appendAttempt([], { ...baseAttempt, id: "a1", answerId: "wrong", correct: false, createdAt: "2026-10-16T10:00:00.000Z" });
  const duplicate = appendAttempt(first.events, { ...baseAttempt, id: "a2", answerId: "wrong", correct: false, createdAt: "2026-10-16T10:00:00.050Z" });

  assert.equal(duplicate.added, null);
  assert.equal(duplicate.events.length, 1);
});

test("un nuovo item riceve un nuovo primo tentativo", () => {
  const existing: AttemptEvent[] = [{ ...baseAttempt, id: "a1", answerId: "wrong", correct: false, firstAttempt: true, createdAt: "2026-10-16T10:00:00.000Z" }];
  const next = appendAttempt(existing, { ...baseAttempt, sessionItemId: "session-1:exercise-2:1", exerciseId: "exercise-2", id: "a2", answerId: "right", correct: true, createdAt: "2026-10-16T10:00:02.000Z" });

  assert.equal(next.added?.firstAttempt, true);
  assert.equal(next.events.filter((event) => event.firstAttempt).length, 2);
});

test("registra gli aiuti senza modificare la collezione precedente", () => {
  const original: HelpEventRecord[] = [];
  const event: HelpEventRecord = { id: "h1", sessionId: "session-1", sessionItemId: "session-1:exercise-1:0", exerciseId: "exercise-1", wordId: "schiena", mode: "teaching", label: "Gesto", createdAt: "2026-10-16T10:00:03.000Z", childId: "child-1", therapistId: "therapist-1" };
  const result = appendHelp(original, event);

  assert.equal(original.length, 0);
  assert.deepEqual(result, [event]);
  assert.equal(result[0].wordId, "schiena");
  assert.equal(result[0].mode, "teaching");
});

test("non registra eventi durante anteprime condivise o prove", () => {
  assert.equal(shouldRecordSessionEvents(true), false);
  assert.equal(shouldRecordSessionEvents(false), true);
});
