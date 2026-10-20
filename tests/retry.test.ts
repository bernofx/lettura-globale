import assert from "node:assert/strict";
import test from "node:test";
import { retryOperation } from "../app/domain/retry.ts";

test("ritenta un bootstrap transitorio e restituisce il risultato", async () => {
  let calls = 0;
  const result = await retryOperation(async () => {
    calls += 1;
    if (calls < 3) throw new Error("temporaneo");
    return "ok";
  }, { attempts: 3, delayMs: 1, wait: async () => undefined });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("interrompe i retry per un errore definitivo", async () => {
  let calls = 0;
  await assert.rejects(() => retryOperation(async () => {
    calls += 1;
    throw new Error("definitivo");
  }, { attempts: 3, delayMs: 1, shouldRetry: () => false, wait: async () => undefined }));
  assert.equal(calls, 1);
});
