export const PAIRING_DURATION_MS = 10 * 60 * 1000;
export const CONTROLLER_LEASE_MS = 8 * 1000;
export const CONTROLLER_HEARTBEAT_WRITE_MS = 3 * 1000;
export const REMOTE_HOST_POLL_MS = 450;
export const REMOTE_CONTROLLER_POLL_MS = 650;

export const remoteCommandNames = [
  "start",
  "next",
  "previous",
  "next_activity",
  "previous_activity",
  "shuffle",
  "speak",
  "toggle_audio",
  "pause",
  "resume",
  "end",
  "finish",
  "help",
  "mark_correct",
  "mark_wrong",
  "mark_helped",
  "retry",
] as const;

export type RemoteCommandName = typeof remoteCommandNames[number];

export function remoteExerciseControls(kind: string | undefined) {
  return {
    shuffle: kind === "recognition" || kind === "sentence-matching" || kind === "word-categories",
    judgement: kind === "naming" || kind === "number-quantity",
    helped: kind === "naming",
    retry: kind === "number-quantity",
    speak: kind === "recognition" || kind === "sentence-matching" || kind === "number-quantity",
  };
}

export function remoteCommandDisposition(command: RemoteCommandName, paused: boolean, awaitingNextExercise = false, phase: "ready" | "active" = "active") {
  if (phase === "ready") return command === "start" ? "execute" : "ignore";
  if (command === "start") return "ignore";
  if (paused && command !== "resume" && command !== "pause" && command !== "end" && command !== "toggle_audio") return "ignore";
  if (awaitingNextExercise && (command === "next" || command === "next_activity")) return "continue";
  return "execute";
}

export type RemoteCommand = {
  clientEventId: string;
  command: RemoteCommandName;
  payload?: { label?: string };
};

export type RemoteControllerEvent = RemoteCommand & {
  serverSequence: number;
  adultId: string;
  createdAt: number;
};

const remoteCommandLabels: Record<RemoteCommandName, string> = {
  start: "Inizia sessione",
  next: "Passo successivo",
  previous: "Passo precedente",
  next_activity: "Tipo successivo",
  previous_activity: "Tipo precedente",
  shuffle: "Mischia",
  speak: "Riascolta",
  toggle_audio: "Audio",
  pause: "Pausa",
  resume: "Riprendi",
  end: "Interrompi sessione",
  finish: "Concludi sessione",
  help: "Aiuto",
  mark_correct: "Risposta corretta",
  mark_wrong: "Risposta errata",
  mark_helped: "Corretta con aiuto",
  retry: "Riprova",
};

export function remoteCommandFeedback(command: RemoteCommandName, payload?: { label?: string }) {
  return command === "help" && payload?.label ? `Aiuto: ${payload.label}` : remoteCommandLabels[command];
}

export type RemoteSessionSnapshot = {
  sessionId: string;
  childName: string;
  sessionTitle: string;
  exerciseTitle: string;
  exerciseKind: string;
  prompt: string;
  currentIndex: number;
  total: number;
  answerState: "idle" | "wrong" | "correct";
  soundEffects: boolean;
  paused: boolean;
  awaitingNextExercise?: boolean;
  phase?: "ready" | "active";
  canPreviousActivity?: boolean;
  canNextActivity?: boolean;
  updatedAt: number;
};

export function controllerSessionView(result: { status: string; connected: boolean; snapshot?: RemoteSessionSnapshot | null }) {
  const status = result.status === "closed" ? "closed" : result.connected ? "connected" : result.status === "pending" ? "pending" : "lost";
  return { status, snapshot: status === "connected" ? result.snapshot ?? null : null } as const;
}

export function isRemoteCommandName(value: unknown): value is RemoteCommandName {
  return typeof value === "string" && (remoteCommandNames as readonly string[]).includes(value);
}

export function parseRemoteCommand(value: unknown): RemoteCommand | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.clientEventId !== "string" || input.clientEventId.length < 8 || input.clientEventId.length > 100) return null;
  if (!isRemoteCommandName(input.command)) return null;
  const rawPayload = input.payload;
  if (rawPayload !== undefined && (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload))) return null;
  const label = (rawPayload as Record<string, unknown> | undefined)?.label;
  if (label !== undefined && (typeof label !== "string" || label.length > 80)) return null;
  return { clientEventId: input.clientEventId, command: input.command, ...(typeof label === "string" ? { payload: { label } } : {}) };
}

export function controllerIsConnected(status: string, lastSeenAt: number | null | undefined, now = Date.now()) {
  return status === "connected" && typeof lastSeenAt === "number" && lastSeenAt > now - CONTROLLER_LEASE_MS;
}

export function sanitizeRemoteSnapshot(value: unknown): RemoteSessionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const strings = ["sessionId", "childName", "sessionTitle", "exerciseTitle", "exerciseKind", "prompt"] as const;
  if (strings.some((key) => typeof input[key] !== "string" || (input[key] as string).length > 160)) return null;
  if (!Number.isInteger(input.currentIndex) || !Number.isInteger(input.total) || (input.currentIndex as number) < 0 || (input.total as number) < 1) return null;
  if (!(["idle", "wrong", "correct"] as unknown[]).includes(input.answerState)) return null;
  if (typeof input.soundEffects !== "boolean" || typeof input.paused !== "boolean") return null;
  if (input.phase !== undefined && input.phase !== "ready" && input.phase !== "active") return null;
  for (const key of ["canPreviousActivity", "canNextActivity"]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") return null;
  }
  return {
    sessionId: input.sessionId as string,
    childName: input.childName as string,
    sessionTitle: input.sessionTitle as string,
    exerciseTitle: input.exerciseTitle as string,
    exerciseKind: input.exerciseKind as string,
    prompt: input.prompt as string,
    currentIndex: input.currentIndex as number,
    total: input.total as number,
    answerState: input.answerState as RemoteSessionSnapshot["answerState"],
    soundEffects: input.soundEffects,
    paused: input.paused,
    awaitingNextExercise: input.awaitingNextExercise === true,
    phase: input.phase === "ready" ? "ready" : "active",
    ...(typeof input.canPreviousActivity === "boolean" ? { canPreviousActivity: input.canPreviousActivity } : {}),
    ...(typeof input.canNextActivity === "boolean" ? { canNextActivity: input.canNextActivity } : {}),
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
  };
}

export function controllerUrl(origin: string, token: string) {
  const url = new URL(origin);
  url.searchParams.set("controller", token);
  return url.toString();
}

export function parseControllerToken(search: string) {
  const token = new URLSearchParams(search).get("controller")?.trim() ?? "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
