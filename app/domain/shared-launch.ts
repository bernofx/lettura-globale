export type SharedLaunch = {
  kind: "exercise" | "sequence";
  id: string;
};

export type SharedPreview = { token: string };

export function parseSharedLaunch(search: string): SharedLaunch | null {
  const params = new URLSearchParams(search);
  const kind = params.get("launch");
  const id = params.get("id")?.trim();
  if ((kind !== "exercise" && kind !== "sequence") || !id) return null;
  return { kind, id };
}

export function buildSharedLaunchUrl(origin: string, launch: SharedLaunch) {
  const url = new URL("/", origin);
  url.searchParams.set("launch", launch.kind);
  url.searchParams.set("id", launch.id);
  return url.toString();
}

export function parseSharedPreview(search: string): SharedPreview | null {
  const token = new URLSearchParams(search).get("preview")?.trim();
  return token && /^[0-9a-f-]{36}$/i.test(token) ? { token } : null;
}

export function buildSharedPreviewUrl(origin: string, token: string) {
  const url = new URL("/", origin);
  url.searchParams.set("preview", token);
  return url.toString();
}
