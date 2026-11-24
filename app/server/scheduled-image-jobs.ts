import { articleFor } from "../domain/article-classification";
import { scheduledCategories, scheduledId, scheduledImageMetadata, scheduledWordKey, type ScheduledImageMetadata } from "../domain/scheduled-images";
import { hashText } from "../domain/sha256";
import { analyzeItalianSyllables } from "../domain/syllabification";
import { stockItems } from "../shared/seed-data";
import { generateOpenAIImage, ImageGenerationAccessError, ImageGenerationRateLimit, ImageGenerationRejected } from "./openai-image-generation";

export type ScheduledImageJob = { id: string; generationId: string };

const generationLease = 8 * 60 * 1_000;
const redispatchAge = 15 * 60 * 1_000;

export function imageGenerationConfig(env: Cloudflare.Env) {
  const { DB: db, SCHEDULED_IMAGE_JOBS: queue, OPENAI_API_KEY: key, SCHEDULED_IMAGES_ACCOUNT_ID: accountId } = env;
  const rawLimit = env.SCHEDULED_IMAGES_MONTHLY_LIMIT ?? "";
  const limit = Number(rawLimit);
  if (!db || !queue || !key?.trim() || !accountId || rawLimit !== String(limit) || !Number.isSafeInteger(limit) || limit < 1) return null;
  return { db, queue, key, accountId, limit };
}

function monthAt(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

export async function imageGenerationUsage(db: D1Database, limit: number) {
  const row = await db.prepare("SELECT attempts FROM scheduled_image_usage WHERE month = ?").bind(monthAt()).first<{ attempts: number }>();
  return { used: row?.attempts ?? 0, limit };
}

export async function sendImageJobs(db: D1Database, queue: Queue<ScheduledImageJob>, jobs: ScheduledImageJob[]) {
  if (!jobs.length) return;
  await queue.sendBatch(jobs.map(body => ({ body, contentType: "json" })));
  const now = Date.now();
  await db.batch(jobs.map(job => db.prepare(`UPDATE scheduled_image_requests SET dispatched_at = ?
    WHERE id = ? AND generation_id = ? AND status = 'queued'`).bind(now, job.id, job.generationId)));
}

export async function recoverImageJobs(env: Cloudflare.Env) {
  const config = imageGenerationConfig(env);
  if (!config) return;
  const { db, queue, accountId } = config;
  const now = Date.now();
  // A terminated request may already have reached the provider. Require a new
  // explicit request before spending another unit on the same word.
  await db.prepare(`UPDATE scheduled_image_requests
    SET status = 'failed', message = 'Generazione interrotta. Puoi riprovare dalla coda.', claim_id = NULL, lease_until = NULL, updated_at = ?
    WHERE account_id = ? AND status = 'processing' AND lease_until <= ?`).bind(now, accountId, now).run();
  const { results } = await db.prepare(`SELECT id, generation_id AS generationId FROM scheduled_image_requests
    WHERE account_id = ? AND status = 'queued' AND generation_id IS NOT NULL
      AND (dispatched_at IS NULL OR dispatched_at <= ?)
    ORDER BY created_at, id LIMIT 50`).bind(accountId, now - redispatchAge).all<ScheduledImageJob>();
  await sendImageJobs(db, queue, results);
}

const wordCards = stockItems.filter(item => !item.categorySymbolOnly && item.contentKind !== "sentence");
const bundledImageWords = wordCards.filter(item => item.image)
  .map(item => scheduledWordKey(item.word));

export async function wordsWithImages(db: D1Database, accountId: string) {
  const { results } = await db.prepare(`
    SELECT json_extract(item.value, '$.word') AS word
    FROM user_states AS state, json_each(state.payload, '$.library') AS item
    WHERE state.user_id = ?
      AND COALESCE(json_extract(item.value, '$.deleted'), 0) = 0
      AND COALESCE(json_extract(item.value, '$.categorySymbolOnly'), 0) = 0
      AND json_extract(item.value, '$.contentKind') IS NOT 'sentence'
      AND (COALESCE(json_extract(item.value, '$.image'), '') <> '' OR COALESCE(json_extract(item.value, '$.remoteImageId'), '') <> '')
  `).bind(accountId).all<{ word: string }>();
  return new Set([...bundledImageWords, ...results.filter(item => typeof item.word === "string").map(item => scheduledWordKey(item.word))]);
}

function draftMetadata(word: string): ScheduledImageMetadata {
  const card = wordCards.find(item => scheduledWordKey(item.word) === scheduledWordKey(word));
  const category = scheduledCategories.find(category => category === card?.category) ?? "Oggetti";
  const article = card ? articleFor(card) ?? null : null;
  const syllabification = card?.syllabification ?? analyzeItalianSyllables(word).syllabification;
  const candidate = { category, article, syllabification };
  return scheduledImageMetadata(word, candidate) ?? { ...candidate, syllabification: scheduledWordKey(word) };
}

export function imageProposalDigest(metadata: ScheduledImageMetadata, image: string) {
  return hashText(JSON.stringify([metadata, image]));
}

export async function processImageJob(job: ScheduledImageJob, env: Cloudflare.Env) {
  const config = imageGenerationConfig(env);
  if (!config || !job || typeof job.id !== "string" || typeof job.generationId !== "string" ||
    !scheduledId.test(job.id) || !scheduledId.test(job.generationId)) return;
  const { db, accountId, limit, key } = config;
  const now = Date.now();
  const claimId = crypto.randomUUID();
  const active = "id = ? AND account_id = ? AND generation_id = ? AND claim_id = ? AND status = 'processing'";
  const bindings = [job.id, accountId, job.generationId, claimId] as const;
  const item = await db.prepare(`UPDATE scheduled_image_requests
    SET status = 'processing', claim_id = ?, lease_until = ?, updated_at = ?
    WHERE id = ? AND account_id = ? AND generation_id = ? AND status = 'queued'
    RETURNING word, detail, word_key AS wordKey`).bind(claimId, now + generationLease, now, job.id, accountId, job.generationId)
    .first<{ word: string; detail: string; wordKey: string }>();
  if (!item) return;

  async function finish(status: "failed" | "needs_review" | "existing", message = "") {
    await db.prepare(`UPDATE scheduled_image_requests
      SET status = ?, message = ?, claim_id = NULL, lease_until = NULL, updated_at = ?
      WHERE ${active}`).bind(status, message, Date.now(), ...bindings).run();
  }

  if ((await wordsWithImages(db, accountId)).has(item.wordKey)) return finish("existing");

  const reserved = await db.prepare(`INSERT INTO scheduled_image_usage (month, attempts) VALUES (?, 1)
    ON CONFLICT (month) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?
    RETURNING attempts`).bind(monthAt(), limit).first();
  if (!reserved) return finish("failed", "Limite mensile raggiunto. Riproponi la parola quando torna disponibile.");

  let image: string;
  try {
    image = await generateOpenAIImage(key, item.word, item.detail);
  } catch (error) {
    if (error instanceof ImageGenerationRejected) return finish("needs_review", "Rivedi la parola o la precisazione visiva.");
    if (error instanceof ImageGenerationAccessError) return finish("failed", "Controlla la chiave API e i permessi del progetto OpenAI.");
    if (error instanceof ImageGenerationRateLimit) return finish("failed", "OpenAI segnala un limite di utilizzo. Controlla il progetto API prima di riprovare.");
    return finish("failed", "Generazione non riuscita. Puoi riprovare dalla coda.");
  }

  const metadata = draftMetadata(item.word);
  await db.prepare(`UPDATE scheduled_image_requests
    SET status = 'generated', metadata = ?, image_base64 = ?, proposal_digest = ?, claim_id = NULL, lease_until = NULL, updated_at = ?
    WHERE ${active}`).bind(JSON.stringify(metadata), image, await imageProposalDigest(metadata, image), Date.now(), ...bindings).run();
}
