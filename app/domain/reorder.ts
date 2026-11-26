/** Returns a copy of `items` with the element at `from` moved to index `to` (clamped). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length) return result;
  const target = Math.max(0, Math.min(result.length - 1, to));
  const [item] = result.splice(from, 1);
  result.splice(target, 0, item);
  return result;
}

/**
 * Index where a dragged row lands, from the vertical centre of the dragged row and the
 * vertical midpoints of every row in their resting positions (dragged row included).
 */
export function dropIndex(draggedCentre: number, midpoints: readonly number[], from: number): number {
  let index = from;
  while (index < midpoints.length - 1 && draggedCentre > midpoints[index + 1]) index += 1;
  while (index > 0 && draggedCentre < midpoints[index - 1]) index -= 1;
  return index;
}

/**
 * Applies a new order to the ids listed in `visibleOrder`, leaving every other id of `all`
 * (for example exercises the current adult cannot see) at its original position.
 */
export function reorderVisible(all: readonly string[], visibleOrder: readonly string[]): string[] {
  const visible = new Set(visibleOrder);
  const queue = [...visibleOrder];
  return all.map((id) => visible.has(id) ? queue.shift() ?? id : id);
}
