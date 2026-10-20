export const RELATIONAL_MIGRATION_KEY = "snapshot-to-relational-v3";

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
    session_item_responses: Row[];
    session_item_help_labels: Row[];
    attempts: Row[];
    attempt_options: Row[];
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
    image_path_snapshot: optionalString(value.image),
    image_key_snapshot: optionalString(value.imageKey),
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
    adult_profiles: [], children: [], adult_child_access: [], account_preferences: [], categories: [], media_assets: [], library_items: [], exercises: [], exercise_items: [], exercise_categories: [], sequences: [], sequence_exercises: [], sessions: [], session_items: [], session_item_content: [], session_item_responses: [], session_item_help_labels: [], attempts: [], attempt_options: [], help_events: [],
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

  for (const [position, adult] of adults.entries()) {
    const id = string(adult.id);
    if (!id) { warnings.push("adult_without_id"); continue; }
    requiredAdultIds.delete(id);
    tables.adult_profiles.push({
      account_id: accountId, id, first_name: string(adult.firstName), last_name: string(adult.lastName),
      email_normalized: normalized(string(adult.email, `archived-${id}@invalid.local`)), role: string(adult.role, "Terapista"),
      pin_hash: optionalString(adult.pinHash), position, deleted_at: null, created_at: now, updated_at: now,
    });
  }
  for (const id of requiredAdultIds) {
    warnings.push(`archived_adult:${id}`);
    tables.adult_profiles.push({ account_id: accountId, id, first_name: "Profilo", last_name: "rimosso", email_normalized: `archived-${accountId}-${id}@invalid.local`, role: "Terapista", pin_hash: null, position: tables.adult_profiles.length, deleted_at: now, created_at: now, updated_at: now });
  }

  const requiredChildIds = new Set<string>();
  histories.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  attempts.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  helps.forEach((item) => { const id = string(item.childId); if (id) requiredChildIds.add(id); });
  for (const [position, child] of children.entries()) {
    const id = string(child.id);
    if (!id) { warnings.push("child_without_id"); continue; }
    requiredChildIds.delete(id);
    tables.children.push({ account_id: accountId, id, first_name: string(child.firstName), last_name: string(child.lastName), birth_year: string(child.birthYear), notes: string(child.notes), avatar_color: string(child.avatarColor), position, deleted_at: null, created_at: now, updated_at: now });
  }
  for (const id of requiredChildIds) {
    warnings.push(`archived_child:${id}`);
    tables.children.push({ account_id: accountId, id, first_name: "Profilo", last_name: "rimosso", birth_year: "", notes: "", avatar_color: "", position: tables.children.length, deleted_at: now, created_at: now, updated_at: now });
  }

  for (const adult of adults) {
    const adultId = string(adult.id);
    for (const [position, childId] of strings(adult.childIds).entries()) {
      if (adultId && tables.children.some((child) => child.id === childId)) tables.adult_child_access.push({ account_id: accountId, adult_id: adultId, child_id: childId, position, created_at: now });
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

  for (const [position, item] of library.entries()) {
    const id = string(item.id);
    if (!id) { warnings.push("library_item_without_id"); continue; }
    const hasMedia = Boolean(item.remoteImageId || item.image || item.imageKey || item.emoji);
    if (hasMedia) tables.media_assets.push({ account_id: accountId, id, r2_object_id: optionalString(item.remoteImageId), local_path: optionalString(item.image) ?? optionalString(item.imageKey), image_path: optionalString(item.image), image_key: optionalString(item.imageKey), emoji: optionalString(item.emoji), source_name: string(item.source), source_url: optionalString(item.sourceUrl), license_name: string(item.license), license_url: optionalString(item.licenseUrl), author: string(item.author), is_private_upload: item.privateUpload ? 1 : 0, deleted_at: deletedTime(item.deleted, now), created_at: now });
    tables.library_items.push({ account_id: accountId, id, word: string(item.word, "Elemento archiviato"), normalized_word: normalized(string(item.word, "Elemento archiviato")), category_name: string(item.category, "Altro"), article: optionalString(item.article), syllabification: optionalString(item.syllabification), syllable_count: integer(item.syllableCount), syllable_status: optionalString(item.syllableStatus), media_asset_id: hasMedia ? id : null, source_name: string(item.source), source_url: optionalString(item.sourceUrl), license_name: string(item.license), license_url: optionalString(item.licenseUrl), author: string(item.author), position, deleted_at: deletedTime(item.deleted, now), created_at: now, updated_at: now });
  }

  const libraryIds = new Set(tables.library_items.map((item) => String(item.id)));
  const addExerciseItems = (exerciseId: string, role: string, ids: string[]) => ids.forEach((libraryItemId, position) => {
    if (libraryIds.has(libraryItemId)) addUnique(tables.exercise_items, ["account_id", "exercise_id", "role", "library_item_id"], { account_id: accountId, exercise_id: exerciseId, library_item_id: libraryItemId, role, position });
    else warnings.push(`missing_library_item:${exerciseId}:${libraryItemId}`);
  });
  const addExerciseCategories = (exerciseId: string, role: string, names: string[]) => names.forEach((name, position) => addUnique(tables.exercise_categories, ["account_id", "exercise_id", "role", "category_name"], { account_id: accountId, exercise_id: exerciseId, category_name: name, role, position }));

  for (const [position, exercise] of list(state.exercises).entries()) {
    const id = string(exercise.id);
    if (!id) { warnings.push("exercise_without_id"); continue; }
    const updatedAt = time(exercise.updatedAt, now);
    tables.exercises.push({ account_id: accountId, id, owner_adult_id: null, title: string(exercise.title, "Esercizio"), kind: string(exercise.kind, "recognition"), recognition_mode: optionalString(exercise.recognitionMode), presentation: optionalString(exercise.presentation), auto_pronounce: exercise.autoPronounce ? 1 : 0, auto_pronounce_configured: typeof exercise.autoPronounce === "boolean" ? 1 : 0, rounds: integer(exercise.rounds), distractor_count: integer(exercise.distractorCount), distractor_source: optionalString(exercise.distractorSource), syllable_filter: optionalString(exercise.recognitionSyllables), source_exercise_id: optionalString(exercise.sourceExerciseId), position, version: 1, deleted_at: deletedTime(exercise.deleted, now), created_at: updatedAt, updated_at: updatedAt });
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
  for (const [position, sequence] of sequences.entries()) {
    const id = string(sequence.id);
    const owner = string(sequence.therapistId);
    if (!id || !owner) { warnings.push(`invalid_sequence:${id}`); continue; }
    const updatedAt = time(sequence.updatedAt, now);
    tables.sequences.push({ account_id: accountId, id, owner_adult_id: owner, title: string(sequence.title, "Sequenza"), last_used_at: sequence.lastUsedAt ? time(sequence.lastUsedAt, now) : null, position, version: 1, deleted_at: deletedTime(sequence.deleted, now), created_at: updatedAt, updated_at: updatedAt });
    strings(sequence.exerciseIds).forEach((exerciseId, position) => {
      if (exerciseIds.has(exerciseId)) tables.sequence_exercises.push({ account_id: accountId, sequence_id: id, exercise_id: exerciseId, position });
      else warnings.push(`missing_sequence_exercise:${id}:${exerciseId}`);
    });
  }

  const historyResponses = new Map<string, JsonObject>();
  for (const [position, history] of histories.entries()) {
    const sessionId = string(history.id);
    const childId = string(history.childId);
    const adultId = string(history.therapistId);
    if (!sessionId || !childId || !adultId) { warnings.push(`invalid_session:${sessionId}`); continue; }
    const completedAt = time(history.completedAt, now);
    tables.sessions.push({ account_id: accountId, id: sessionId, child_id: childId, adult_id: adultId, title: string(history.title, "Sessione"), source: string(history.source, "sequence"), mode: string(history.mode, "test"), presentation: string(history.presentation, "images"), status: "completed", started_at: time(history.startedAt, completedAt), completed_at: completedAt, comment: string(history.comment), position, deleted_at: deletedTime(history.deletedAt, now), updated_at: completedAt });
    list(history.items).forEach((item, position) => {
      const itemId = string(item.id, `${sessionId}:item:${position}`);
      tables.session_items.push({ account_id: accountId, id: itemId, session_id: sessionId, position, exercise_id: optionalString(item.exerciseId), exercise_title: string(item.exerciseTitle, "Esercizio archiviato"), kind: string(item.kind, "recognition"), presentation: optionalString(item.presentation) });
      const target = object(item.target);
      if (target) tables.session_item_content.push(itemSnapshot(accountId, itemId, "target", 0, target));
      list(item.options).forEach((option, optionPosition) => tables.session_item_content.push(itemSnapshot(accountId, itemId, "option", optionPosition, option)));
      list(item.responses).forEach((response, responsePosition) => {
        historyResponses.set(`${itemId}\u0000${string(response.answerId)}\u0000${string(response.createdAt)}`, response);
        tables.session_item_responses.push({ account_id: accountId, session_item_id: itemId, position: responsePosition, answer_id: string(response.answerId), label_snapshot: string(response.label, string(response.answerId)), correct: response.correct ? 1 : 0, first_attempt: response.firstAttempt ? 1 : 0, created_at: time(response.createdAt, completedAt) });
      });
      strings(item.helpLabels).forEach((label, helpPosition) => tables.session_item_help_labels.push({ account_id: accountId, session_item_id: itemId, position: helpPosition, label_snapshot: label }));
    });
  }

  const ordinalByItem = new Map<string, number>();
  for (const [position, attempt] of attempts.entries()) {
    const id = string(attempt.id);
    if (!id) { warnings.push("attempt_without_id"); continue; }
    const itemId = optionalString(attempt.sessionItemId);
    const ordinal = itemId ? (ordinalByItem.get(itemId) ?? 0) + 1 : attempt.firstAttempt ? 1 : 2;
    if (itemId) ordinalByItem.set(itemId, ordinal);
    const response = itemId ? historyResponses.get(`${itemId}\u0000${string(attempt.answerId)}\u0000${string(attempt.createdAt)}`) : undefined;
    tables.attempts.push({ account_id: accountId, id, session_id: optionalString(attempt.sessionId), session_item_id: itemId, exercise_id: string(attempt.exerciseId, "unknown"), child_id: optionalString(attempt.childId), adult_id: optionalString(attempt.therapistId), word_id: optionalString(attempt.wordId), answer_id: string(attempt.answerId), answer_label_snapshot: string(response?.label, string(attempt.answerId)), correct: attempt.correct ? 1 : 0, attempt_ordinal: ordinal, mode: string(attempt.mode, "test"), position, created_at: time(attempt.createdAt, now) });
    strings(attempt.optionIds).forEach((libraryItemId, position) => tables.attempt_options.push({ account_id: accountId, attempt_id: id, position, library_item_id: libraryItemId }));
  }

  for (const [position, help] of helps.entries()) {
    const id = string(help.id);
    if (!id) { warnings.push("help_without_id"); continue; }
    tables.help_events.push({ account_id: accountId, id, session_id: optionalString(help.sessionId), session_item_id: optionalString(help.sessionItemId), exercise_id: string(help.exerciseId, "unknown"), child_id: optionalString(help.childId), adult_id: optionalString(help.therapistId), word_id: optionalString(help.wordId), mode: optionalString(help.mode), label: string(help.label), position, created_at: time(help.createdAt, now) });
  }

  return { tables, warnings };
}

export function projectionCounts(projection: RelationalProjection) {
  return Object.fromEntries(Object.entries(projection.tables).map(([name, rows]) => [name, rows.length]));
}

const parityEntities = {
  adult_profiles: "therapists",
  children: "children",
  library_items: "library",
  exercises: "exercises",
  sequences: "sequences",
  attempts: "attempts",
  help_events: "helps",
  sessions: "sessionHistory",
} as const;

export function relationalParityReport(state: unknown, projection: RelationalProjection, snapshotRevision: number, relationalRevision: number, sourceChecksumMatches = true) {
  const source = object(state) ?? {};
  const mismatches: string[] = [];
  for (const [table, stateKey] of Object.entries(parityEntities)) {
    const legacyIds = list(source[stateKey]).map((item) => string(item.id)).filter(Boolean).sort();
    const rows = projection.tables[table as keyof RelationalProjection["tables"]];
    const relationalIds = rows.filter((row) => (table === "adult_profiles" || table === "children") ? row.deleted_at === null : true).map((row) => string(row.id)).filter(Boolean).sort();
    if (legacyIds.length !== relationalIds.length || legacyIds.some((id, index) => id !== relationalIds[index])) mismatches.push(table);
  }
  const blockingWarnings = projection.warnings.filter((warning) => !warning.startsWith("archived_adult:") && !warning.startsWith("archived_child:"));
  return {
    ready: relationalRevision === snapshotRevision && sourceChecksumMatches && mismatches.length === 0 && blockingWarnings.length === 0,
    snapshotRevision,
    relationalRevision,
    sourceChecksumMatches,
    mismatches,
    warningCount: projection.warnings.length,
    blockingWarningCount: blockingWarnings.length,
    counts: projectionCounts(projection),
  };
}

function definedEntries(entries: Array<[string, unknown]>) {
  return Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined));
}

function iso(value: unknown) {
  return new Date(Number(value)).toISOString();
}

function rowsFor(rows: Row[], key: string, value: unknown) {
  return rows.filter((row) => row[key] === value).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

function ordered(rows: Row[]) {
  return [...rows].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

/** Rebuilds the compatibility BackendState shape from normalized rows. */
export function rebuildLegacyState(projection: RelationalProjection) {
  const { tables } = projection;
  const activeAdults = ordered(tables.adult_profiles.filter((row) => row.deleted_at === null));
  const activeChildren = ordered(tables.children.filter((row) => row.deleted_at === null));
  const mediaById = new Map(tables.media_assets.map((row) => [row.id, row]));

  const therapists = activeAdults.map((row) => definedEntries([
    ["id", row.id], ["firstName", row.first_name], ["lastName", row.last_name], ["email", row.email_normalized], ["role", row.role], ["pinHash", row.pin_hash],
    ["childIds", rowsFor(tables.adult_child_access, "adult_id", row.id).map((access) => access.child_id)],
  ]));
  const children = activeChildren.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, birthYear: row.birth_year, notes: row.notes, avatarColor: row.avatar_color }));
  const library = ordered(tables.library_items).map((row) => {
    const media = row.media_asset_id ? mediaById.get(row.media_asset_id) : undefined;
    return definedEntries([
      ["id", row.id], ["word", row.word], ["image", media?.image_path], ["imageKey", media?.image_key], ["remoteImageId", media?.r2_object_id], ["emoji", media?.emoji],
      ["category", row.category_name], ["source", row.source_name], ["sourceUrl", row.source_url], ["license", row.license_name], ["licenseUrl", row.license_url], ["author", row.author],
      ["article", row.article], ["syllabification", row.syllabification], ["syllableCount", row.syllable_count], ["syllableStatus", row.syllable_status], ["privateUpload", media?.is_private_upload ? true : undefined], ["deleted", row.deleted_at === null ? undefined : true],
    ]);
  });
  const exerciseRole = (exerciseId: unknown, role: string) => rowsFor(tables.exercise_items.filter((row) => row.role === role), "exercise_id", exerciseId).map((row) => row.library_item_id);
  const categoryRole = (exerciseId: unknown, role: string) => rowsFor(tables.exercise_categories.filter((row) => row.role === role), "exercise_id", exerciseId).map((row) => row.category_name);
  const exercises = ordered(tables.exercises).map((row) => definedEntries([
    ["id", row.id], ["title", row.title], ["kind", row.kind], ["promptId", exerciseRole(row.id, "prompt")[0]], ["optionIds", exerciseRole(row.id, "option")],
    ["articleItemIds", exerciseRole(row.id, "article_pool").length ? exerciseRole(row.id, "article_pool") : undefined],
    ["categoryItemIds", exerciseRole(row.id, "category_pool").length ? exerciseRole(row.id, "category_pool") : undefined],
    ["categoryNames", categoryRole(row.id, "category_target").length ? categoryRole(row.id, "category_target") : undefined],
    ["recognitionMode", row.recognition_mode], ["recognitionItemIds", exerciseRole(row.id, "recognition_pool").length ? exerciseRole(row.id, "recognition_pool") : undefined],
    ["recognitionCategories", categoryRole(row.id, "recognition_filter").length ? categoryRole(row.id, "recognition_filter") : undefined], ["recognitionSyllables", row.syllable_filter],
    ["namingItemIds", exerciseRole(row.id, "naming_pool").length ? exerciseRole(row.id, "naming_pool") : undefined], ["namingCategories", categoryRole(row.id, "naming_filter").length ? categoryRole(row.id, "naming_filter") : undefined],
    ["distractorCount", row.distractor_count], ["distractorSource", row.distractor_source], ["presentation", row.presentation], ["autoPronounce", row.auto_pronounce_configured ? Boolean(row.auto_pronounce) : undefined], ["rounds", row.rounds], ["sourceExerciseId", row.source_exercise_id], ["updatedAt", iso(row.updated_at)], ["deleted", row.deleted_at === null ? undefined : true],
  ]));
  const sequences = ordered(tables.sequences).map((row) => definedEntries([
    ["id", row.id], ["title", row.title], ["exerciseIds", rowsFor(tables.sequence_exercises, "sequence_id", row.id).map((item) => item.exercise_id)], ["therapistId", row.owner_adult_id], ["updatedAt", iso(row.updated_at)], ["lastUsedAt", row.last_used_at === null ? undefined : iso(row.last_used_at)], ["deleted", row.deleted_at === null ? undefined : true],
  ]));
  const optionsByAttempt = (attemptId: unknown) => rowsFor(tables.attempt_options, "attempt_id", attemptId).map((row) => row.library_item_id);
  const attempts = ordered(tables.attempts).map((row) => definedEntries([
    ["id", row.id], ["sessionId", row.session_id], ["sessionItemId", row.session_item_id], ["exerciseId", row.exercise_id], ["wordId", row.word_id], ["answerId", row.answer_id], ["optionIds", optionsByAttempt(row.id).length ? optionsByAttempt(row.id) : undefined], ["correct", Boolean(row.correct)], ["firstAttempt", row.attempt_ordinal === 1], ["mode", row.mode], ["createdAt", iso(row.created_at)], ["childId", row.child_id], ["therapistId", row.adult_id],
  ]));
  const helps = ordered(tables.help_events).map((row) => definedEntries([
    ["id", row.id], ["sessionId", row.session_id], ["sessionItemId", row.session_item_id], ["exerciseId", row.exercise_id], ["wordId", row.word_id], ["mode", row.mode], ["label", row.label], ["createdAt", iso(row.created_at)], ["childId", row.child_id], ["therapistId", row.adult_id],
  ]));
  const snapshot = (row: Row) => definedEntries([["itemId", row.library_item_id], ["word", row.word_snapshot], ["category", row.category_snapshot], ["emoji", row.emoji_snapshot], ["image", row.image_path_snapshot], ["imageKey", row.image_key_snapshot], ["remoteImageId", row.remote_image_id]]);
  const sessionHistory = ordered(tables.sessions).map((session) => ({
    id: session.id, childId: session.child_id, therapistId: session.adult_id, title: session.title, source: session.source, mode: session.mode, presentation: session.presentation,
    startedAt: iso(session.started_at), completedAt: iso(session.completed_at ?? session.updated_at), comment: session.comment,
    items: rowsFor(tables.session_items, "session_id", session.id).map((item) => {
      const content = rowsFor(tables.session_item_content, "session_item_id", item.id);
      const responses = rowsFor(tables.session_item_responses, "session_item_id", item.id).map((response) => ({ answerId: response.answer_id, label: response.label_snapshot, correct: Boolean(response.correct), firstAttempt: Boolean(response.first_attempt), createdAt: iso(response.created_at) }));
      return definedEntries([
        ["id", item.id], ["exerciseId", item.exercise_id ?? ""], ["exerciseTitle", item.exercise_title], ["kind", item.kind], ["presentation", item.presentation],
        ["target", content.find((entry) => entry.role === "target") ? snapshot(content.find((entry) => entry.role === "target")!) : undefined], ["options", content.filter((entry) => entry.role === "option").map(snapshot)],
        ["responses", responses], ["helpLabels", rowsFor(tables.session_item_help_labels, "session_item_id", item.id).map((entry) => entry.label_snapshot)], ["firstCorrect", Boolean(responses.find((response) => response.firstAttempt)?.correct)],
      ]);
    }),
    ...(session.deleted_at === null ? {} : { deletedAt: iso(session.deleted_at) }),
  }));
  const preferences = tables.account_preferences[0];
  return {
    schemaVersion: 1 as const,
    therapists, children,
    activeChildId: preferences?.active_child_id ?? "",
    ...(preferences?.active_sequence_id ? { activeSequenceId: preferences.active_sequence_id } : {}),
    library, exercises, sequences, attempts, helps, sessionHistory,
    appearance: { palette: preferences?.theme_palette ?? "violet", shape: preferences?.control_shape ?? "soft" },
  };
}
