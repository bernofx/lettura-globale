export const STATE_COLLECTIONS = [
  "therapists", "children", "library", "exercises", "sequences", "attempts", "helps", "sessionHistory",
] as const;

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
  values: Partial<Record<"activeChildId" | "activeSequenceId" | "appearance" | "soundPreferences", unknown>>;
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
  for (const key of ["activeChildId", "activeSequenceId", "appearance", "soundPreferences"] as const) {
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
  if (Object.keys(rawValues).some((key) => !["activeChildId", "activeSequenceId", "appearance", "soundPreferences"].includes(key))) throw new Error("invalid_state_value");
  if ("activeChildId" in rawValues && (typeof rawValues.activeChildId !== "string" || !rawValues.activeChildId)) throw new Error("invalid_active_child");
  if ("activeSequenceId" in rawValues && rawValues.activeSequenceId !== null && typeof rawValues.activeSequenceId !== "string") throw new Error("invalid_active_sequence");
  if ("appearance" in rawValues && rawValues.appearance !== null && (!rawValues.appearance || typeof rawValues.appearance !== "object" || Array.isArray(rawValues.appearance))) throw new Error("invalid_appearance");
  if ("soundPreferences" in rawValues && rawValues.soundPreferences !== null && (!rawValues.soundPreferences || typeof rawValues.soundPreferences !== "object" || Array.isArray(rawValues.soundPreferences))) throw new Error("invalid_sound_preferences");
  if (!Object.keys(collections).length && !Object.keys(rawValues).length) throw new Error("empty_state_change");
  return { schemaVersion: 1, operationId: request.operationId, baseRevision: request.baseRevision as number, collections, values: rawValues };
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
    if (change.order.length !== byId.size || change.order.some((id) => !byId.has(id))) throw new Error("invalid_collection_order");
    next[key] = change.order.map((id) => byId.get(id)!);
  }
  for (const [key, value] of Object.entries(request.values)) {
    if (value === null && (key === "activeSequenceId" || key === "appearance" || key === "soundPreferences")) delete next[key];
    else next[key] = value;
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
  };
  return { change: rebased, state: applyStateChange(latestState, rebased) };
}
