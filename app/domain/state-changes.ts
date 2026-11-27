import { hydrateInterfaceStyle, isInterfaceStyle } from "./appearance.ts";
import { verifyLibraryReplacements } from "./library-deduplication.ts";
import { remapProgramExercises } from "./exercise-library-references.ts";
import type { Exercise, LibraryItem, Sequence } from "../shared/types";

export const STATE_COLLECTIONS = [
  "therapists", "children", "library", "exercises", "sequences", "attempts", "helps", "sessionHistory",
] as const;
const STATE_VALUES = ["activeChildId", "activeSequenceId", "appearance", "soundPreferences", "categorySymbols", "tracingOrderRequired", "interfaceStyle"] as const;
type StateValueName = (typeof STATE_VALUES)[number];

export type StateCollectionName = typeof STATE_COLLECTIONS[number];
type Entity = Record<string, unknown> & { id: string };

export type CollectionChange = {
  upserts: Entity[];
  removedIds: string[];
  order: string[];
};

export type StateChangeRequest = {
  schemaVersion: 1;
  operationId: string;
  baseRevision: number;
  collections: Partial<Record<StateCollectionName, CollectionChange>>;
  values: Partial<Record<StateValueName, unknown>>;
  libraryReplacements?: [string, string][];
};

function document(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_state_document");
  return value as Record<string, unknown>;
}

function entities(value: unknown): Entity[] {
  if (!Array.isArray(value)) throw new Error("invalid_state_collection");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id) throw new Error("invalid_state_entity");
    const entity = item as Entity;
    if (seen.has(entity.id)) throw new Error("duplicate_state_entity");
    seen.add(entity.id);
    return entity;
  });
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergePartialOrder(current: Entity[], nextById: Map<string, Entity>, requestedOrder: string[]) {
  if (requestedOrder.some((id) => !nextById.has(id))) throw new Error("invalid_collection_order");
  const requested = [...requestedOrder];
  const requestedIds = new Set(requestedOrder);
  const result: string[] = [];

  // A role-filtered client does not know the IDs hidden from it. Reuse the
  // existing visible slots for its requested order and leave every unmentioned
  // entity in place. Explicit deletions are represented by removedIds.
  for (const item of current) {
    if (!nextById.has(item.id)) continue;
    if (requestedIds.has(item.id)) {
      const replacement = requested.shift();
      if (replacement) result.push(replacement);
    } else result.push(item.id);
  }
  for (const id of requested) if (!result.includes(id)) result.push(id);
  for (const id of nextById.keys()) if (!result.includes(id)) result.push(id);
  return result;
}

export function buildStateChange(previousValue: unknown, nextValue: unknown, operationId: string, baseRevision: number): StateChangeRequest | null {
  const previous = document(previousValue);
  const next = document(nextValue);
  const collections: StateChangeRequest["collections"] = {};

  for (const key of STATE_COLLECTIONS) {
    const before = entities(previous[key] ?? []);
    const after = entities(next[key] ?? []);
    const beforeById = new Map(before.map((item) => [item.id, item]));
    const afterIds = new Set(after.map((item) => item.id));
    const upserts = after.filter((item) => !sameValue(beforeById.get(item.id), item));
    const removedIds = before.filter((item) => !afterIds.has(item.id)).map((item) => item.id);
    const orderChanged = !sameValue(before.map((item) => item.id), after.map((item) => item.id));
    if (upserts.length || removedIds.length || orderChanged) collections[key] = { upserts, removedIds, order: after.map((item) => item.id) };
  }

  const values: StateChangeRequest["values"] = {};
  for (const key of STATE_VALUES) {
    if (key === "tracingOrderRequired") {
      if ((previous[key] === true) !== (next[key] === true)) values[key] = next[key] === true;
      continue;
    }
    if (key === "interfaceStyle") {
      if (hydrateInterfaceStyle(previous[key]) !== hydrateInterfaceStyle(next[key])) values[key] = hydrateInterfaceStyle(next[key]);
      continue;
    }
    if (!sameValue(previous[key], next[key])) values[key] = next[key] ?? null;
  }
  if (!Object.keys(collections).length && !Object.keys(values).length) return null;
  return { schemaVersion: 1, operationId, baseRevision, collections, values };
}

export function parseStateChangeRequest(value: unknown): StateChangeRequest {
  const request = document(value);
  if (request.schemaVersion !== 1 || typeof request.operationId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(request.operationId) || !Number.isSafeInteger(request.baseRevision) || (request.baseRevision as number) < 1) throw new Error("invalid_state_change");
  const rawCollections = document(request.collections ?? {});
  const collections: StateChangeRequest["collections"] = {};
  for (const [key, rawChange] of Object.entries(rawCollections)) {
    if (!STATE_COLLECTIONS.includes(key as StateCollectionName)) throw new Error("invalid_state_collection_name");
    const change = document(rawChange);
    const upserts = entities(change.upserts ?? []);
    const removedIds = Array.isArray(change.removedIds) && change.removedIds.every((id) => typeof id === "string") ? change.removedIds as string[] : (() => { throw new Error("invalid_removed_ids"); })();
    const order = Array.isArray(change.order) && change.order.every((id) => typeof id === "string") ? change.order as string[] : (() => { throw new Error("invalid_collection_order"); })();
    if (new Set(removedIds).size !== removedIds.length || new Set(order).size !== order.length) throw new Error("duplicate_state_id");
    collections[key as StateCollectionName] = { upserts, removedIds, order };
  }
  const rawValues = document(request.values ?? {});
  if (Object.keys(rawValues).some((key) => !STATE_VALUES.includes(key as StateValueName))) throw new Error("invalid_state_value");
  if ("activeChildId" in rawValues && (typeof rawValues.activeChildId !== "string" || !rawValues.activeChildId)) throw new Error("invalid_active_child");
  if ("activeSequenceId" in rawValues && rawValues.activeSequenceId !== null && typeof rawValues.activeSequenceId !== "string") throw new Error("invalid_active_sequence");
  if ("appearance" in rawValues && rawValues.appearance !== null && (!rawValues.appearance || typeof rawValues.appearance !== "object" || Array.isArray(rawValues.appearance))) throw new Error("invalid_appearance");
  if ("soundPreferences" in rawValues && rawValues.soundPreferences !== null && (!rawValues.soundPreferences || typeof rawValues.soundPreferences !== "object" || Array.isArray(rawValues.soundPreferences))) throw new Error("invalid_sound_preferences");
  if ("tracingOrderRequired" in rawValues && typeof rawValues.tracingOrderRequired !== "boolean") throw new Error("invalid_tracing_order");
  if ("interfaceStyle" in rawValues && !isInterfaceStyle(rawValues.interfaceStyle)) throw new Error("invalid_interface_style");
  if ("categorySymbols" in rawValues && rawValues.categorySymbols !== null) {
    const symbols = document(rawValues.categorySymbols);
    if (Object.entries(symbols).some(([name, id]) => !name.trim() || name.length > 200 || typeof id !== "string" || !id || id.length > 200)) throw new Error("invalid_category_symbols");
  }
  const pairs = request.libraryReplacements;
  if (pairs !== undefined && (!Array.isArray(pairs) || !pairs.length || pairs.some(pair =>
    !Array.isArray(pair) || pair.length !== 2 || pair.some(id => typeof id !== "string" || !id) || pair[0] === pair[1]) ||
    new Set(pairs.map(pair => pair[0])).size !== pairs.length)) throw new Error("invalid_library_replacements");
  if (!Object.keys(collections).length && !Object.keys(rawValues).length && !pairs) throw new Error("empty_state_change");
  return { schemaVersion: 1, operationId: request.operationId, baseRevision: request.baseRevision as number, collections, values: rawValues,
    ...(pairs ? { libraryReplacements: pairs as [string, string][] } : {}) };
}

export function applyStateChange(stateValue: unknown, requestValue: unknown) {
  const state = document(stateValue);
  const request = parseStateChangeRequest(requestValue);
  const next: Record<string, unknown> = { ...state, schemaVersion: 1 };

  for (const key of STATE_COLLECTIONS) {
    const change = request.collections[key];
    if (!change) continue;
    const current = entities(state[key] ?? []);
    const removed = new Set(change.removedIds);
    const byId = new Map(current.filter((item) => !removed.has(item.id)).map((item) => [item.id, item]));
    for (const item of change.upserts) byId.set(item.id, item);
    const order = mergePartialOrder(current, byId, change.order);
    next[key] = order.map((id) => byId.get(id)!);
  }
  for (const [key, value] of Object.entries(request.values)) {
    if (value === null && (key === "activeSequenceId" || key === "appearance" || key === "soundPreferences" || key === "categorySymbols")) delete next[key];
    else next[key] = value;
  }
  if (request.libraryReplacements) {
    const replacements = verifyLibraryReplacements((state.library ?? []) as LibraryItem[], (next.library ?? []) as LibraryItem[], request.libraryReplacements);
    next.exercises = remapProgramExercises((next.exercises ?? []) as Exercise[], (next.sequences ?? []) as Sequence[], replacements);
  }
  return next;
}

export function rebaseStateChange(latestStateValue: unknown, requestValue: unknown, operationId: string, baseRevision: number) {
  const latestState = document(latestStateValue);
  const request = parseStateChangeRequest(requestValue);
  const collections: StateChangeRequest["collections"] = {};

  for (const key of STATE_COLLECTIONS) {
    const change = request.collections[key];
    if (!change) continue;
    const latest = entities(latestState[key] ?? []);
    const removed = new Set(change.removedIds);
    const byId = new Map(latest.filter((item) => !removed.has(item.id)).map((item) => [item.id, item]));
    for (const item of change.upserts) byId.set(item.id, item);

    const localOrder = change.order.filter((id) => byId.has(id));
    const localIds = new Set(localOrder);
    const concurrentIds = latest.map((item) => item.id).filter((id) => byId.has(id) && !localIds.has(id));
    const order = [...localOrder, ...concurrentIds];
    for (const id of byId.keys()) if (!order.includes(id)) order.push(id);
    collections[key] = { ...change, order };
  }

  const rebased: StateChangeRequest = {
    schemaVersion: 1,
    operationId,
    baseRevision,
    collections,
    values: request.values,
    ...(request.libraryReplacements ? { libraryReplacements: request.libraryReplacements } : {}),
  };
  return { change: rebased, state: applyStateChange(latestState, rebased) };
}
