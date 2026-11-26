// One step per exercise of the session plan: consecutive turns compiled from the
// same source exercise form a single step whose ring fills turn by turn.
export type SessionProgressTurn = { id: string; sourceExerciseId?: string; title: string };
export type SessionProgressStep = { key: string; title: string; turns: number; completedTurns: number; status: "done" | "current" | "upcoming" };

export function sessionProgressSteps(plan: readonly SessionProgressTurn[], currentIndex: number): SessionProgressStep[] {
  const steps: (SessionProgressStep & { start: number })[] = [];
  plan.forEach((turn, index) => {
    const source = turn.sourceExerciseId ?? turn.id;
    const last = steps.at(-1);
    if (last && last.key.split("#")[0] === source) last.turns += 1;
    else steps.push({ key: `${source}#${steps.length}`, title: turn.title, turns: 1, completedTurns: 0, status: "upcoming", start: index });
  });
  return steps.map(({ start, ...step }) => {
    const end = start + step.turns;
    if (currentIndex >= end) return { ...step, completedTurns: step.turns, status: "done" };
    if (currentIndex >= start) return { ...step, completedTurns: currentIndex - start, status: "current" };
    return step;
  });
}

export function sessionProgressLabel(steps: readonly SessionProgressStep[]) {
  const index = steps.findIndex((step) => step.status === "current");
  const current = steps[index];
  if (!current) return "";
  const turn = `turno ${current.completedTurns + 1} di ${current.turns}`;
  return steps.length > 1 ? `Esercizio ${index + 1} di ${steps.length}, ${current.title}: ${turn}` : `${current.title}: ${turn}`;
}
