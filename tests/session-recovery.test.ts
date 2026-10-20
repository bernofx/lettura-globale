import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_SESSION_MAX_AGE_MS, parseRecoverableSession, serializeRecoverableSession } from "../app/domain/session-recovery.ts";

const now = new Date("2026-10-20T10:00:00.000Z");
const session = {
  plan: [{ id: "round-1", title: "Trova", optionIds: ["mela", "pera"], promptId: "mela", updatedAt: "oggi" }],
  runId: "run-1",
  therapistId: "therapist-1",
  childId: "child-1",
  startedAt: "2026-10-20T09:55:00.000Z",
  descriptor: { title: "Prime parole", source: "sequence" as const },
  mode: "test" as const,
  presentation: "images" as const,
  currentIndex: 0,
  furthestIndex: 0,
  isTrial: false,
  returnView: "session" as const,
};

test("salva e ripristina una sessione valida", () => {
  assert.deepEqual(parseRecoverableSession(serializeRecoverableSession(session, now), now.getTime()), {
    ...session,
    schemaVersion: 1,
    savedAt: now.toISOString(),
  });
});

test("rifiuta snapshot scaduti o malformati", () => {
  const raw = serializeRecoverableSession(session, new Date(now.getTime() - ACTIVE_SESSION_MAX_AGE_MS - 1));
  assert.equal(parseRecoverableSession(raw, now.getTime()), null);
  assert.equal(parseRecoverableSession("{", now.getTime()), null);
});

