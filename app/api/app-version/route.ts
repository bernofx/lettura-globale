import { APP_VERSION } from "../../app-version";

export function GET() {
  return Response.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
