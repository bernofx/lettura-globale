// Consecutive turns from the same exercise share a dot.
export type SessionProgressTurn = { id: string; sourceExerciseId?: string; title: string };
export type SessionProgressStep = {
  key: string;
  title: string;
  turns: number;
  completedTurns: number;
  currentTurn?: number;
  status: "done" | "current" | "upcoming";
};

export function sessionProgressSteps(plan: readonly SessionProgressTurn[], currentIndex: number, completedIndices: readonly number[]): SessionProgressStep[] {
  const completed = new Set(completedIndices);
  const steps: SessionProgressStep[] = [];
  let previousSource: string | undefined;
  plan.forEach((turn, index) => {
    const source = turn.sourceExerciseId ?? turn.id;
    let step = steps.at(-1);
    if (!step || source !== previousSource) {
      step = { key: `${source}#${index}`, title: turn.title, turns: 0, completedTurns: 0, status: "upcoming" };
      steps.push(step);
    }
    previousSource = source;
    step.turns += 1;
    if (completed.has(index)) step.completedTurns += 1;
    if (currentIndex === index) step.currentTurn = step.turns;
  });
  for (const step of steps) {
    step.status = step.currentTurn !== undefined ? "current" : step.completedTurns === step.turns ? "done" : "upcoming";
  }
  return steps;
}

export function sessionProgressLabel(steps: readonly SessionProgressStep[]) {
  const index = steps.findIndex((step) => step.status === "current");
  const current = steps[index];
  if (!current) return "";
  const turn = `turno ${current.currentTurn} di ${current.turns}`;
  return steps.length > 1 ? `Esercizio ${index + 1} di ${steps.length}, ${current.title}: ${turn}` : `${current.title}: ${turn}`;
}
