export const RELATIONAL_MIGRATION_KEY = "snapshot-to-relational-v1";

type JsonObject = Record<string, unknown>;
type Row = Record<string, string | number | null>;

export type RelationalProjection = {
  tables: {
    adult_profiles: Row[];
    children: Row[];
    adult_child_access: Row[];
    account_preferences: Row[];
    categories: Row[];
    media_assets: Row[];
    library_items: Row[];
    exercises: Row[];
    exercise_items: Row[];
    exercise_categories: Row[];
    sequences: Row[];
    sequence_exercises: Row[];
    sessions: Row[];
    session_items: Row[];
    session_item_content: Row[];
    attempts: Row[];
    help_events: Row[];
  };
  warnings: string[];
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function list(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  const result = string(value).trim();
  return result || null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function time(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("it-IT");
}

function deletedTime(value: unknown, fallback: number) {
  return value ? time(value, fallback) : null;
}

function addUnique(rows: Row[], keys: string[], row: Row) {
  if (!rows.some((candidate) => keys.every((key) => candidate[key] === row[key]))) rows.push(row);
}

function itemSnapshot(accountId: string, sessionItemId: string, role: "target" | "option", position: number, value: JsonObject): Row {
  return {
    account_id: accountId,
    session_item_id: sessionItemId,
    role,
    position,
    library_item_id: optionalString(value.itemId),
    word_snapshot: string(value.word, "Elemento archiviato"),
    category_snapshot: string(value.category, "Altro"),
    emoji_snapshot: optionalString(value.emoji),
    image_path_snapshot: optionalString(value.image) ?? optionalString(value.imageKey),
    remote_image_id: optionalString(value.remoteImageId),
  };
}

/**
 * Converts the legacy account snapshot into deterministic relational rows.
 * It performs no I/O, so migration previews and production writes share the
 * exact same conversion and can be compared before cutover.
 */
export function projectLegacyState(input: unknown, accountId: string, now = Date.now()): RelationalProjection {
  const state = object(input);
  if (!state || state.schemaVersion !== 1) throw new Error("invalid_legacy_state");

  const warnings: string[] = [];
  const tables: RelationalProjection["tables"] = {
    adult_profiles: [], children: [], adult_child_access: [], account_preferences: [], categories: [], media_assets: [], library_items: [], exercises: [], exercise_items: [], exercise_categories: [], sequences: [], sequence_exercises: [], sessions: [], session_items: [], session_item_content: [], attempts: [], help_events: [],
  };

  const adults = list(state.therapists);
  const children = list(state.children);
  const histories = list(state.sessionHistory);
  const sequences = list(state.sequences);
  const attempts = list(state.attempts);
  const helps = list(state.helps);

  const requiredAdultIds = new Set<string>();
  sequences.forEach((item) => { const id = string(item.therapistId); if (id) requiredAdultIds.add(id); });
  histories.forEach((item) => { const id = string(item.therapistId); if (id) requiredAdultIds.add(id); });
  attempts.forEach((item) => { const id = string(item.therapistId); if (id) requiredAdultIds.add(id); });
  helps.forEach((item) => { const id = string(item.therapistId); if (id) requiredAdultIds.add(id); });

  for (const adult of adults) {
    const id = string(adult.id);
    if (!id) { warnings.push("adult_without_id"); continue; }
    requiredAdultIds.delete(id);
    tables.adult_profiles.push({
      account_id: accountId, id, first_name: string(adult.firstName), last_name: string(adult.lastName),
      email_normalized: normalized(string(adult.email, `archived-${id}@invalid.local`)), role: string(adult.role, "Terapista"),
      pin_hash: optionalString(adult.pinHash), deleted_at: null, created_at: now, updated_at: now,
    });
  }
  for (const id of requiredAdultIds) {
    warnings.push(`archived_adult:${id}`);
    tables.adult_profiles.push({ account_id: accountId, id, first_name: "Profilo", last_name: "rimosso", email_normalized: `archived-${accountId}-${id}@invalid.local`, role: "Terapista", pin_hash: null, deleted_at: now, created_at: now, updated_at: now });
  }

  const requiredChildIds = new Set<string>();
  histories.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  attempts.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  helps.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  for (const child of children) {
    const id = string(child.id);
    if (!id) { warnings.push("child_without_id"); continue; }
    requiredChildIds.delete(id);
    tables.children.push({ account_id: accountId, id, first_name: string(child.firstName), last_name: string(child.lastName), birth_year: string(child.birthYear), notes: string(child.notes), avatar_color: string(child.avatarColor), deleted_at: null, created_at: now, updated_at: now });
  }
  for (const id of requiredChildIds) {
    warnings.push(`archived_child:${id}`);
    tables.children.push({ account_id: accountId, id, first_name: "Profilo", last_name: "rimosso", birth_year: "", notes: "", avatar_color: "", deleted_at: now, created_at: now, updated_at: now });
  }

  for (const adult of adults) {
    const adultId = string(adult.id);
    for (const childId of strings(adult.childIds)) {
      if (adultId && tables.children.some((child) => child.id === childId)) tables.adult_child_access.push({ account_id: accountId, adult_id: adultId, child_id: childId, created_at: now });
      else warnings.push(`invalid_adult_child_access:${adultId}:${childId}`);
    }
  }

  const appearance = object(state.appearance) ?? {};
  tables.account_preferences.push({ account_id: accountId, active_child_id: optionalString(state.activeChildId), active_sequence_id: optionalString(state.activeSequenceId), theme_palette: string(appearance.palette, "violet"), control_shape: string(appearance.shape, "soft"), revision: 1, updated_at: now });

  const library = list(state.library);
  const categoryNames = new Set<string>(["Altro"]);
  library.forEach((item) => categoryNames.add(string(item.category, "Altro")));
  for (const exercise of list(state.exercises)) {
    strings(exercise.categoryNames).forEach((name) => categoryNames.add(name));
    strings(exercise.recognitionCategories).forEach((name) => categoryNames.add(name));
    strings(exercise.namingCategories).forEach((name) => categoryNames.add(name));
  }
  for (const name of categoryNames) tables.categories.push({ account_id: accountId, name, normalized_name: normalized(name), deleted_at: null, created_at: now, updated_at: now });

  for (const item of library) {
    const id = string(item.id);
    if (!id) { warnings.push("library_item_without_id"); continue; }
    const hasMedia = Boolean(item.remoteImageId || item.image || item.imageKey || item.emoji);
    if (hasMedia) tables.media_assets.push({ account_id: accountId, id, r2_object_id: optionalString(item.remoteImageId), local_path: optionalString(item.image) ?? optionalString(item.imageKey), emoji: optionalString(item.emoji), source_name: string(item.source), source_url: optionalString(item.sourceUrl), license_name: string(item.license), license_url: optionalString(item.licenseUrl), author: string(item.author), is_private_upload: item.privateUpload ? 1 : 0, deleted_at: deletedTime(item.deleted, now), created_at: now });
    tables.library_items.push({ account_id: accountId, id, word: string(item.word, "Elemento archiviato"), normalized_word: normalized(string(item.word, "Elemento archiviato")), category_name: string(item.category, "Altro"), article: optionalString(item.article), syllabification: optionalString(item.syllabification), syllable_count: integer(item.syllableCount), syllable_status: optionalString(item.syllableStatus), media_asset_id: hasMedia ? id : null, deleted_at: deletedTime(item.deleted, now), created_at: now, updated_at: now });
  }

  const libraryIds = new Set(tables.library_items.map((item) => String(item.id)));
  const addExerciseItems = (exerciseId: string, role: string, ids: string[]) => ids.forEach((libraryItemId, position) => {
    if (libraryIds.has(libraryItemId)) addUnique(tables.exercise_items, ["account_id", "exercise_id", "role", "library_item_id"], { account_id: accountId, exercise_id: exerciseId, library_item_id: libraryItemId, role, position });
    else warnings.push(`missing_library_item:${exerciseId}:${libraryItemId}`);
  });
  const addExerciseCategories = (exerciseId: string, role: string, names: string[]) => names.forEach((name, position) => addUnique(tables.exercise_categories, ["account_id", "exercise_id", "role", "category_name"], { account_id: accountId, exercise_id: exerciseId, category_name: name, role, position }));

  for (const exercise of list(state.exercises)) {
    const id = string(exercise.id);
    if (!id) { warnings.push("exercise_without_id"); continue; }
    const updatedAt = time(exercise.updatedAt, now);
    tables.exercises.push({ account_id: accountId, id, owner_adult_id: null, title: string(exercise.title, "Esercizio"), kind: string(exercise.kind, "recognition"), recognition_mode: optionalString(exercise.recognitionMode), presentation: optionalString(exercise.presentation), auto_pronounce: exercise.autoPronounce ? 1 : 0, rounds: integer(exercise.rounds), distractor_count: integer(exercise.distractorCount), distractor_source: optionalString(exercise.distractorSource), syllable_filter: optionalString(exercise.recognitionSyllables), version: 1, deleted_at: deletedTime(exercise.deleted, now), created_at: updatedAt, updated_at: updatedAt });
    if (typeof exercise.promptId === "string") addExerciseItems(id, "prompt", [exercise.promptId]);
    addExerciseItems(id, "option", strings(exercise.optionIds));
    addExerciseItems(id, "recognition_pool", strings(exercise.recognitionItemIds));
    addExerciseItems(id, "article_pool", strings(exercise.articleItemIds));
    addExerciseItems(id, "category_pool", strings(exercise.categoryItemIds));
    addExerciseItems(id, "naming_pool", strings(exercise.namingItemIds));
    addExerciseCategories(id, "recognition_filter", strings(exercise.recognitionCategories));
    addExerciseCategories(id, "category_target", strings(exercise.categoryNames));
    addExerciseCategories(id, "naming_filter", strings(exercise.namingCategories));
  }

  const exerciseIds = new Set(tables.exercises.map((item) => String(item.id)));
  for (const sequence of sequences) {
    const id = string(sequence.id);
    const owner = string(sequence.therapistId);
    if (!id || !owner) { warnings.push(`invalid_sequence:${id}`); continue; }
    const updatedAt = time(sequence.updatedAt, now);
    tables.sequences.push({ account_id: accountId, id, owner_adult_id: owner, title: string(sequence.title, "Sequenza"), last_used_at: sequence.lastUsedAt ? time(sequence.lastUsedAt, now) : null, version: 1, deleted_at: deletedTime(sequence.deleted, now), created_at: updatedAt, updated_at: updatedAt });
    strings(sequence.exerciseIds).forEach((exerciseId, position) => {
      if (exerciseIds.has(exerciseId)) tables.sequence_exercises.push({ account_id: accountId, sequence_id: id, exercise_id: exerciseId, position });
      else warnings.push(`missing_sequence_exercise:${id}:${exerciseId}`);
    });
  }

  const historyResponses = new Map<string, JsonObject>();
  for (const history of histories) {
    const sessionId = string(history.id);
    const childId = string(history.childId);
    const adultId = string(history.therapistId);
    if (!sessionId || !childId || !adultId) { warnings.push(`invalid_session:${sessionId}`); continue; }
    const completedAt = time(history.completedAt, now);
    tables.sessions.push({ account_id: accountId, id: sessionId, child_id: childId, adult_id: adultId, title: string(history.title, "Sessione"), source: string(history.source, "sequence"), mode: string(history.mode, "test"), presentation: string(history.presentation, "images"), status: "completed", started_at: time(history.startedAt, completedAt), completed_at: completedAt, comment: string(history.comment), deleted_at: deletedTime(history.deletedAt, now), updated_at: completedAt });
    list(history.items).forEach((item, position) => {
      const itemId = string(item.id, `${sessionId}:item:${position}`);
      tables.session_items.push({ account_id: accountId, id: itemId, session_id: sessionId, position, exercise_id: optionalString(item.exerciseId), exercise_title: string(item.exerciseTitle, "Esercizio archiviato"), kind: string(item.kind, "recognition"), presentation: optionalString(item.presentation) });
      const target = object(item.target);
      if (target) tables.session_item_content.push(itemSnapshot(accountId, itemId, "target", 0, target));
      list(item.options).forEach((option, optionPosition) => tables.session_item_content.push(itemSnapshot(accountId, itemId, "option", optionPosition, option)));
      list(item.responses).forEach((response) => historyResponses.set(`${itemId}\u0000${string(response.answerId)}\u0000${string(response.createdAt)}`, response));
    });
  }

  const ordinalByItem = new Map<string, number>();
  for (const attempt of attempts.sort((a, b) => time(a.createdAt, 0) - time(b.createdAt, 0))) {
    const id = string(attempt.id);
    if (!id) { warnings.push("attempt_without_id"); continue; }
    const itemId = optionalString(attempt.sessionItemId);
    const ordinal = itemId ? (ordinalByItem.get(itemId) ?? 0) + 1 : attempt.firstAttempt ? 1 : 2;
    if (itemId) ordinalByItem.set(itemId, ordinal);
    const response = itemId ? historyResponses.get(`${itemId}\u0000${string(attempt.answerId)}\u0000${string(attempt.createdAt)}`) : undefined;
    tables.attempts.push({ account_id: accountId, id, session_id: optionalString(attempt.sessionId), session_item_id: itemId, exercise_id: string(attempt.exerciseId, "unknown"), child_id: optionalString(attempt.childId), adult_id: optionalString(attempt.therapistId), word_id: optionalString(attempt.wordId), answer_id: string(attempt.answerId), answer_label_snapshot: string(response?.label, string(attempt.answerId)), correct: attempt.correct ? 1 : 0, attempt_ordinal: ordinal, mode: string(attempt.mode, "test"), created_at: time(attempt.createdAt, now) });
  }

  for (const help of helps) {
    const id = string(help.id);
    if (!id) { warnings.push("help_without_id"); continue; }
    tables.help_events.push({ account_id: accountId, id, session_id: optionalString(help.sessionId), session_item_id: optionalString(help.sessionItemId), exercise_id: string(help.exerciseId, "unknown"), child_id: optionalString(help.childId), adult_id: optionalString(help.therapistId), word_id: optionalString(help.wordId), mode: optionalString(help.mode), label: string(help.label), created_at: time(help.createdAt, now) });
  }

  return { tables, warnings };
}

export function projectionCounts(projection: RelationalProjection) {
  return Object.fromEntries(Object.entries(projection.tables).map(([name, rows]) => [name, rows.length]));
}
