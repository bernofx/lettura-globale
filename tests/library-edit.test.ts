import assert from "node:assert/strict";
import test from "node:test";
import { libraryItemWasEdited } from "../app/domain/library-edit.ts";

const item = { word: "Mela", category: "Cibi", article: null, syllabification: "me-la", syllableCount: 2, syllableStatus: "verified", image: "/api/media/mela" };

test("non salva nuovamente una scheda della libreria rimasta invariata", () => {
  assert.equal(libraryItemWasEdited(item, { ...item, article: undefined, syllabification: "ME-LA" }), false);
});

test("riconosce le modifiche effettive alla scheda della libreria", () => {
  assert.equal(libraryItemWasEdited(item, { ...item, word: "Mele" }), true);
  assert.equal(libraryItemWasEdited(item, { ...item, image: "data:image/webp;base64,changed" }), true);
});
