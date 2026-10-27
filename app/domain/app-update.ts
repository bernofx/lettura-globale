import { parseSharedPreview } from "./shared-launch.ts";

/** Public previews must survive first-install updates, including the fetch/render gap. */
export function shouldDeferAppUpdate(search: string, sessionActive: boolean, controllerActive: boolean) {
  return sessionActive || controllerActive || Boolean(parseSharedPreview(search));
}
