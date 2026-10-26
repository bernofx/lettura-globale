import assert from "node:assert/strict";
import test from "node:test";
import { validateSharedExercises } from "../app/domain/shared-preview-validation.ts";
import { remapExerciseReferences } from "../app/domain/exercise-library-references.ts";
import { deduplicateLibraryPlaceholders, type DeduplicableLibraryItem } from "../app/domain/library-deduplication.ts";
import { cloudSaveCanSettle, prepareCloudShare } from "../app/domain/share-preparation.ts";
import type { SessionExercise } from "../app/domain/session-compilation.ts";
import { readFileSync } from "node:fs";

const library = [
  { id: "dog-new", word: "Cane", category: "Animali", image: "/dog.webp", article: "IL" as const, privateUpload: true },
  { id: "mela", word: "Mela", category: "Cibi", emoji: "🍎", article: "LA" as const },
  { id: "gatto", word: "Gatto", category: "Animali", emoji: "🐈", article: "IL" as const },
];
const fixed: SessionExercise = { id: "fixed", title: "Trova", promptId: "dog-new", optionIds: ["dog-new", "mela"], updatedAt: "2026-10-26" };

test("validates fixed, random across categories, articles, categories and quantity", () => {
  const exercises: SessionExercise[] = [fixed,
    { ...fixed, id: "random", recognitionMode: "random", promptId: "", optionIds: [], distractorCount: 2, distractorSource: "mixed", rounds: 6 },
    { ...fixed, id: "articles", kind: "articles", articleItemIds: ["dog-new", "mela"] },
    { ...fixed, id: "categories", kind: "word-categories", categoryNames: ["Animali", "Cibi"], categoryItemIds: ["dog-new", "mela"] },
    { ...fixed, id: "quantity", kind: "number-quantity" },
    { ...fixed, id: "naming", kind: "naming", namingItemIds: ["dog-new"] },
  ];
  assert.equal(validateSharedExercises(exercises, library), null);
  assert.equal(validateSharedExercises([{ ...fixed, recognitionMode: "random", distractorCount: 1, recognitionItemIds: ["unused-preference"] }], library), null, "fixed random targets can complete preferred distractors from the compatible library");
  assert.equal(validateSharedExercises([{ ...exercises[1], distractorSource: "same-category" }], library)?.code, "empty_exercise");
});

test("missing/archived targets, choices and invalid later activities cannot produce a partial preview", () => {
  assert.equal(validateSharedExercises([{ ...fixed, promptId: "old-dog" }], library)?.code, "missing_reference");
  assert.equal(validateSharedExercises([{ ...fixed, optionIds: ["dog-new", "missing"] }], library)?.code, "missing_reference");
  assert.equal(validateSharedExercises([fixed, { ...fixed, id: "later", kind: "articles", articleItemIds: [] }], library)?.exerciseId, "later");
  assert.equal(validateSharedExercises([{ ...fixed, rounds: 1000000 }], library)?.code, "invalid_configuration");
  assert.equal(validateSharedExercises([fixed], library.map((item) => item.id === "dog-new" ? { ...item, deleted: true } : item))?.code, "missing_reference");
  assert.equal(validateSharedExercises([{ ...fixed, kind: "sentence-matching", sentenceItemIds: ["dog-new", "mela"] }], library)?.code, "empty_exercise");
});

test("archived demo placeholders remap once to a unique active uploaded photo, not real deletions", () => {
  const old = { id: "old-dog", word: "Cane", category: "Animali", emoji: "🐕", source: "Catalogo demo", deleted: true };
  const repaired = deduplicateLibraryPlaceholders([old, ...library]);
  assert.equal(repaired.replacements.get("old-dog"), "dog-new");
  assert.equal(repaired.items[0], old, "already archived placeholder is not repeatedly rewritten");
  const original = { ...fixed, recognitionMode: "random" as const, distractorSource: "mixed" as const, promptId: "old-dog", optionIds: ["old-dog", "mela"], categoryItemIds: ["old-dog"] };
  const remapped = remapExerciseReferences(original, repaired.replacements);
  assert.equal(remapped.promptId, "dog-new");
  assert.deepEqual(remapped.optionIds, ["dog-new", "mela"]);
  assert.deepEqual(remapped.categoryItemIds, ["dog-new"]);
  assert.equal(remapped.recognitionMode, "random");
  assert.equal(remapped.distractorSource, "mixed");
  assert.equal(original.promptId, "old-dog");
  assert.equal(remapExerciseReferences(remapped, repaired.replacements), remapped);
  assert.equal(deduplicateLibraryPlaceholders([{ ...old, image: "/real.webp", privateUpload: true }, ...library]).replacements.size, 0);
  assert.equal(deduplicateLibraryPlaceholders([old, ...library, { ...library[0], id: "another-dog" }]).replacements.size, 0);
  assert.equal(deduplicateLibraryPlaceholders([old, { ...library[0], category: "Altro" }]).replacements.size, 0);
  assert.equal(deduplicateLibraryPlaceholders([{ ...old, source: "Custom" }, ...library]).replacements.size, 0);
  assert.equal(deduplicateLibraryPlaceholders<DeduplicableLibraryItem>([{ ...old, deleted: false }, ...library, { ...library[0], id: "another-dog" }]).replacements.size, 0);
});

test("share waits for the latest cloud revision and stops on failure or concurrent edits", async () => {
  let finish!: () => void;
  let completed = false;
  const pending = prepareCloudShare(() => new Promise<void>((resolve) => { finish = resolve; }), () => false, () => 7).then((revision) => { completed = true; return revision; });
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  assert.equal(await pending, 7);
  await assert.rejects(prepareCloudShare(async () => { throw new Error("save failed"); }, () => false, () => 1), /save failed/);
  await assert.rejects(prepareCloudShare(async () => undefined, () => true, () => 1), /share_sync_pending/);
});

test("yellow can settle only with no dirty data, serial writes or debounce timer", () => {
  assert.equal(cloudSaveCanSettle(0, false, false), true);
  assert.equal(cloudSaveCanSettle(1, false, false), false);
  assert.equal(cloudSaveCanSettle(0, true, false), false);
  assert.equal(cloudSaveCanSettle(0, false, true), false);
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /clearTimeout\(statusTimer\)/);
  assert.doesNotMatch(source, /if \(!exercise \|\| !prompt\) return null/);
  assert.match(source, /fetchWithTimeout\(`\/api\/shared-launch/);
  assert.match(source, /validateSharedExercises\(payload.exercises, payload.library\)/);
  const share = source.slice(source.indexOf("const shareLaunch = async"), source.indexOf("const navigate = ", source.indexOf("const shareLaunch = async")));
  assert.ok(share.indexOf("await prepareCloudShare") < share.indexOf('fetchWithTimeout("/api/shared-launch"'));
});
