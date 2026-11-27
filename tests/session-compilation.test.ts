import assert from "node:assert/strict";
import test from "node:test";
import { compileSessionPlan, completesSequenceExercise, type SessionExercise } from "../app/domain/session-compilation.ts";
import { activityNavigation } from "../app/domain/session-navigation.ts";
import { parseRecoverableSession, serializeRecoverableSession } from "../app/domain/session-recovery.ts";

const library = [
  { id: "mela", word: "Mela", category: "Cibi", image: "/mela.png", article: "LA" as const },
  { id: "pane", word: "Pane", category: "Cibi", image: "/pane.png", article: "IL" as const },
  { id: "gatto", word: "Gatto", category: "Animali", emoji: "🐈", article: "IL" as const },
  { id: "cane", word: "Cane", category: "Animali", emoji: "🐕", article: "IL" as const },
  { id: "lupo", word: "Lupo", category: "Animali" },
];

const base = { promptId: "", optionIds: [], rounds: 2, updatedAt: "oggi" };
const exercises: SessionExercise[] = [
  { ...base, id: "recognition", title: "Trova", kind: "recognition", recognitionMode: "random", presentation: "words", distractorCount: 1 },
  { ...base, id: "articles", title: "IL o LA", kind: "articles", articleItemIds: ["mela", "pane"] },
  { ...base, id: "categories", title: "Categoria", kind: "word-categories", categoryNames: ["Cibi", "Animali"] },
  { ...base, id: "naming", title: "Mix", kind: "naming" },
];

test("ogni turno di tutti i tipi diventa uno step navigabile", () => {
  let id = 0;
  const plan = compileSessionPlan(exercises, library, {
    articleFor: (item) => item.article,
    random: () => 0.42,
    createId: () => `id-${id++}`,
  });

  assert.equal(plan.length, 8);
  assert.deepEqual(plan.map((item) => item.sourceExerciseId), [
    "recognition", "recognition", "articles", "articles", "categories", "categories", "naming", "naming",
  ]);
  assert.ok(plan.every((item) => item.rounds === 1));
  assert.ok(plan.filter((item) => item.kind === "articles").every((item) => item.articleItemIds?.length === 1));
  assert.ok(plan.filter((item) => item.kind === "word-categories").every((item) => item.categoryItemIds?.length === 1));
  assert.ok(plan.filter((item) => item.kind === "naming").every((item) => item.namingItemIds?.length === 1));
});

test("la pausa fra esercizi non interrompe i turni dello stesso esercizio", () => {
  const first = { ...exercises[0], id: "first-round", sourceExerciseId: "first" };
  const second = { ...exercises[0], id: "second-round", sourceExerciseId: "first" };
  const next = { ...exercises[1], id: "next-round", sourceExerciseId: "next" };
  assert.equal(completesSequenceExercise(first, second), false);
  assert.equal(completesSequenceExercise(second, next), true);
  assert.equal(completesSequenceExercise(next, undefined), true);
});

test("gli esercizi che richiedono immagini escludono gli elementi solo testuali", () => {
  let id = 0;
  const plan = compileSessionPlan(exercises.slice(1), library, {
    articleFor: (item) => item.article,
    random: () => 0.42,
    createId: () => `id-${id++}`,
  });

  const artworkIds = plan.flatMap((item) => item.articleItemIds ?? item.namingItemIds ?? []);
  assert.equal(artworkIds.includes("lupo"), false);
  assert.equal(plan.find((item) => item.kind === "word-categories")?.categoryItemIds?.length, 1);
});

test("un esercizio trova la parola fisso resta un singolo step", () => {
  const fixed: SessionExercise = { ...base, id: "fixed", title: "Trova mela", kind: "recognition", recognitionMode: "fixed", promptId: "mela", optionIds: ["mela", "pane"] };
  const plan = compileSessionPlan([fixed], library, { articleFor: (item) => item.article });
  assert.deepEqual(plan, [fixed]);
});

test("un bersaglio fisso con distrattori casuali resta uguale in tutti i turni", () => {
  let id = 0;
  const exercise: SessionExercise = { ...base, id: "fixed-target", title: "Trova mela", kind: "recognition", recognitionMode: "random", promptId: "mela", distractorCount: 2 };
  const plan = compileSessionPlan([exercise], library, { articleFor: (item) => item.article, random: () => 0.42, createId: () => `id-${id++}` });
  assert.equal(plan.length, 2);
  assert.ok(plan.every((item) => item.promptId === "mela" && item.optionIds.length === 3));
});

test("compila Numero quantità in turni con bersaglio e oggetto risolti", () => {
  let id = 0;
  const exercise: SessionExercise = { ...base, id: "quantity", title: "Numero quantità", kind: "number-quantity", rounds: 3, quantityMin: 2, quantityMax: 4, quantityObjectSet: "candy" };
  const plan = compileSessionPlan([exercise], library, { articleFor: (item) => item.article, random: () => 0.5, createId: () => `id-${id++}` });
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((item) => item.quantityTarget).sort(), [2, 3, 4]);
  assert.ok(plan.every((item) => item.quantityObject === "candy" && item.rounds === 1));
});

test("compila Numero quantità anche senza elementi di libreria, come nei link condivisi", () => {
  const exercise: SessionExercise = { ...base, id: "quantity-shared", title: "Numero quantità", kind: "number-quantity", rounds: 1, quantityMin: 5, quantityMax: 5, quantityObjectSet: "stone" };
  const plan = compileSessionPlan([exercise], [], { articleFor: () => null, random: () => 0, createId: () => "shared-round" });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].quantityTarget, 5);
  assert.equal(plan[0].quantityObject, "stone");
});

test("Trova la parola con più bersagli precisi compila un turno per bersaglio a rotazione", () => {
  const exercise: SessionExercise = { id: "multi", title: "Trova", kind: "recognition", recognitionMode: "random", promptId: "mela", recognitionTargetIds: ["mela", "gatto"], optionIds: [], distractorCount: 1, rounds: 4, presentation: "words", updatedAt: "2026-11-27" };
  const plan = compileSessionPlan([exercise], library, { articleFor: (item) => item.article, random: () => 0.3, createId: () => "id" });
  assert.equal(plan.length, 4);
  assert.deepEqual([...new Set(plan.map((turn) => turn.promptId))].sort(), ["gatto", "mela"]);
  assert.ok(plan.every((turn) => turn.sourceExerciseId === "multi" && turn.optionIds.length === 2 && turn.optionIds.includes(turn.promptId ?? "")));
});

test("modifiche alla sequenza entrano nel prossimo piano, anche dopo ripresa e navigazione remota", () => {
  const fixed: SessionExercise = { ...base, id: "fixed", title: "Trova mela", promptId: "mela", optionIds: ["mela", "pane"], recognitionMode: "fixed" };
  const configured = [exercises[1], fixed];
  const compile = () => compileSessionPlan(configured, library, { articleFor: item => item.article, random: () => 0.5 });
  const running = compile();
  const expected = structuredClone(running);

  fixed.title = "Trova pane";
  fixed.promptId = "pane";
  fixed.optionIds[0] = "cane";
  configured.splice(0, 1);
  configured.push(exercises[3]);

  assert.deepEqual(running, expected);
  assert.deepEqual(activityNavigation(running, 0), { previous: null, next: 2 });
  const checkpoint = serializeRecoverableSession({
    plan: running, runId: "run", therapistId: "adult", childId: "fixture", startedAt: new Date().toISOString(),
    descriptor: { title: "Sequenza", source: "sequence" }, mode: "teaching", presentation: "images",
    currentIndex: 1, furthestIndex: 1, completedIndices: [0], isTrial: false, returnView: "session",
  });
  const resumed = parseRecoverableSession(checkpoint);
  assert.deepEqual(resumed?.plan, expected);
  assert.equal(resumed?.currentIndex, 1);

  const next = compile();
  assert.deepEqual(next.map(turn => turn.sourceExerciseId ?? turn.id), ["fixed", "naming", "naming"]);
  assert.equal(next[0].title, "Trova pane");
  assert.deepEqual(next[0].optionIds, ["cane", "pane"]);
});
