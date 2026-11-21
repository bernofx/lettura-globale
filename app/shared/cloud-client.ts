import { parsePendingCloudSave, PENDING_CLOUD_SAVE_STORAGE_KEY, serializePendingCloudSave } from "../domain/pending-cloud-save";
import { hashPinForStorage } from "../domain/pin-credentials";
import { type BackendStatus } from "./types";

export function backendStatusInfo(status: BackendStatus) {
  if (status === "loading") return { tone: "pending", label: "Connessione al cloud…", detail: "Caricamento dei dati" };
  if (status === "migrating") return { tone: "pending", label: "Trasferimento nel cloud…", detail: "Migrazione in corso" };
  if (status === "syncing") return { tone: "pending", label: "Salvataggio…", detail: "Modifiche in sincronizzazione" };
  if (status === "error") return { tone: "error", label: "Non salvato nel cloud", detail: "La copia locale è al sicuro; riproverò automaticamente" };
  if (status === "local") return { tone: "local", label: "Solo su questo dispositivo", detail: "Il cloud non è disponibile" };
  return { tone: "ready", label: "Salvato nel cloud", detail: "Dati sincronizzati e protetti" };
}

export function readPendingCloudSave() {
  try { return parsePendingCloudSave(localStorage.getItem(PENDING_CLOUD_SAVE_STORAGE_KEY)); }
  catch { return null; }
}

export function storePendingCloudSave(change: unknown) {
  try { localStorage.setItem(PENDING_CLOUD_SAVE_STORAGE_KEY, serializePendingCloudSave(change)); }
  catch { /* The normal cloud save must still proceed when browser storage is full or unavailable. */ }
}

export function clearPendingCloudSave() {
  try { localStorage.removeItem(PENDING_CLOUD_SAVE_STORAGE_KEY); }
  catch { /* storage can be unavailable */ }
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function backendResponseError(response: Response, fallback: string) {
  let code = fallback;
  let diagnosticId = "";
  try {
    const body = await response.clone().json() as { error?: unknown; diagnosticId?: unknown };
    if (typeof body.error === "string" && body.error) code = body.error;
    if (typeof body.diagnosticId === "string") diagnosticId = body.diagnosticId;
  } catch { /* response senza JSON */ }
  return Object.assign(new Error(`${code} (${response.status})`), { status: response.status, code, diagnosticId });
}

export function saveErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; code?: unknown; name?: unknown; diagnosticId?: unknown };
    const message = error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message) ? error.message : undefined;
    return { httpStatus: typeof candidate.status === "number" ? candidate.status : undefined, errorCode: typeof candidate.code === "string" ? candidate.code : candidate.name === "AbortError" ? "timeout" : message ?? "network_error", diagnosticId: typeof candidate.diagnosticId === "string" ? candidate.diagnosticId : undefined };
  }
  return { errorCode: "unknown_error" };
}

// Kept as a local alias until the profile editor is split out of this page.
export const hashPin = hashPinForStorage;
