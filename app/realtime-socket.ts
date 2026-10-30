import type { RealtimeClientMessage, RealtimeMessage } from "./domain/realtime-protocol";

export type CommandTiming = { clientEventId: string; startedAt: number; ackMs?: number; appliedMs?: number; hostMs?: number };
type Command = Extract<RealtimeClientMessage, { type: "command" }>["command"];
type Timer = ReturnType<typeof setTimeout>;
export type RealtimeRuntime = {
  request: typeof fetch; socket: (url: string) => WebSocket; now: () => number; wallNow: () => number;
  later: (callback: () => void, delay: number) => Timer; cancel: (timer: Timer) => void;
  every: (callback: () => void, delay: number) => Timer; cancelEvery: (timer: Timer) => void;
  onResume: (callback: () => void) => () => void;
};
type Options = {
  sessionId: string; role: "host" | "controller"; controllerKey?: string; since?: () => number;
  onMessage: (message: RealtimeMessage) => void;
  onConnection: (connected: boolean, reason?: string) => void;
  onTiming?: (timing: CommandTiming) => void;
};
function browserRuntime(): RealtimeRuntime {
  return {
    request: (...args) => fetch(...args), socket: (url) => new WebSocket(url), now: () => performance.now(), wallNow: () => Date.now(),
    later: (fn, ms) => setTimeout(fn, ms), cancel: (timer) => clearTimeout(timer),
    every: (fn, ms) => setInterval(fn, ms), cancelEvery: (timer) => clearInterval(timer),
    onResume(callback) {
      if (typeof window === "undefined") return () => {};
      const resume = () => { if (document.visibilityState !== "hidden") callback(); };
      window.addEventListener("online", resume); window.addEventListener("pageshow", resume);
      document.addEventListener("visibilitychange", resume);
      return () => { window.removeEventListener("online", resume); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume); };
    },
  };
}

// Ordered WebSocket frames + the DO's durable sequence replace a browser ack queue.
// Recovery never switches sessions or creates new IDs for uncertain commands.
export class RealtimeSocket {
  private socket: WebSocket | null = null;
  private stopped = false;
  private connecting = false;
  private epoch = 0;
  private retry: Timer | null = null;
  private heartbeat: Timer | null = null;
  private handshake: Timer | null = null;
  private resumeProbe: Timer | null = null;
  private lastPong = 0;
  private lastPongWall = 0;
  private connectStarted = 0;
  private connectStartedWall = 0;
  private failures = 0;
  private pending = new Map<string, { command: Command; resolve: () => void; reject: (error: Error) => void; timer: Timer; startedAt: number; startedWall: number }>();
  private timings = new Map<string, CommandTiming & { sequence?: number; startedWall: number }>();
  private abort: AbortController | null = null;
  private runtime: RealtimeRuntime;
  private removeResume: () => void;
  private options: Options;
  constructor(options: Options, runtime?: Partial<RealtimeRuntime>) {
    this.options = options;
    this.runtime = { ...browserRuntime(), ...runtime };
    this.removeResume = this.runtime.onResume(() => this.resume());
    void this.connect();
  }
  private clearConnectionTimers() {
    if (this.heartbeat) this.runtime.cancelEvery(this.heartbeat);
    if (this.handshake) this.runtime.cancel(this.handshake);
    if (this.resumeProbe) this.runtime.cancel(this.resumeProbe);
    this.heartbeat = this.handshake = this.resumeProbe = null;
  }
  private retireSocket() {
    const socket = this.socket;
    this.socket = null;
    this.clearConnectionTimers();
    if (socket) { socket.onclose = socket.onmessage = socket.onopen = socket.onerror = null; try { socket.close(); } catch { /* Retired socket must not block recovery. */ } }
  }
  private resume() {
    if (this.stopped) return;
    const attemptAge = Math.max(this.runtime.now() - this.connectStarted, this.runtime.wallNow() - this.connectStartedWall);
    if ((this.connecting || this.socket?.readyState === 0) && attemptAge < 5_000) return;
    if (this.connecting) { this.epoch++; this.abort?.abort(); this.connecting = false; }
    if (this.socket?.readyState === 1) {
      this.send({ type: "ping" });
      if (this.silenceMs() >= 5_000 && !this.resumeProbe) {
        const socket = this.socket;
        this.resumeProbe = this.runtime.later(() => {
          this.resumeProbe = null;
          if (!this.stopped && this.socket === socket) { this.retireSocket(); this.options.onConnection(false); void this.connect(); }
        }, 800);
      }
      return;
    }
    if (this.retry) this.runtime.cancel(this.retry);
    this.retry = null;
    this.retireSocket();
    this.options.onConnection(false);
    void this.connect();
  }
  private reconnectSoon() {
    if (this.stopped) return;
    this.retireSocket();
    this.options.onConnection(false);
    this.scheduleReconnect();
  }
  private silenceMs() { return Math.max(0, this.runtime.now() - this.lastPong, this.runtime.wallNow() - this.lastPongWall); }
  private markActivity() {
    this.lastPong = this.runtime.now(); this.lastPongWall = this.runtime.wallNow();
    if (this.resumeProbe) this.runtime.cancel(this.resumeProbe);
    this.resumeProbe = null;
  }
  private async connect() {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    this.connectStarted = this.runtime.now(); this.connectStartedWall = this.runtime.wallNow();
    const epoch = ++this.epoch;
    const abort = new AbortController();
    this.abort = abort;
    const timeout = this.runtime.later(() => abort.abort(), 6_500);
    try {
      const response = await this.runtime.request("/api/controller/realtime", { method: "POST", signal: abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ticket", sessionId: this.options.sessionId, role: this.options.role, controllerKey: this.options.controllerKey, since: this.options.since?.() ?? 0 }) });
      if (this.stopped || epoch !== this.epoch) return;
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        if ([401, 403, 404, 410].includes(response.status)) { this.options.onConnection(false, body.error ?? "forbidden"); this.stop(); return; }
        throw new Error(body.error ?? "connection_failed");
      }
      const result = await response.json() as { socketUrl: string };
      if (this.stopped || epoch !== this.epoch) return;
      const socket = this.runtime.socket(result.socketUrl);
      this.socket = socket;
      this.markActivity();
      this.handshake = this.runtime.later(() => { if (this.socket === socket && socket.readyState !== 1) this.reconnectSoon(); }, 8_000);
      socket.onopen = () => {
        if (this.stopped || this.socket !== socket) return;
        if (this.handshake) this.runtime.cancel(this.handshake);
        this.handshake = null;
        this.failures = 0;
        this.options.onConnection(true);
        this.heartbeat = this.runtime.every(() => {
          if (this.silenceMs() > 8_000) { this.reconnectSoon(); return; }
          this.send({ type: "ping" });
        }, 2_500);
        this.send({ type: "ping" });
        for (const [id, entry] of this.pending) {
          if (Math.max(this.runtime.now() - entry.startedAt, this.runtime.wallNow() - entry.startedWall) >= 6_500) { this.runtime.cancel(entry.timer); this.pending.delete(id); entry.reject(new Error("command_timeout")); }
          else this.send({ type: "command", command: entry.command });
        }
      };
      socket.onmessage = (event) => {
        if (this.stopped || this.socket !== socket) return;
        let message: RealtimeMessage;
        try { message = JSON.parse(event.data); } catch { return; }
        this.markActivity();
        if (message.type === "replaced") { this.options.onConnection(false, "controller_replaced"); this.stop(); return; }
        if (message.type === "ack" || message.type === "applied") {
          const timing = this.timings.get(message.clientEventId);
          if (timing && (timing.sequence === undefined || timing.sequence === message.serverSequence)) {
            timing.sequence = message.serverSequence;
            const elapsed = Math.max(0, Math.round(this.runtime.now() - timing.startedAt), Math.round(this.runtime.wallNow() - timing.startedWall));
            if (message.type === "ack") timing.ackMs ??= elapsed;
            else { timing.appliedMs ??= elapsed; timing.hostMs = message.hostMs; }
            this.options.onTiming?.({ ...timing });
          }
        }
        if ((message.type === "ack" || message.type === "error") && message.clientEventId) {
          const pending = this.pending.get(message.clientEventId);
          if (pending) {
            this.runtime.cancel(pending.timer); this.pending.delete(message.clientEventId);
            if (message.type === "ack") pending.resolve(); else pending.reject(new Error(message.error));
          }
        }
        this.options.onMessage(message);
      };
      socket.onclose = (event) => {
        if (this.stopped || this.socket !== socket) return;
        this.socket = null;
        this.clearConnectionTimers();
        const replaced = event.code === 4001 || event.code === 4000;
        this.options.onConnection(false, replaced ? "controller_replaced" : undefined);
        if (replaced) this.stop(); else this.scheduleReconnect();
      };
      socket.onerror = () => { if (this.socket === socket) this.reconnectSoon(); };
    } catch {
      if (!this.stopped && epoch === this.epoch) { this.options.onConnection(false); this.scheduleReconnect(); }
    } finally {
      this.runtime.cancel(timeout);
      if (epoch === this.epoch) this.connecting = false;
    }
  }
  private scheduleReconnect() {
    if (this.stopped || this.retry) return;
    this.retry = this.runtime.later(() => { this.retry = null; void this.connect(); }, Math.min(5_000, 500 * 2 ** Math.min(this.failures++, 4)));
  }
  send(message: RealtimeClientMessage) {
    if (this.socket?.readyState !== 1 || this.stopped) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  command(command: Command, startedAt = this.runtime.now()) {
    return new Promise<void>((resolve, reject) => {
      if (this.pending.has(command.clientEventId)) { reject(new Error("duplicate_pending_command")); return; }
      if (this.pending.size >= 32) { reject(new Error("command_busy")); return; }
      const timer = this.runtime.later(() => { this.pending.delete(command.clientEventId); reject(new Error("command_timeout")); }, 6_500);
      const startedWall = this.runtime.wallNow();
      this.timings.set(command.clientEventId, { clientEventId: command.clientEventId, startedAt, startedWall });
      if (this.timings.size > 32) this.timings.delete(this.timings.keys().next().value!);
      this.pending.set(command.clientEventId, { command, resolve, reject, timer, startedAt, startedWall });
      if (!this.send({ type: "command", command })) {
        this.runtime.cancel(timer); this.pending.delete(command.clientEventId); reject(new Error("not_connected"));
      }
    });
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.epoch++;
    this.abort?.abort();
    if (this.retry) this.runtime.cancel(this.retry);
    this.removeResume();
    this.retireSocket();
    for (const entry of this.pending.values()) { this.runtime.cancel(entry.timer); entry.reject(new Error("disconnected")); }
    this.pending.clear(); this.timings.clear();
  }
}
