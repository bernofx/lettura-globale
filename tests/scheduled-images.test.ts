import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateOpenAIImage, normalizeGeneratedWebp, OpenAIImageError, openAIImagePrompt } from "../app/server/openai-image-generation.ts";
import { verifyCatalogCommit } from "../scripts/publish-scheduled-image.mjs";
import { addScheduledCatalog, readScheduledCatalog } from "../app/domain/scheduled-catalog.ts";
import { MAX_SCHEDULED_IMAGES, isScheduledWebp, parseScheduledWords, scheduledAssetUrl, scheduledImageMetadata, scheduledWebpFromBase64, scheduledWordKey } from "../app/domain/scheduled-images.ts";

test("la coda unifica maiuscole, spazi, apostrofi e forme Unicode equivalenti", () => {
  assert.deepEqual(parseScheduledWords(" Clessidra \n CLESSIDRA \n Pesca | il frutto \n L’acqua \n l'acqua"), [
    { word: "Clessidra", key: "clessidra", detail: "" },
    { word: "Pesca", key: "pesca", detail: "il frutto" },
    { word: "L’acqua", key: "l'acqua", detail: "" },
  ]);
  assert.equal(scheduledWordKey(" Citta\u0300 "), "città");
  assert.notEqual(scheduledWordKey("pesca"), scheduledWordKey("pèsca"));
});

test("la coda accetta termini e precisazioni entro i limiti previsti", () => {
  for (const value of [null, "", " | nota", "nave@esempio.it", "nave | nota | extra", "nave | " + "a".repeat(201),
    Array.from({ length: MAX_SCHEDULED_IMAGES + 1 }, () => "parola").join("\n")]) {
    assert.throws(() => parseScheduledWords(value), /invalid_words/);
  }
});

test("i metadati della proposta accettano solo categoria, articolo e sillabazione coerente", () => {
  const metadata = { category: "Oggetti", article: "LA", syllabification: "cles-si-dra" };
  assert.deepEqual(scheduledImageMetadata("Clessidra", metadata), metadata);
  for (const value of [{ ...metadata, category: "Azione" }, { ...metadata, path: "image.webp" }, { ...metadata, syllabification: "na-ve" }]) {
    assert.equal(scheduledImageMetadata("Clessidra", value), null);
  }
  assert.throws(() => parseScheduledWords("Una locuzione con troppe parole"), /invalid_words/);
  assert.throws(() => parseScheduledWords("Pesca | il\u202efrutto"), /invalid_words/);
});

test("le immagini programmate sono WebP semplici con dimensione e lunghezza controllate", () => {
  const image = readFileSync("public/images/demo/clessidra.webp");
  assert.ok(isScheduledWebp(image));
  assert.ok(scheduledWebpFromBase64(image.toString("base64")));
  assert.equal(isScheduledWebp(Buffer.concat([image, Buffer.from("extra")])), false);
  assert.equal(isScheduledWebp(image.subarray(0, 30)), false);
  const extended = Buffer.from(image);
  extended.write("VP8X", 12);
  assert.equal(isScheduledWebp(extended), false);
  assert.equal(scheduledWebpFromBase64("A".repeat(600_000)), null);
});

test("il catalogo dà priorità alle foto esistenti e mantiene gli ID delle schede senza foto", () => {
  const assetId = "12345678-1234-4321-abcd-1234567890ab";
  const entry = { assetId, word: "Lanterna", metadata: { category: "Oggetti", article: "LA", syllabification: "lan-ter-na" } };
  const placeholder = { id: "esistente", word: "Lanterna", emoji: "🏮", category: "Casa", source: "", license: "", author: "" };
  const upgraded = addScheduledCatalog([placeholder], [entry]);
  assert.equal(upgraded.length, 1);
  assert.equal(upgraded[0].id, placeholder.id);
  assert.equal(upgraded[0].image, scheduledAssetUrl(assetId));
  assert.equal(upgraded[0].syllabification, "lan-ter-na");
  const alreadyImage = { ...placeholder, image: "/old.webp" };
  assert.deepEqual(addScheduledCatalog([alreadyImage], [entry]), [alreadyImage]);
  assert.throws(() => readScheduledCatalog([{ ...entry, assetId: "../lanterna" }]), /invalid_scheduled_entry/);
  assert.throws(() => readScheduledCatalog([entry, { ...entry, word: "LANTERNA" }]), /invalid_scheduled_entry/);
});

test("il publisher autorizza solo il WebP e la voce approvati sul commit esatto", t => {
  const path = mkdtempSync(join(tmpdir(), "scheduled-catalog-"));
  t.after(() => rmSync(path, { force: true, recursive: true }));
  const git = (...args: string[]) => execFileSync("git", ["-C", path, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.test");
  const catalog = "app/domain/scheduled-catalog.json";
  const entry = { assetId: "12345678-1234-4321-abcd-1234567890ab", word: "Lanterna",
    metadata: { category: "Oggetti", article: "LA", syllabification: "lan-ter-na" } };
  const asset = "public" + scheduledAssetUrl(entry.assetId);
  mkdirSync(join(path, "app/domain"), { recursive: true });
  mkdirSync(join(path, "public/images/scheduled"), { recursive: true });
  writeFileSync(join(path, catalog), "[]\n");
  git("add", catalog);
  git("commit", "-m", "Base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-c", "candidate");
  const image = readFileSync("public/images/demo/clessidra.webp");
  writeFileSync(join(path, asset), image);
  writeFileSync(join(path, catalog), JSON.stringify([entry], null, 2) + "\n");
  git("add", catalog, asset);
  git("commit", "-m", "Approved entry");
  const approved = git("rev-parse", "HEAD");
  assert.doesNotThrow(() => verifyCatalogCommit(approved, entry, image, path));

  const otherImage = readFileSync("public/images/demo/nave.webp");
  assert.throws(() => verifyCatalogCommit(approved, entry, otherImage, path), /unexpected_catalog_image/);
  assert.throws(() => verifyCatalogCommit(approved, { ...entry, metadata: { ...entry.metadata, category: "Casa" } }, image, path), /unexpected_catalog_contents/);

  writeFileSync(join(path, "README.md"), "Un file estraneo al catalogo\n");
  git("add", "README.md");
  git("commit", "--amend", "--no-edit");
  assert.throws(() => verifyCatalogCommit(git("rev-parse", "HEAD"), entry, image, path), /unexpected_catalog_diff/);
});

test("il prompt immagini delimita la descrizione come dati e preserva gli accenti", () => {
  const detail = 'il frutto, con una foglia "verde"';
  const prompt = openAIImagePrompt("Pèsca", detail);
  assert.deepEqual(JSON.parse(prompt.split("\n").at(-1)!), { parola: "Pèsca", precisazione_visiva: detail });
  assert.throws(() => parseScheduledWords("Pesca | nome@example.test"), /invalid_words/);
});

test("la risposta del provider conserva soltanto i pixel WebP statici", () => {
  const image = readFileSync("public/images/demo/clessidra.webp");
  const original = image.toString("base64");
  assert.equal(normalizeGeneratedWebp(original), original);
  const extended = Buffer.alloc(18);
  extended.write("VP8X");
  extended.writeUInt32LE(10, 4);
  extended[8] = 8; // EXIF metadata.
  extended.writeUIntLE(1023, 12, 3);
  extended.writeUIntLE(1023, 15, 3);
  const extra = Buffer.alloc(12);
  extra.write("EXIF");
  extra.writeUInt32LE(4, 4);
  extra.write("test", 8);
  const withMetadata = Buffer.concat([image.subarray(0, 12), extended, image.subarray(12), extra]);
  withMetadata.writeUInt32LE(withMetadata.length - 8, 4);
  assert.equal(normalizeGeneratedWebp(withMetadata.toString("base64")), original);
  withMetadata[20] |= 2; // Reject animated WebP.
  assert.throws(() => normalizeGeneratedWebp(withMetadata.toString("base64")), /invalid_generated_image/);
  assert.throws(() => normalizeGeneratedWebp("YWJj"), /invalid_generated_image/);
});

test("gli errori OpenAI conservano dati diagnostici ammessi senza esporre la risposta grezza", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: {
      code: "unsupported_parameter", param: "background", message: "Testo privato del provider",
    },
  }, { status: 400, headers: { "x-request-id": "req_test123" } }));
  await assert.rejects(generateOpenAIImage("synthetic-key", "Lanterna", ""), error => {
    assert.ok(error instanceof OpenAIImageError);
    assert.deepEqual(error.failure, {
      kind: "http", status: 400, code: "unsupported_parameter", parameter: "background", requestId: "req_test123",
    });
    assert.match(error.userMessage, /parametro background.*HTTP 400/);
    assert.doesNotMatch(error.userMessage + JSON.stringify(error.failure), /Testo privato|synthetic-key/);
    return true;
  });
  assert.equal(fetchMock.mock.callCount(), 1);

  fetchMock.mock.mockImplementation(async () => Response.json({
    error: { code: "arbitrary_echo", param: "arbitrary_echo", message: "arbitrary_echo" },
  }, { status: 400, headers: { "x-request-id": "arbitrary_echo" } }));
  await assert.rejects(generateOpenAIImage("synthetic-key", "Lanterna", ""), error => {
    assert.ok(error instanceof OpenAIImageError);
    assert.match(error.userMessage, /HTTP 400/);
    assert.doesNotMatch(error.userMessage + JSON.stringify(error.failure), /arbitrary_echo/);
    return true;
  });
});

test("la coda distingue permessi del modello, quota OpenAI, rete e WebP incompatibile", async (t) => {
  const denied = { body: { error: { code: "model_not_found" } }, status: 404, message: /modello immagini.*HTTP 404/ };
  const quota = { body: { error: { code: "insufficient_quota" } }, status: 429, message: /fatturazione.*HTTP 429/ };
  const wrongImage = { body: { data: [{ b64_json: "YWJj" }] }, status: 200, message: /immagine ricevuta/ };
  const fetchMock = t.mock.method(globalThis, "fetch");
  for (const { body, status, message } of [denied, quota, wrongImage]) {
    fetchMock.mock.mockImplementation(async () => Response.json(body, { status }));
    await assert.rejects(generateOpenAIImage("synthetic-key", "Lanterna", ""), error => {
      assert.ok(error instanceof OpenAIImageError);
      assert.match(error.userMessage, message);
      return true;
    });
  }
  fetchMock.mock.mockImplementation(async () => { throw new Error("network failure with private context"); });
  await assert.rejects(generateOpenAIImage("synthetic-key", "Lanterna", ""), error => {
    assert.ok(error instanceof OpenAIImageError);
    assert.deepEqual(error.failure, { kind: "network" });
    assert.match(error.userMessage, /contattare OpenAI/);
    return true;
  });
});
