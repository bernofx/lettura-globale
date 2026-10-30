import { WorkerEntrypoint } from "cloudflare:workers";
import { CONTROLLER_LEASE_MS, PAIRING_DURATION_MS, parseRemoteCommand, remoteCommandDisposition, sanitizeRemoteSnapshot, type RemoteControllerEvent, type RemoteSessionSnapshot } from "../app/domain/remote-controller";
import type { RealtimeAction, RealtimeMessage, RealtimeResult } from "../app/domain/realtime-protocol";
import { requestRealtime, upgradeRealtime } from "./gateway";
import { storeRealtimeCommand } from "./command-store";

type Env = { SESSIONS: DurableObjectNamespace; DB: D1Database; ALLOWED_ORIGIN: string };
type Session = {
  accountId: string; sessionId: string; childId: string; ownerId: string;
  tokenHash: string; expiresAt: number; controllerId: string | null; keyHash: string | null;
  status: "waiting" | "connected" | "closed"; snapshot: RemoteSessionSnapshot;
  hostSeen: number; controllerSeen: number;
  mirrorDirty?: boolean;
};
type SocketIdentity = { role: "host" | "controller"; adultId: string; keyHash?: string; since: number; expiresAt?: number };
type Ticket = SocketIdentity & { expiresAt: number };
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const failure = (status: number, error: string): RealtimeResult => ({ ok: false, status, error });

// Privileged operations exist only as service-binding RPC, never as public HTTP routes.
export default class RealtimeGateway extends WorkerEntrypoint<Env> {
  async request(input: RealtimeAction): Promise<RealtimeResult> {
    return requestRealtime(this.env.SESSIONS, input);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ready", transport: "durable-object" });
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 });
    return upgradeRealtime(request, this.env.SESSIONS, this.env.ALLOWED_ORIGIN);
  }
}

// A standard DO constructor keeps the app's Node prerender independent of Workers-only base classes.
// Internal actions travel through a private namespace fetch; public HTTP exposes only ticketed upgrades.
export class RealtimeSession {
  private session: Session | null = null;
  private lastPresenceSave = 0;
  private lastConnectionState: boolean | null = null;
  private mirrorPending: { accountId: string; sessionId: string; tokenHash: string; snapshot: string; at: number } | null = null;
  private mirrorFlight: Promise<void> | null = null;
  constructor(private ctx: DurableObjectState, private env: Env) {
    ctx.blockConcurrencyWhile(async () => {
      this.session = await ctx.storage.get<Session>("session") ?? null;
      if (this.session?.mirrorDirty) this.mirrorSnapshot();
    });
  }

  private save() { return this.ctx.storage.put("session", this.session); }
  /** Latest-state D1 mirror is not the realtime authority. Serialize/coalesce
   * mirror writes without holding the command input gate across D1 latency. */
  private mirrorSnapshot() {
    const s = this.session!;
    this.mirrorPending = { accountId: s.accountId, sessionId: s.sessionId, tokenHash: s.tokenHash, snapshot: JSON.stringify(s.snapshot), at: Date.now() };
    if (this.mirrorFlight) return;
    this.mirrorFlight = (async () => {
      while (this.mirrorPending) {
        const next = this.mirrorPending;
        this.mirrorPending = null;
        await this.env.DB.prepare("UPDATE remote_controller_sessions SET snapshot_json = ?, updated_at = MAX(updated_at, ?) WHERE account_id = ? AND session_id = ? AND pairing_token_hash = ? AND status != 'closed'")
          .bind(next.snapshot, next.at, next.accountId, next.sessionId, next.tokenHash).run();
        if (!this.mirrorPending && this.session?.tokenHash === next.tokenHash && JSON.stringify(this.session.snapshot) === next.snapshot) {
          this.session.mirrorDirty = false;
          await this.save();
        }
      }
    })().catch(() => { /* Durable dirty marker retries on alarm, wake or next sync. */ }).finally(() => { this.mirrorFlight = null; });
    this.ctx.waitUntil(this.mirrorFlight);
  }
  private send(socket: WebSocket, message: RealtimeMessage) {
    try { socket.send(JSON.stringify(message)); } catch { /* Closed sockets are removed by the runtime. */ }
  }
  private identity(socket: WebSocket): SocketIdentity { return socket.deserializeAttachment() as SocketIdentity; }
  private valid(identity: SocketIdentity) {
    const s = this.session;
    return Boolean(s && (identity.role === "host" ? identity.adultId === s.ownerId : identity.adultId === s.controllerId && identity.keyHash === s.keyHash));
  }
  private connected() {
    const s = this.session;
    return Boolean(s && s.status === "connected" && s.controllerSeen > Date.now() - CONTROLLER_LEASE_MS && s.hostSeen > Date.now() - CONTROLLER_LEASE_MS);
  }
  private broadcast() {
    const s = this.session;
    if (!s) return;
    const connected = this.connected();
    this.lastConnectionState = connected;
    for (const socket of this.ctx.getWebSockets()) if (this.valid(this.identity(socket))) {
      this.send(socket, { type: "state", status: s.status, connected, snapshot: s.status === "closed" ? null : s.snapshot });
    }
  }
  private revoke(role: "host" | "controller") {
    for (const socket of this.ctx.getWebSockets()) if (this.identity(socket).role === role) {
      this.send(socket, { type: "replaced" });
      socket.close(4001, "replaced");
    }
  }
  private async replay(socket: WebSocket, since: number) {
    const s = this.session!;
    let cursor = since;
    for (;;) {
    const result = await this.env.DB.prepare(`SELECT server_sequence, client_event_id, adult_id, command, payload_json, created_at
      FROM remote_controller_events WHERE account_id = ? AND session_id = ? AND server_sequence > ? ORDER BY server_sequence LIMIT 100`)
      .bind(s.accountId, s.sessionId, cursor).all<{ server_sequence: number; client_event_id: string; adult_id: string; command: RemoteControllerEvent["command"]; payload_json: string; created_at: number }>();
    this.send(socket, { type: "events", events: result.results.map((row) => ({ serverSequence: row.server_sequence, clientEventId: row.client_event_id, adultId: row.adult_id, command: row.command, payload: JSON.parse(row.payload_json), createdAt: row.created_at })) });
      if (result.results.length < 100) break;
      cursor = result.results[result.results.length - 1].server_sequence;
    }
  }

  async act(input: RealtimeAction): Promise<RealtimeResult> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const { accountId, adultId } = input.identity;
      const now = Date.now();
      let s = this.session;
      if (s && (s.accountId !== accountId || s.sessionId !== input.sessionId)) return failure(403, "forbidden");
      if (input.action === "create") {
        const snapshot = sanitizeRemoteSnapshot(input.snapshot);
        if (!snapshot || snapshot.sessionId !== input.sessionId || !input.childId) return failure(400, "invalid_snapshot");
        if (s && s.ownerId !== adultId) return failure(403, "forbidden");
        const existing = await this.env.DB.prepare("SELECT owner_adult_id FROM remote_controller_sessions WHERE account_id = ? AND session_id = ?")
          .bind(accountId, input.sessionId).first<{ owner_adult_id: string }>();
        if (existing && existing.owner_adult_id !== adultId) return failure(403, "forbidden");
        const token = random();
        const tokenHash = await hash(token);
        await this.env.DB.prepare(`INSERT INTO remote_controller_sessions
          (account_id, session_id, child_id, owner_adult_id, pairing_token_hash, pairing_expires_at, status, latest_sequence, snapshot_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?, ?)
          ON CONFLICT(account_id, session_id) DO UPDATE SET pairing_token_hash = excluded.pairing_token_hash,
          pairing_expires_at = excluded.pairing_expires_at, status = 'waiting', pending_adult_id = NULL,
          pending_adult_name = NULL, controller_key_hash = NULL, controller_last_seen_at = NULL,
          snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`)
          .bind(accountId, input.sessionId, input.childId, adultId, tokenHash, now + PAIRING_DURATION_MS, JSON.stringify(snapshot), now, now).run();
        this.revoke("controller");
        this.session = s = { accountId, sessionId: input.sessionId, childId: input.childId, ownerId: adultId, tokenHash, expiresAt: now + PAIRING_DURATION_MS, controllerId: null, keyHash: null, status: "waiting", snapshot, hostSeen: now, controllerSeen: 0 };
        await this.save();
        this.broadcast();
        const latest = await this.env.DB.prepare("SELECT latest_sequence FROM remote_controller_sessions WHERE account_id = ? AND session_id = ?").bind(accountId, input.sessionId).first<{ latest_sequence: number }>();
        return { ok: true, sessionId: s.sessionId, token, latestSequence: latest?.latest_sequence ?? 0 };
      }
      if (!s) return failure(404, "session_not_found");
      if (input.action === "inspect") return { ok: true, childId: s.childId };
      if (input.action === "join") {
        if (s.status === "closed" || s.expiresAt <= now || !input.token || await hash(input.token) !== s.tokenHash) return failure(404, "pairing_expired");
        if (!input.controllerKey || !/^[a-f0-9]{64}$/.test(input.controllerKey)) return failure(400, "invalid_key");
        const keyHash = await hash(input.controllerKey);
        const replacement = Boolean(s.keyHash && s.keyHash !== keyHash);
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE remote_controller_sessions SET status = 'connected', pending_adult_id = ?, controller_key_hash = ?, controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ?")
            .bind(adultId, keyHash, now, now, accountId, s.sessionId),
          ...(replacement ? [this.env.DB.prepare("INSERT INTO audit_events (id, account_id, adult_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'controller_replaced', 'learning_session', ?, ?)")
            .bind(crypto.randomUUID(), accountId, adultId, s.sessionId, now)] : []),
        ]);
        if (replacement) this.revoke("controller");
        s.controllerId = adultId; s.keyHash = keyHash; s.controllerSeen = now; s.status = "connected";
        await this.save();
        this.broadcast();
        return { ok: true, sessionId: s.sessionId };
      }
      const role = input.role ?? "controller";
      const keyHash = input.controllerKey ? await hash(input.controllerKey) : undefined;
      if (!this.valid({ role, adultId, keyHash, since: 0 })) return failure(403, "controller_replaced");
      if (input.action === "ticket") {
        if (s.status === "closed") return failure(410, "session_closed");
        const ticket = random();
        // Single-use, short-lived tickets. Delete stale tickets and cap outstanding entries.
        const tickets = await this.ctx.storage.list<Ticket>({ prefix: "ticket:" });
        let activeTickets = 0;
        for (const [key, value] of tickets) { if (value.expiresAt <= now) await this.ctx.storage.delete(key); else activeTickets += 1; }
        if (activeTickets >= 32) return failure(429, "too_many_connections");
        await this.ctx.storage.put<Ticket>(`ticket:${await hash(ticket)}`, { role, adultId, keyHash, since: Math.max(0, input.since ?? 0), expiresAt: now + 30_000 });
        return { ok: true, ticket };
      }
      if (input.action === "close" && role !== "host") return failure(403, "forbidden");
      if (input.action === "disconnect" || input.action === "close") {
        const closed = input.action === "close";
        await this.env.DB.prepare("UPDATE remote_controller_sessions SET status = ?, controller_last_seen_at = NULL, updated_at = ? WHERE account_id = ? AND session_id = ?")
          .bind(closed ? "closed" : "waiting", now, accountId, s.sessionId).run();
        s.status = closed ? "closed" : "waiting";
        s.controllerSeen = 0;
        await this.save();
        this.broadcast();
        if (!closed) { this.revoke("controller"); s.keyHash = null; s.controllerId = null; await this.save(); }
        return { ok: true };
      }
      return failure(400, "invalid_action");
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST" && new URL(request.url).pathname === "/internal") {
      return Response.json(await this.act(await request.json() as RealtimeAction));
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
      if (!/^[a-f0-9]{64}$/.test(ticket)) return new Response("Forbidden", { status: 403 });
      const key = `ticket:${await hash(ticket)}`;
      const identity = await this.ctx.storage.get<Ticket>(key);
      await this.ctx.storage.delete(key);
      if (!identity || identity.expiresAt < Date.now() || !this.valid(identity) || this.session?.status === "closed") return new Response("Expired", { status: 403 });
      const pair = new WebSocketPair();
      // A reconnection replaces the previous socket of the same role, not the controller lease.
      for (const old of this.ctx.getWebSockets()) if (this.identity(old).role === identity.role) old.close(4000, "reconnected");
      pair[1].serializeAttachment(identity);
      this.ctx.acceptWebSocket(pair[1]);
      if (identity.role === "host") this.session!.hostSeen = Date.now(); else this.session!.controllerSeen = Date.now();
      await this.save();
      if (identity.role === "host") await this.replay(pair[1], identity.since);
      this.broadcast();
      await this.ctx.storage.setAlarm(Date.now() + CONTROLLER_LEASE_MS);
      return new Response(null, { status: 101, webSocket: pair[0] });
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (typeof message !== "string" || new TextEncoder().encode(message).length > 16_384) { socket.close(1009, "message_too_large"); return; }
      const identity = this.identity(socket);
      if (!this.valid(identity)) { this.send(socket, { type: "replaced" }); socket.close(4001, "replaced"); return; }
      const s = this.session!;
      if (s.status === "closed") { this.broadcast(); return; }
      let input: Record<string, unknown>;
      try { input = JSON.parse(message); } catch { this.send(socket, { type: "error", error: "invalid_message" }); return; }
      if (identity.role === "host") s.hostSeen = Date.now(); else s.controllerSeen = Date.now();
      if (input.type === "ping") {
        this.send(socket, { type: "pong" });
        if (Date.now() - this.lastPresenceSave >= 5_000) {
          await this.save();
          this.lastPresenceSave = Date.now();
        }
        if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + CONTROLLER_LEASE_MS);
        if (this.connected() !== this.lastConnectionState) this.broadcast();
        return;
      }
      if (input.type === "applied" && identity.role === "host") {
        if (typeof input.clientEventId !== "string" || input.clientEventId.length < 8 || input.clientEventId.length > 100 || !Number.isSafeInteger(input.serverSequence) || Number(input.serverSequence) < 1 || typeof input.hostMs !== "number" || !Number.isFinite(input.hostMs) || input.hostMs < 0 || input.hostMs > 60_000) return;
        for (const target of this.ctx.getWebSockets()) if (this.identity(target).role === "controller" && this.valid(this.identity(target))) {
          this.send(target, { type: "applied", clientEventId: input.clientEventId, serverSequence: Number(input.serverSequence), hostMs: input.hostMs });
        }
        return;
      }
      if (input.type === "sync" && identity.role === "host") {
        const snapshot = sanitizeRemoteSnapshot(input.snapshot);
        if (!snapshot || snapshot.sessionId !== s.sessionId) { this.send(socket, { type: "error", error: "invalid_snapshot" }); return; }
        s.snapshot = snapshot;
        s.mirrorDirty = true;
        await this.save();
        this.broadcast();
        this.mirrorSnapshot();
        return;
      }
      const command = input.type === "command" && identity.role === "controller" ? parseRemoteCommand(input.command) : null;
      if (!command) { this.send(socket, { type: "error", error: "invalid_command" }); return; }
      const allowed = this.connected() && remoteCommandDisposition(command.command, s.snapshot.paused, s.snapshot.awaitingNextExercise, s.snapshot.phase, s.snapshot.rewardActive) !== "ignore";
      const now = Date.now();
      const stored = await storeRealtimeCommand(this.env.DB, s, identity.adultId, command, allowed, now);
      if (!stored) { this.send(socket, { type: "error", error: allowed ? "controller_replaced" : "session_not_ready", clientEventId: command.clientEventId }); return; }
      const event = stored.event;
      if (stored.inserted && event.command === "pause") s.snapshot = { ...s.snapshot, paused: true };
      if (stored.inserted && event.command === "resume") s.snapshot = { ...s.snapshot, paused: false };
      if (stored.inserted && event.command === "toggle_reward") s.snapshot = { ...s.snapshot, rewardActive: !s.snapshot.rewardActive };
      await this.save();
      for (const host of this.ctx.getWebSockets()) if (this.identity(host).role === "host" && this.valid(this.identity(host))) this.send(host, { type: "events", events: [event] });
      this.send(socket, { type: "ack", clientEventId: command.clientEventId, serverSequence: event.serverSequence });
      this.broadcast();
    }).catch(() => this.send(socket, { type: "error", error: "storage_unavailable" }));
  }

  async webSocketClose(socket: WebSocket) {
    const identity = this.identity(socket);
    if (!this.valid(identity) || this.ctx.getWebSockets().some((other) => other !== socket && this.identity(other).role === identity.role && this.valid(this.identity(other)))) return;
    if (identity.role === "host") this.session!.hostSeen = 0; else this.session!.controllerSeen = 0;
    await this.save();
    this.broadcast();
  }
  async webSocketError(socket: WebSocket) { await this.webSocketClose(socket); }
  async alarm() {
    this.broadcast();
    if (this.session?.mirrorDirty) this.mirrorSnapshot();
    if (this.session?.mirrorDirty || (this.session?.status === "connected" && this.ctx.getWebSockets().length)) await this.ctx.storage.setAlarm(Date.now() + CONTROLLER_LEASE_MS);
  }
}
