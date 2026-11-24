import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { upgradeRealtime } from "../realtime/gateway";
import { processImageJob, recoverImageJobs, type ScheduledImageJob } from "../app/server/scheduled-image-jobs";
import { recoverApprovedCatalogImages } from "../app/server/official-catalog";
export { RealtimeSession } from "../realtime/worker";

export default {
  async queue(batch: MessageBatch<ScheduledImageJob>, env: Cloudflare.Env) {
    for (const message of batch.messages) {
      await processImageJob(message.body, env);
      message.ack();
    }
  },
  scheduled(_event: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(recoverImageJobs(env));
    ctx.waitUntil(recoverApprovedCatalogImages(env));
  },
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    if (url.pathname === "/api/controller/realtime/connect") {
      if (!env.SESSIONS) return new Response("Realtime unavailable", { status: 503 });
      return upgradeRealtime(request, env.SESSIONS, url.origin);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};
