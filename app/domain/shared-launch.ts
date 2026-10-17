export type SharedLaunch = {
  kind: "exercise" | "sequence";
  id: string;
};

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
