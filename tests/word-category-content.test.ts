import assert from "node:assert/strict";
import test from "node:test";
import { availableForWordCategories, wordCategoryNames } from "../app/domain/word-category-content.ts";
import { pickCategoryRoundIds } from "../app/domain/activity-generation.ts";
import { filterQuickCandidates } from "../app/domain/session-planning.ts";
import { compileSessionPlan, type SessionExercise } from "../app/domain/session-compilation.ts";
import { validateSharedExercises } from "../app/domain/shared-preview-validation.ts";

const library = [
  { id: "dog", word: "Cane", category: "Animali", image: "/dog.webp" },
  { id: "apple", word: "Mela", category: "Cibi", image: "/apple.webp" },
  { id: "sentence", word: "La mamma mangia", category: "Azioni", contentKind: "sentence" as const, image: "/mom.webp" },
  { id: "custom-scene", word: "Il cane corre", category: "Animali", contentKind: "sentence" as const, image: "/running.webp" },
  { id: "legacy-scene", word: "Il gatto dorme", category: "Azione", image: "/sleep.webp" },
  { id: "structure", word: "Il panda salta", category: "Altro", phraseStructure: "subject-verb" as const, image: "/jump.webp" },
  { id: "symbol", word: "Simbolo", category: "Cibi", categorySymbolOnly: true, image: "/symbol.webp" },
];
const exercise: SessionExercise = { id: "categories", title: "Categorie", kind: "word-categories", promptId: "", optionIds: [], categoryNames: ["Animali", "Cibi", "Azioni", "Altro"], rounds: 10, updatedAt: "today" };

test("categorie e scelta manuale escludono frasi, Azioni e simboli anche con metadati storici", () => {
  assert.deepEqual(availableForWordCategories(library).map((item) => item.id), ["dog", "apple"]);
  assert.deepEqual(wordCategoryNames(library), ["Animali", "Cibi"]);
  assert.deepEqual(pickCategoryRoundIds(library, library.map((item) => item.id), 20).sort(), ["apple", "dog"]);
  const quick = filterQuickCandidates(library, { activity: "word-categories", selection: "items", itemIds: library.map((item) => item.id), categoryNames: exercise.categoryNames! });
  assert.deepEqual(quick.map((item) => item.id), ["dog", "apple"]);
});

test("piani e vecchie anteprime miste usano solo parole e rimuovono le categorie delle frasi", () => {
  const plan = compileSessionPlan([exercise], library, { articleFor: () => null });
  assert.deepEqual(plan.flatMap((turn) => turn.categoryItemIds).sort(), ["apple", "dog"]);
  assert.ok(plan.every((turn) => JSON.stringify(turn.categoryNames) === JSON.stringify(["Animali", "Cibi"])));
  assert.equal(validateSharedExercises([exercise], library), null);
  assert.equal(compileSessionPlan([{ ...exercise, categoryItemIds: ["sentence"] }], library, { articleFor: () => null }).length, 0);
});

test("un turno condiviso conserva le categorie senza bersagli selezionati e non modifica lo snapshot", () => {
  const single = { ...exercise, categoryNames: ["Animali", "Cibi"], categoryItemIds: ["dog"] };
  const before = JSON.stringify(single);
  const [turn] = compileSessionPlan([single], [library[0]], { articleFor: () => null });
  assert.deepEqual(turn.categoryNames, ["Animali", "Cibi"]);
  assert.equal(JSON.stringify(single), before);
});
