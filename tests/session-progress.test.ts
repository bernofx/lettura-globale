import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionProgressLabel, sessionProgressSteps } from "../app/domain/session-progress.ts";

const turns = (source: string, title: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: `${source}:round:${index}`, sourceExerciseId: source, title }));
const plan = [...turns("a", "Trova la parola", 3), { id: "b", title: "IL / LA" }, ...turns("c", "Nomina", 2)];

test("un pallino per esercizio con i turni completati di quello corrente", () => {
  const steps = sessionProgressSteps(plan, 4, [0, 1, 2, 3]);
  assert.deepEqual(steps.map(({ title, turns, completedTurns, status }) => ({ title, turns, completedTurns, status })), [
    { title: "Trova la parola", turns: 3, completedTurns: 3, status: "done" },
    { title: "IL / LA", turns: 1, completedTurns: 1, status: "done" },
    { title: "Nomina", turns: 2, completedTurns: 0, status: "current" },
  ]);
  assert.equal(sessionProgressLabel(steps), "Esercizio 3 di 3, Nomina: turno 1 di 2");
});

test("il bordo si compone turno dopo turno e l’esercizio singolo ha un solo pallino", () => {
  const steps = sessionProgressSteps(turns("a", "Trova la parola", 4), 2, [0, 1]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].completedTurns, 2);
  assert.equal(steps[0].status, "current");
  assert.equal(sessionProgressLabel(steps), "Trova la parola: turno 3 di 4");
});

test("lo stesso esercizio ripetuto non consecutivo resta un passo distinto", () => {
  const steps = sessionProgressSteps([...turns("a", "A", 1), ...turns("b", "B", 1), ...turns("a", "A", 1)], 0, []);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((step) => step.status), ["current", "upcoming", "upcoming"]);
});

test("avanti e indietro non trasformano i turni saltati in esercizi completati", () => {
  const skipped = sessionProgressSteps(plan, 4, [0, 3]);
  assert.deepEqual(skipped.map((step) => step.status), ["upcoming", "done", "current"]);
  assert.equal(skipped[0].completedTurns, 1);
  const revisited = sessionProgressSteps(plan, 1, [0, 3, 4, 5]);
  assert.deepEqual(revisited.map((step) => step.status), ["current", "done", "done"]);
  assert.equal(revisited[0].currentTurn, 2);
});

test("gli identificativi con cancelletto mantengono i turni nello stesso esercizio", () => {
  assert.equal(sessionProgressSteps(turns("a#b", "A", 4), 2, [0, 1]).length, 1);
});
