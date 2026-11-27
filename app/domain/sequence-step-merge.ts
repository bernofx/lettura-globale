const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// Keep a move together: splitting it into a delete and an insert could resurrect
// a step the other adult removed. A range can also represent a multi-step edit.
function changedRange(base: string[], next: string[]) {
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start++;
  let end = base.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && base[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  return { start, end, inserted: next.slice(start, nextEnd) };
}

export function mergeSequenceSteps(base: string[], local: string[], cloud: string[]): string[] | null {
  if (same(local, cloud) || same(base, local)) return cloud;
  if (same(base, cloud)) return local;
  const a = changedRange(base, local);
  const b = changedRange(base, cloud);
  // A previous PATCH may already have appended these new IDs after a cloud
  // reorder, with only its response lost. Do not append or queue them again.
  if (a.start === base.length && a.inserted.every(id => !base.includes(id)) &&
    same(cloud.slice(-a.inserted.length), a.inserted)) return cloud;
  if (a.start === b.start && a.start === a.end && b.start === b.end &&
    b.inserted.some((_, i) => same(b.inserted.slice(i, i + a.inserted.length), a.inserted))) return cloud;
  if (a.start < b.end && b.start < a.end) return null;

  // Repeated model IDs in legacy sequences have no slot IDs. When both edits
  // touch the same occurrence label, guessing a position can drop the wrong step.
  const remoteIds = new Set([...base.slice(b.start, b.end), ...b.inserted]);
  if ([...base.slice(a.start, a.end), ...a.inserted].some(id => remoteIds.has(id))) return null;

  // Independent inserts in the same gap retain the cloud order first.
  const [first, second] = b.end <= a.start ? [b, a] : [a, b];
  return [...base.slice(0, first.start), ...first.inserted, ...base.slice(first.end, second.start),
    ...second.inserted, ...base.slice(second.end)];
}

// A reviewed reorder may only move existing slots, including historical repeats.
export function canRestoreStepOrder(current: string[], draft: string[]) {
  return !same(current, draft) && same([...current].sort(), [...draft].sort());
}
