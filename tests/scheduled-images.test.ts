import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generateOpenAIImage, OpenAIImageError, openAIImagePrompt } from "../app/server/openai-image-generation.ts";
import { inspectScheduledImage, publishedImageBytes, scheduledImagePreview } from "../app/domain/scheduled-image-preview.ts";
import { validateImageBytes } from "../app/domain/image-validation.ts";
import { mergeOfficialLibrary } from "../app/shared/state-hydration.ts";
import { stockItems } from "../app/shared/seed-data.ts";
import { addScheduledCatalog, officialCatalogImageUrl, readScheduledCatalog, type OfficialCatalogEntry } from "../app/domain/scheduled-catalog.ts";
import { MAX_SCHEDULED_IMAGES, parseScheduledWords, scheduledAssetUrl, scheduledImageMetadata, scheduledWordKey } from "../app/domain/scheduled-images.ts";

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

test("il catalogo online mantiene l’ID del segnaposto senza riaprire le schede archiviate", () => {
  const entry: OfficialCatalogEntry = { assetId: "12345678-1234-4321-abcd-1234567890ab", word: "Tazza", extension: "png",
    metadata: { category: "Casa", article: "LA", syllabification: "taz-za" } };
  const old = stockItems.find(item => item.id === "tazza");
  assert.ok(old && !old.image);
  const [current] = mergeOfficialLibrary([old], [entry]);
  assert.equal(current.id, old.id);
  assert.equal(current.image, officialCatalogImageUrl(entry.assetId, entry.extension));
  assert.equal(current.article, "LA");
  const archived = { ...old, deleted: true };
  const photo = { ...old, privateUpload: true, remoteImageId: "private-image" };
  assert.equal(mergeOfficialLibrary([archived], [entry])[0], archived);
  assert.equal(mergeOfficialLibrary([photo], [entry])[0], photo);
});

test("la pubblicazione PNG elimina i metadati senza perdere i pixel", () => {
  const image = readFileSync("public/images/demo/mela.png");
  const comment = Buffer.from("testo temporaneo");
  const chunk = Buffer.alloc(comment.length + 12);
  chunk.writeUInt32BE(comment.length, 0);
  chunk.write("tEXt", 4);
  comment.copy(chunk, 8);
  const annotated = Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);
  const preview = scheduledImagePreview(annotated.toString("base64"));
  assert.ok(preview);
  const published = publishedImageBytes(preview);
  assert.ok(published);
  assert.equal(published.includes(comment), false);
  assert.deepEqual(validateImageBytes(published, "image/png"), { valid: true, width: 768, height: 768 });
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
  assert.deepEqual(scheduledImagePreview(original)?.bytes, image);
  const dimensions = validateImageBytes(image, "image/webp");
  assert.ok(dimensions.valid);
  const extended = Buffer.alloc(18);
  extended.write("VP8X");
  extended.writeUInt32LE(10, 4);
  extended[8] = 8; // EXIF metadata.
  extended.writeUIntLE(dimensions.width - 1, 12, 3);
  extended.writeUIntLE(dimensions.height - 1, 15, 3);
  const extra = Buffer.alloc(700_008);
  extra.write("EXIF");
  extra.writeUInt32LE(700_000, 4);
  const withMetadata = Buffer.concat([image.subarray(0, 12), extended, image.subarray(12), extra]);
  withMetadata.writeUInt32LE(withMetadata.length - 8, 4);
  assert.deepEqual(scheduledImagePreview(withMetadata.toString("base64"))?.bytes, image);
  withMetadata[20] |= 2; // Reject animated WebP.
  assert.equal(scheduledImagePreview(withMetadata.toString("base64")), null);
  assert.equal(scheduledImagePreview("YWJj"), null);
  assert.equal(scheduledImagePreview(image.subarray(0, 30).toString("base64")), null);
});

test("una risposta PNG valida resta disponibile con il proprio tipo per l’anteprima", async (t) => {
  const png = readFileSync("public/images/demo/mela.png");
  const encoded = png.toString("base64");
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ b64_json: encoded }] }));
  assert.equal(await generateOpenAIImage("synthetic-key", "Mela", ""), encoded);
  assert.deepEqual(scheduledImagePreview(encoded), { imageType: "image/png", width: 768, height: 768, bytes: png });
  assert.equal(scheduledImagePreview(png.subarray(0, -12).toString("base64")), null);
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

test("la coda distingue permessi del modello, quota OpenAI, rete e immagini incompatibili", async (t) => {
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

test("un WebP con le credenziali di provenienza C2PA di OpenAI viene accettato senza i metadati", async (t) => {
  const image = readFileSync("public/images/demo/clessidra.webp");
  const dimensions = validateImageBytes(image, "image/webp");
  assert.ok(dimensions.valid);
  const extended = Buffer.alloc(18);
  extended.write("VP8X");
  extended.writeUInt32LE(10, 4);
  extended.writeUIntLE(dimensions.width - 1, 12, 3);
  extended.writeUIntLE(dimensions.height - 1, 15, 3);
  const provenance = Buffer.alloc(8 + 301);
  provenance.write("C2PA");
  provenance.writeUInt32LE(301, 4);
  const signed = Buffer.concat([image.subarray(0, 12), extended, image.subarray(12), provenance, Buffer.alloc(1)]);
  signed.writeUInt32LE(signed.length - 8, 4);
  const encoded = signed.toString("base64");
  assert.deepEqual(scheduledImagePreview(encoded)?.bytes, image, "the provenance chunk (odd size, padded) is dropped");
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ b64_json: encoded }] }));
  assert.equal(await generateOpenAIImage("synthetic-key", "Clessidra", ""), image.toString("base64"));
});

test("un’immagine non utilizzabile spiega il motivo senza esporre il contenuto", async (t) => {
  const png = readFileSync("public/images/demo/mela.png");
  const wide = Buffer.from(png);
  wide.writeUInt32BE(1536, 16);
  assert.deepEqual(inspectScheduledImage(wide.toString("base64")), { reason: "not_square", imageType: "image/png", width: 1536, height: 768 });
  assert.deepEqual(inspectScheduledImage(Buffer.from("GIF89a" + "x".repeat(40)).toString("base64")), { reason: "format" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ b64_json: wide.toString("base64") }] }));
  await assert.rejects(generateOpenAIImage("synthetic-key", "Mela", ""), error => {
    assert.ok(error instanceof OpenAIImageError);
    assert.equal(error.userMessage, "L’immagine ricevuta da OpenAI (PNG 1536×768) non è quadrata.");
    assert.deepEqual(error.failure.image, { reason: "not_square", imageType: "image/png", width: 1536, height: 768 });
    return true;
  });
});
