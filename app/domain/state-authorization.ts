type Entity = Record<string, unknown> & { id: string };
type StateDocument = Record<string, unknown>;

export type StateAuthorizationResult = { allowed: true } | { allowed: false; reason: string };

function records(value: unknown): Entity[] {
  return Array.isArray(value) ? value.filter((item): item is Entity => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")) : [];
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function without(entity: Entity, keys: string[]) {
  return Object.fromEntries(Object.entries(entity).filter(([key]) => !keys.includes(key)));
}

function unchangedExcept(previous: Entity, next: Entity, keys: string[]) {
  return equal(without(previous, keys), without(next, keys));
}

function collectionTransition(previous: StateDocument, next: StateDocument, name: string) {
  const before = records(previous[name]);
  const after = records(next[name]);
  return { before, after, beforeById: new Map(before.map((item) => [item.id, item])), afterById: new Map(after.map((item) => [item.id, item])) };
}

export function authorizeStateTransition(previousValue: unknown, nextValue: unknown, adultProfileId: string): StateAuthorizationResult {
  if (!previousValue || typeof previousValue !== "object" || Array.isArray(previousValue) || !nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) return { allowed: false, reason: "invalid_state" };
  const previous = previousValue as StateDocument;
  const next = nextValue as StateDocument;
  const adults = records(previous.therapists);
  const adult = adults.find((item) => item.id === adultProfileId);
  if (!adult) return { allowed: false, reason: "adult_not_found" };
  if (adult.role === "Amministratore") return { allowed: true };

  const allowedChildren = new Set(Array.isArray(adult.childIds) ? adult.childIds.filter((id): id is string => typeof id === "string") : []);
  const therapists = collectionTransition(previous, next, "therapists");
  if (therapists.before.length !== therapists.after.length) return { allowed: false, reason: "therapist_admin_required" };
  for (const item of therapists.before) {
    const updated = therapists.afterById.get(item.id);
    if (!updated) return { allowed: false, reason: "therapist_admin_required" };
    if (item.id !== adultProfileId && !equal(item, updated)) return { allowed: false, reason: "therapist_admin_required" };
    if (item.id === adultProfileId && !unchangedExcept(item, updated, ["firstName", "lastName", "email", "pinHash", "pin"])) return { allowed: false, reason: "own_profile_scope_exceeded" };
  }

  const children = collectionTransition(previous, next, "children");
  if (children.before.length !== children.after.length) return { allowed: false, reason: "child_admin_required" };
  for (const item of children.before) {
    const updated = children.afterById.get(item.id);
    if (!updated || (!allowedChildren.has(item.id) && !equal(item, updated))) return { allowed: false, reason: "child_access_forbidden" };
  }

  const sequences = collectionTransition(previous, next, "sequences");
  for (const item of sequences.before) {
    const updated = sequences.afterById.get(item.id);
    if (item.therapistId !== adultProfileId && !equal(item, updated)) return { allowed: false, reason: "sequence_owner_required" };
  }
  for (const item of sequences.after) {
    if (!sequences.beforeById.has(item.id) && item.therapistId !== adultProfileId) return { allowed: false, reason: "invalid_sequence_owner" };
  }

  for (const name of ["attempts", "helps"] as const) {
    const events = collectionTransition(previous, next, name);
    for (const item of events.before) if (!equal(item, events.afterById.get(item.id))) return { allowed: false, reason: `${name}_append_only` };
    for (const item of events.after) {
      if (events.beforeById.has(item.id)) continue;
      if (item.therapistId !== adultProfileId || typeof item.childId !== "string" || !allowedChildren.has(item.childId)) return { allowed: false, reason: `${name}_access_forbidden` };
    }
  }

  const histories = collectionTransition(previous, next, "sessionHistory");
  for (const item of histories.before) {
    const updated = histories.afterById.get(item.id);
    if (!updated) return { allowed: false, reason: "history_delete_forbidden" };
    if (!equal(item, updated) && (item.therapistId !== adultProfileId || !unchangedExcept(item, updated, ["comment"]))) return { allowed: false, reason: "history_access_forbidden" };
  }
  for (const item of histories.after) {
    if (histories.beforeById.has(item.id)) continue;
    if (item.therapistId !== adultProfileId || typeof item.childId !== "string" || !allowedChildren.has(item.childId)) return { allowed: false, reason: "history_access_forbidden" };
  }

  if (typeof next.activeChildId === "string" && !allowedChildren.has(next.activeChildId)) return { allowed: false, reason: "active_child_forbidden" };
  return { allowed: true };
}
