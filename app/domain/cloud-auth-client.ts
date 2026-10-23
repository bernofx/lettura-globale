type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class CloudLoginError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;
  constructor(status: number, code: string, retryAfter: number | null = null) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** No local credential checks: only the server may confirm the active identity. */
export async function loginToCloud(fetcher: Fetcher, email: string, pin: string): Promise<string> {
  const response = await fetcher("/api/login", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), pin }),
  });
  const result = await response.json().catch(() => ({})) as { therapistId?: unknown; error?: unknown };
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new CloudLoginError(response.status, typeof result.error === "string" ? result.error : "login_unavailable", Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
  }
  if (typeof result.therapistId !== "string" || !result.therapistId.trim()) throw new CloudLoginError(502, "invalid_login_response");
  return result.therapistId;
}

export async function logoutFromCloud(fetcher: Fetcher): Promise<void> {
  const response = await fetcher("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("logout_unconfirmed");
}

export function cloudLoginErrorMessage(error: unknown): string {
  if (error instanceof CloudLoginError) {
    if (error.status === 401) return "Email o PIN non corretti.";
    if (error.status === 429) return error.retryAfter ? `Troppi tentativi. Attendi ${error.retryAfter} secondi prima di riprovare.` : "Troppi tentativi. Attendi qualche minuto prima di riprovare.";
    if (error.code === "pin_verification_unavailable") return "La verifica del PIN sul server non è disponibile. Non significa che il PIN sia errato: riprova tra poco.";
  }
  return "Il cloud non è raggiungibile. Accesso non effettuato: riprova tra poco.";
}
