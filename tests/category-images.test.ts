import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { categoryImageError, snapshotCategorySymbols } from "../app/domain/category-images.ts";
import { compileSessionPlan, type SessionExercise } from "../app/domain/session-compilation.ts";
import { validateSharedExercises } from "../app/domain/shared-preview-validation.ts";
import { applyStateChange, buildStateChange, parseStateChangeRequest } from "../app/domain/state-changes.ts";
import { projectLegacyState, rebuildLegacyState } from "../app/domain/relational-state.ts";
import { relationalTablesForChange } from "../db/relational-state.ts";
import { filterQuickCandidates } from "../app/domain/session-planning.ts";
import { availableForRecognition } from "../app/domain/library-availability.ts";

const library = [
  { id: "dog", word: "Cane", category: "Animali", image: "/dog.webp" },
  { id: "apple", word: "Mela", category: "Cibi", image: "/apple.webp" },
  { id: "animal-symbol", word: "Simbolo", category: "Simboli", image: "/animals.webp", categorySymbolOnly: true },
  { id: "food-symbol", word: "Simbolo", category: "Simboli", remoteImageId: "remote-food", categorySymbolOnly: true },
];
const symbols = { Animali: "animal-symbol", Cibi: "food-symbol" };
const exercise: SessionExercise = { id: "categories", title: "Categorie", kind: "word-categories", promptId: "", optionIds: [], categoryNames: ["Animali", "Cibi"], categoryItemIds: ["dog", "apple"], rounds: 2, updatedAt: "2026-10-26T12:00:00Z" };

test("le immagini sono opt-in: gli esercizi testuali storici non richiedono simboli", () => {
  assert.equal(categoryImageError(exercise, library), null);
  assert.equal(validateSharedExercises([exercise], library), null);
});
test("tutte le categorie selezionate richiedono un simbolo esplicito valido", () => {
  const visual = { ...exercise, categoryShowSymbols: true };
  assert.match(categoryImageError(visual, library, {})!, /Animali, Cibi/);
  assert.match(categoryImageError(visual, library, { Animali: "dog" })!, /Cibi/);
  assert.match(categoryImageError(visual, library.map((item) => item.id === "animal-symbol" ? { ...item, deleted: true } : item), symbols)!, /Animali/);
  assert.equal(categoryImageError(visual, library, symbols), null);
  assert.equal(categoryImageError(visual, library, { Animali: "dog", Cibi: "apple" }), null, "si possono riusare foto ordinarie");
});
test("la foto del bersaglio richiede immagini ma non simboli delle categorie", () => {
  const textLibrary = library.map((item) => item.id === "dog" ? { ...item, image: undefined } : item);
  assert.match(categoryImageError({ ...exercise, categoryShowTargetImage: true }, textLibrary)!, /parole selezionate/);
  assert.equal(categoryImageError(exercise, textLibrary), null);
});
test("i turni congelano solo le associazioni richieste e non estraggono i simboli come bersagli", () => {
  const configured = { ...exercise, categorySpeakWord: true, categoryShowTargetImage: true, categoryShowSymbols: true };
  const options = { articleFor: () => null, categorySymbols: { ...symbols, Extra: "unshared" }, createId: () => "demo" };
  const plan = compileSessionPlan([configured], library, options);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].categorySymbolIds, symbols);
  assert.ok(plan.every((item) => item.categorySpeakWord && item.categoryShowTargetImage && item.categoryShowSymbols));
  assert.deepEqual(plan.flatMap((item) => item.categoryItemIds).sort(), ["apple", "dog"]);
  assert.deepEqual(compileSessionPlan([configured], library, { ...options, categorySymbols: {} }), []);
  assert.equal(compileSessionPlan(plan, library, { articleFor: () => null }).length, 2, "ripristino e anteprima usano il mapping congelato");
  assert.equal(validateSharedExercises(plan, library), null);
  assert.equal(validateSharedExercises(plan, library.filter((item) => item.id !== "food-symbol"))?.code, "missing_reference");
  assert.deepEqual(snapshotCategorySymbols(["Cibi"], symbols), { Cibi: "food-symbol" });
});
test("i simboli dedicati sono esclusi da avvio rapido e riconoscimento", () => {
  assert.deepEqual(availableForRecognition(library, "words").map((item) => item.id), ["dog", "apple"]);
  assert.deepEqual(filterQuickCandidates(library, { activity: "word-categories", selection: "all", categoryNames: ["Animali", "Cibi", "Simboli"], itemIds: [] }).map((item) => item.id), ["dog", "apple"]);
});
test("il mapping passa dalle modifiche granulari, anche con rimozione esplicita", () => {
  const state = { library: [], exercises: [] };
  const change = buildStateChange(state, { ...state, categorySymbols: symbols }, crypto.randomUUID(), 1)!;
  assert.deepEqual(applyStateChange(state, change).categorySymbols, symbols);
  assert.ok(relationalTablesForChange(change).includes("categories"));
  assert.ok(!relationalTablesForChange(change).includes("session_items"));
  assert.deepEqual(applyStateChange(state, { ...change, values: { categorySymbols: {} } }).categorySymbols, {});
  assert.throws(() => parseStateChangeRequest({ ...change, values: { categorySymbols: { Animali: 42 } } }), /invalid_category_symbols/);
});
test("migrazione additiva su schema storico: default e round-trip D1 delle immagini e opzioni", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.filter((entry) => entry.idx < 16)) db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  db.exec("INSERT INTO accounts VALUES ('old','old@example.test','Demo',1,1)");
  db.exec("INSERT INTO categories (account_id,name,normalized_name,created_at,updated_at) VALUES ('old','Animali','animali',1,1)");
  db.exec("INSERT INTO exercises (account_id,id,title,kind,auto_pronounce,position,version,created_at,updated_at) VALUES ('old','old','Demo','word-categories',0,0,1,1,1)");
  db.exec(readFileSync(new URL("../drizzle/0016_category_images.sql", import.meta.url), "utf8"));
  assert.equal(db.prepare("SELECT symbol_library_item_id AS id FROM categories").get()!.id, null);
  assert.equal(db.prepare("SELECT category_show_symbols AS value FROM exercises").get()!.value, 0);
  const projection = projectLegacyState({ schemaVersion: 1, categorySymbols: symbols, therapists: [], children: [], library, exercises: [{ ...exercise, categorySpeakWord: true, categoryShowTargetImage: true, categoryShowSymbols: true }], sequences: [], attempts: [], helps: [], sessionHistory: [] }, "demo");
  db.exec("INSERT INTO accounts VALUES ('demo','demo@example.test','Demo',1,1)");
  for (const [table, rows] of Object.entries(projection.tables)) for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
  }
  for (const table of ["categories", "library_items", "exercises"] as const) projection.tables[table] = db.prepare(`SELECT * FROM ${table} WHERE account_id='demo'`).all() as typeof projection.tables[typeof table];
  const rebuilt = rebuildLegacyState(projection);
  assert.deepEqual(rebuilt.categorySymbols, symbols);
  assert.equal(rebuilt.exercises[0].categorySpeakWord, true);
  assert.equal(rebuilt.exercises[0].categoryShowTargetImage, true);
  assert.equal(rebuilt.exercises[0].categoryShowSymbols, true);
  assert.equal(rebuilt.library.find((item) => item.id === "animal-symbol")!.categorySymbolOnly, true);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
