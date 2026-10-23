/** Activity boundaries depend on the configured exercise, not its kind. */
export function activityNavigation(plan: readonly { id: string; sourceExerciseId?: string }[], index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.length) return { previous: null, next: null };
  const sourceAt = (position: number) => plan[position].sourceExerciseId ?? plan[position].id;
  const current = sourceAt(index);
  let start = index;
  while (start > 0 && sourceAt(start - 1) === current) start--;
  let previous: number | null = start > 0 ? start - 1 : null;
  if (previous !== null) {
    const source = sourceAt(previous);
    while (previous > 0 && sourceAt(previous - 1) === source) previous--;
  }
  let next = index + 1;
  while (next < plan.length && sourceAt(next) === current) next++;
  return { previous, next: next < plan.length ? next : null };
}
