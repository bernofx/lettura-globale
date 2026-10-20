import assert from "node:assert/strict";
import test from "node:test";
import { createPersistentTherapistSession, parsePersistentTherapistSession, THERAPIST_SESSION_DURATION_MS } from "../app/domain/therapist-session.ts";

test("la sessione del terapista resta valida tra le riaperture", () => {
  const now = Date.UTC(2026, 9, 20);
  const saved = createPersistentTherapistSession("therapist-1", now);
  assert.equal(parsePersistentTherapistSession(saved, now + THERAPIST_SESSION_DURATION_MS - 1), "therapist-1");
});

test("la sessione scaduta o non valida viene ignorata", () => {
  const now = Date.UTC(2026, 9, 20);
  const saved = createPersistentTherapistSession("therapist-1", now);
  assert.equal(parsePersistentTherapistSession(saved, now + THERAPIST_SESSION_DURATION_MS), null);
  assert.equal(parsePersistentTherapistSession("therapist-1", now), null);
  assert.equal(parsePersistentTherapistSession("{}", now), null);
});
