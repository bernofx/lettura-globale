import type { RealtimeClientMessage, RealtimeMessage } from "./domain/realtime-protocol";

type Options = {
  sessionId: string; role: "host" | "controller"; controllerKey?: string;
  since?: () => number;
  onMessage: (message: RealtimeMessage) => void;
  onConnection: (connected: boolean, reason?: string) => void;
};

// This connection never switches to polling. Reconnect only to the selected DO session.
export class RealtimeSocket {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private failures = 0;
  private pending = new Map<string, { command: Extract<RealtimeClientMessage, { type: "command" }>["command"]; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private abort: AbortController | null = null;
  constructor(private options: Options) { void this.connect(); }

  private async connect() {
    if (this.stopped) return;
    this.abort = new AbortController();
    const timeout = setTimeout(() => this.abort?.abort(), 6_500);
    try {
      const response = await fetch("/api/controller/realtime", { method: "POST", signal: this.abort.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ticket", sessionId: this.options.sessionId, role: this.options.role, controllerKey: this.options.controllerKey, since: this.options.since?.() ?? 0 }) });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        if ([401, 403, 404, 410].includes(response.status)) {
          this.options.onConnection(false, body.error ?? "forbidden");
          this.stop(); return;
        }
        throw new Error(body.error ?? "connection_failed");
      }
      const result = await response.json() as { socketUrl: string };
      if (this.stopped) return;
      const socket = new WebSocket(result.socketUrl);
      this.socket = socket;
      this.lastPong = Date.now();
      const connectionTimeout = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) socket.close(); }, 8_000);
      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.failures = 0;
        this.options.onConnection(true);
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastPong > 8_000) { this.options.onConnection(false); socket.close(); return; }
          this.send({ type: "ping" });
        }, 2_500);
        this.send({ type: "ping" });
        for (const pending of this.pending.values()) this.send({ type: "command", command: pending.command });
      };
      socket.onmessage = (event) => {
        if (this.stopped) return;
        let message: RealtimeMessage;
        try { message = JSON.parse(event.data); } catch { return; }
        this.lastPong = Date.now();
        if (message.type === "replaced") { this.options.onConnection(false, "controller_replaced"); this.stop(); return; }
        if ((message.type === "ack" || message.type === "error") && message.clientEventId) {
          const pending = this.pending.get(message.clientEventId);
          if (pending) {
            clearTimeout(pending.timer); this.pending.delete(message.clientEventId);
            if (message.type === "ack") pending.resolve(); else pending.reject(new Error(message.error));
          }
        }
        this.options.onMessage(message);
      };
      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = null;
        if (this.stopped || this.socket !== socket) return;
        this.options.onConnection(false, event.code === 4001 || event.code === 4000 ? "controller_replaced" : undefined);
        if (event.code === 4001 || event.code === 4000) this.stop(); else this.scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    } catch {
      if (!this.stopped) { this.options.onConnection(false); this.scheduleReconnect(); }
    } finally { clearTimeout(timeout); }
  }
  private scheduleReconnect() {
    if (this.stopped) return;
    this.retry = setTimeout(() => void this.connect(), Math.min(5_000, 500 * 2 ** Math.min(this.failures++, 4)));
  }
  send(message: RealtimeClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.stopped) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  command(command: Extract<RealtimeClientMessage, { type: "command" }>["command"]) {
    return new Promise<void>((resolve, reject) => {
      if (this.pending.has(command.clientEventId)) { reject(new Error("duplicate_pending_command")); return; }
      const timer = setTimeout(() => { this.pending.delete(command.clientEventId); reject(new Error("command_timeout")); }, 6_500);
      this.pending.set(command.clientEventId, { command, resolve, reject, timer });
      if (!this.send({ type: "command", command })) {
        clearTimeout(timer); this.pending.delete(command.clientEventId); reject(new Error("not_connected"));
      }
    });
  }
  stop() {
    this.stopped = true;
    this.abort?.abort();
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("disconnected")); }
    this.pending.clear();
  }
}
