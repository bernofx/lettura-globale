export type QuantityObject = "candy" | "ladybug" | "stone";
export type QuantityObjectSet = QuantityObject | "mixed";

export type QuantityRound = {
  target: number;
  object: QuantityObject;
};

const objects: QuantityObject[] = ["candy", "ladybug", "stone"];

export function clampQuantity(value: number | undefined, fallback: number) {
  return Math.min(10, Math.max(1, Number.isFinite(value) ? Math.trunc(value!) : fallback));
}

export function createQuantityRounds(config: { rounds?: number; min?: number; max?: number; objectSet?: QuantityObjectSet }, random: () => number = Math.random): QuantityRound[] {
  const min = clampQuantity(config.min, 1);
  const max = Math.max(min, clampQuantity(config.max, 10));
  const rounds = Math.min(50, Math.max(1, Math.trunc(config.rounds ?? 6)));
  let bag: number[] = [];
  let previous: number | undefined;
  return Array.from({ length: rounds }, () => {
    if (!bag.length) {
      bag = Array.from({ length: max - min + 1 }, (_, index) => min + index);
      for (let index = bag.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [bag[index], bag[swap]] = [bag[swap], bag[index]];
      }
      // Drawing from the end keeps every cycle unique, including its boundary.
      if (bag.length > 1 && bag[bag.length - 1] === previous) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    const target = bag.pop()!;
    previous = target;
    return { target, object: config.objectSet && config.objectSet !== "mixed" ? config.objectSet : objects[Math.floor(random() * objects.length)] };
  });
}

export function quantityObjectLabel(object: QuantityObject, count: number) {
  if (object === "candy") return count === 1 ? "caramella" : "caramelle";
  if (object === "ladybug") return count === 1 ? "coccinella" : "coccinelle";
  return count === 1 ? "sassolino" : "sassolini";
}

export type QuantityAnswerMethod = "adult" | "idle-teaching" | "idle-wrong" | "selection";

export function quantityAnswerId(target: number, selected: number, method: QuantityAnswerMethod, attemptKey?: string | number) {
  return `quantity:${target}:${selected}:${method}${attemptKey === undefined ? "" : `:${attemptKey}`}`;
}

export function quantityAnswerLabel(answerId: string) {
  const match = /^quantity:(\d+):(\d+):(adult|idle-teaching|idle-wrong|selection)(?::[a-zA-Z0-9-]+)?$/.exec(answerId);
  if (!match) return null;
  const method = match[3] === "selection" ? "quantità raggiunta · apprendimento senza errori" : match[3] === "idle-teaching" ? "completamento dopo inattività" : match[3] === "idle-wrong" ? "errore dopo inattività" : "conferma adulta";
  return `Richiesti ${match[1]} · selezionati ${match[2]} · ${method}`;
}

export function quantitySelectionDecision(selected: ReadonlySet<number>, index: number, target: number, errorless: boolean, locked = false) {
  if (locked || (errorless && selected.size === target)) return null;
  const next = new Set(selected);
  const willSelect = !next.has(index);
  if (willSelect) next.add(index); else next.delete(index);
  return { selected: next, willSelect, spokenNumber: next.size, correct: errorless && next.size === target };
}

export function quantityIdleDecision(mode: "teaching" | "test", selected: number, target: number, autoComplete: boolean, sharedPreview = false, idleSeconds = 5, errorless = false) {
  if (errorless) return null;
  if ((mode !== "teaching" && !sharedPreview) || selected === 0) return null;
  const delayMs = Math.min(10, Math.max(1, idleSeconds)) * 1000;
  if (selected !== target) return { correct: false, delayMs, method: "idle-wrong" as const, autoResolve: true };
  return { correct: true, delayMs, method: "idle-teaching" as const, autoResolve: autoComplete || sharedPreview };
}
