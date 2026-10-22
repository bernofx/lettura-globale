import assert from "node:assert/strict";
import test from "node:test";
import { SessionAdvanceGuard } from "../app/domain/session-advance.ts";

test("blocca due completamenti dello stesso turno senza saltare una risposta", () => {
  const guard = new SessionAdvanceGuard();
  assert.equal(guard.claim("demo", 0), true);
  assert.equal(guard.claim("demo", 0), false);
  assert.equal(guard.claim("demo", 1), true);
  assert.equal(guard.claim("demo", 1), false);
});

test("passo successivo funziona dopo indietro anche sul turno appena completato", () => {
  const guard = new SessionAdvanceGuard();
  assert.equal(guard.claim("demo", 0), true); // PC: 0 -> 1
  guard.navigated(); // Telefono: indietro, 1 -> 0
  assert.equal(guard.claim("demo", 0), true); // Telefono: avanti, 0 -> 1
  assert.equal(guard.claim("demo", 0), false); // callback duplicata ancora protetta
  guard.navigated();
  assert.equal(guard.claim("demo", 0), true); // un'altra visita è lecita
});

test("cambio attività e nuova sessione non ereditano il blocco precedente", () => {
  const guard = new SessionAdvanceGuard();
  assert.equal(guard.claim("demo", 3), true);
  guard.navigated(); // tipo precedente/successivo
  assert.equal(guard.claim("demo", 3), true);
  assert.equal(guard.claim("nuova-sessione", 3), true);
  assert.equal(guard.claim("nuova-sessione", 3), false);
});
