import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  payload: text("payload").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const stateOperations = sqliteTable("state_operations", {
  accountId: text("account_id").notNull(),
  operationId: text("operation_id").notNull(),
  baseRevision: integer("base_revision").notNull(),
  resultRevision: integer("result_revision").notNull(),
  requestChecksum: text("request_checksum").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.accountId, table.operationId] }),
  index("state_operations_account_created_idx").on(table.accountId, table.createdAt),
]);

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  adultProfileId: text("adult_profile_id"),
});

export const therapistCredentials = sqliteTable("therapist_credentials", {
  loginEmail: text("login_email").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  therapistId: text("therapist_id").notNull(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sharedLaunches = sqliteTable("shared_launches", {
  token: text("token").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  kind: text("kind").notNull(),
  contentId: text("content_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull().default(""), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
});

export const adultProfiles = sqliteTable("adult_profiles", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), emailNormalized: text("email_normalized").notNull(), role: text("role").notNull(), pinHash: text("pin_hash"), position: integer("position").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const children = sqliteTable("children", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), birthYear: text("birth_year").notNull(), notes: text("notes").notNull(), avatarColor: text("avatar_color").notNull(), position: integer("position").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const adultChildAccess = sqliteTable("adult_child_access", {
  accountId: text("account_id").notNull(), adultId: text("adult_id").notNull(), childId: text("child_id").notNull(), position: integer("position").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.adultId, table.childId] })]);

export const accountPreferences = sqliteTable("account_preferences", {
  accountId: text("account_id").primaryKey(), activeChildId: text("active_child_id"), activeSequenceId: text("active_sequence_id"), themePalette: text("theme_palette").notNull(), controlShape: text("control_shape").notNull(), revision: integer("revision").notNull(), updatedAt: integer("updated_at").notNull(),
});

export const categories = sqliteTable("categories", {
  accountId: text("account_id").notNull(), name: text("name").notNull(), normalizedName: text("normalized_name").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.name] })]);

export const mediaAssets = sqliteTable("media_assets", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), r2ObjectId: text("r2_object_id"), localPath: text("local_path"), imagePath: text("image_path"), imageKey: text("image_key"), emoji: text("emoji"), sourceName: text("source_name").notNull(), sourceUrl: text("source_url"), licenseName: text("license_name").notNull(), licenseUrl: text("license_url"), author: text("author").notNull(), isPrivateUpload: integer("is_private_upload", { mode: "boolean" }).notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const soundAssets = sqliteTable("sound_assets", {
  accountId: text("account_id").notNull(),
  id: text("id").notNull(),
  name: text("name").notNull(),
  cue: text("cue").notNull(),
  contentType: text("content_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] }), index("sound_assets_account_cue_idx").on(table.accountId, table.cue)]);

export const libraryItems = sqliteTable("library_items", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), word: text("word").notNull(), normalizedWord: text("normalized_word").notNull(), categoryName: text("category_name").notNull(), article: text("article"), syllabification: text("syllabification"), syllableCount: integer("syllable_count"), syllableStatus: text("syllable_status"), mediaAssetId: text("media_asset_id"), sourceName: text("source_name").notNull(), sourceUrl: text("source_url"), licenseName: text("license_name").notNull(), licenseUrl: text("license_url"), author: text("author").notNull(), position: integer("position").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const exercises = sqliteTable("exercises", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), ownerAdultId: text("owner_adult_id"), title: text("title").notNull(), kind: text("kind").notNull(), recognitionMode: text("recognition_mode"), presentation: text("presentation"), autoPronounce: integer("auto_pronounce", { mode: "boolean" }).notNull(), autoPronounceConfigured: integer("auto_pronounce_configured", { mode: "boolean" }).notNull(), rounds: integer("rounds"), distractorCount: integer("distractor_count"), distractorSource: text("distractor_source"), syllableFilter: text("syllable_filter"), quantityMin: integer("quantity_min"), quantityMax: integer("quantity_max"), quantityObjectSet: text("quantity_object_set"), quantityAutoComplete: integer("quantity_auto_complete", { mode: "boolean" }).notNull().default(false), quantityIdleSeconds: integer("quantity_idle_seconds").notNull().default(3), sourceExerciseId: text("source_exercise_id"), position: integer("position").notNull(), version: integer("version").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const exerciseItems = sqliteTable("exercise_items", {
  accountId: text("account_id").notNull(), exerciseId: text("exercise_id").notNull(), libraryItemId: text("library_item_id").notNull(), role: text("role").notNull(), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.exerciseId, table.role, table.libraryItemId] })]);

export const exerciseCategories = sqliteTable("exercise_categories", {
  accountId: text("account_id").notNull(), exerciseId: text("exercise_id").notNull(), categoryName: text("category_name").notNull(), role: text("role").notNull(), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.exerciseId, table.role, table.categoryName] })]);

export const sequences = sqliteTable("sequences", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), ownerAdultId: text("owner_adult_id").notNull(), title: text("title").notNull(), lastUsedAt: integer("last_used_at"), position: integer("position").notNull(), version: integer("version").notNull(), deletedAt: integer("deleted_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const sequenceExercises = sqliteTable("sequence_exercises", {
  accountId: text("account_id").notNull(), sequenceId: text("sequence_id").notNull(), exerciseId: text("exercise_id").notNull(), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.sequenceId, table.position] })]);

export const sessions = sqliteTable("sessions", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), childId: text("child_id").notNull(), adultId: text("adult_id").notNull(), title: text("title").notNull(), source: text("source").notNull(), mode: text("mode").notNull(), presentation: text("presentation").notNull(), status: text("status").notNull(), startedAt: integer("started_at").notNull(), completedAt: integer("completed_at"), comment: text("comment").notNull(), position: integer("position").notNull(), deletedAt: integer("deleted_at"), updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const sessionItems = sqliteTable("session_items", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), sessionId: text("session_id").notNull(), position: integer("position").notNull(), exerciseId: text("exercise_id"), exerciseTitle: text("exercise_title").notNull(), kind: text("kind").notNull(), presentation: text("presentation"),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const sessionItemContent = sqliteTable("session_item_content", {
  accountId: text("account_id").notNull(), sessionItemId: text("session_item_id").notNull(), role: text("role").notNull(), position: integer("position").notNull(), libraryItemId: text("library_item_id"), wordSnapshot: text("word_snapshot").notNull(), categorySnapshot: text("category_snapshot").notNull(), emojiSnapshot: text("emoji_snapshot"), imagePathSnapshot: text("image_path_snapshot"), imageKeySnapshot: text("image_key_snapshot"), remoteImageId: text("remote_image_id"),
}, (table) => [primaryKey({ columns: [table.accountId, table.sessionItemId, table.role, table.position] })]);

export const attempts = sqliteTable("attempts", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), sessionId: text("session_id"), sessionItemId: text("session_item_id"), exerciseId: text("exercise_id").notNull(), childId: text("child_id"), adultId: text("adult_id"), wordId: text("word_id"), answerId: text("answer_id").notNull(), answerLabelSnapshot: text("answer_label_snapshot").notNull(), correct: integer("correct", { mode: "boolean" }).notNull(), attemptOrdinal: integer("attempt_ordinal").notNull(), mode: text("mode").notNull(), position: integer("position").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const helpEvents = sqliteTable("help_events", {
  accountId: text("account_id").notNull(), id: text("id").notNull(), sessionId: text("session_id"), sessionItemId: text("session_item_id"), exerciseId: text("exercise_id").notNull(), childId: text("child_id"), adultId: text("adult_id"), wordId: text("word_id"), mode: text("mode"), label: text("label").notNull(), position: integer("position").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.id] })]);

export const dataMigrations = sqliteTable("data_migrations", {
  accountId: text("account_id").notNull(), migrationKey: text("migration_key").notNull(), sourceRevision: integer("source_revision").notNull(), sourceChecksum: text("source_checksum").notNull(), status: text("status").notNull(), details: text("details"), startedAt: integer("started_at").notNull(), completedAt: integer("completed_at"),
}, (table) => [primaryKey({ columns: [table.accountId, table.migrationKey] })]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), adultId: text("adult_id"), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id"), createdAt: integer("created_at").notNull(),
});

export const attemptOptions = sqliteTable("attempt_options", {
  accountId: text("account_id").notNull(), attemptId: text("attempt_id").notNull(), position: integer("position").notNull(), libraryItemId: text("library_item_id").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.attemptId, table.position] })]);

export const sessionItemResponses = sqliteTable("session_item_responses", {
  accountId: text("account_id").notNull(), sessionItemId: text("session_item_id").notNull(), position: integer("position").notNull(), answerId: text("answer_id").notNull(), labelSnapshot: text("label_snapshot").notNull(), correct: integer("correct", { mode: "boolean" }).notNull(), firstAttempt: integer("first_attempt", { mode: "boolean" }).notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.sessionItemId, table.position] })]);

export const sessionItemHelpLabels = sqliteTable("session_item_help_labels", {
  accountId: text("account_id").notNull(), sessionItemId: text("session_item_id").notNull(), position: integer("position").notNull(), labelSnapshot: text("label_snapshot").notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.sessionItemId, table.position] })]);
