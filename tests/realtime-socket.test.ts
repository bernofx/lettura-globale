import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeSocket, type RealtimeRuntime, type CommandTiming } from "../app/realtime-socket.ts";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
class Socket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; /* Simulate a browser delaying the close event indefinitely. */ }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  lost(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
function setup(request?: RealtimeRuntime["request"]) {
  let now = 0, next = 1, wallOffset = 0;
  let resume: (() => void) | null = null;
  let removed = false, requests = 0;
  const timers = new Map<number, { at: number; callback: () => void; repeat: number }>();
  const sockets: Socket[] = [], timings: CommandTiming[] = [], connections: Array<[boolean, string | undefined]> = [];
  const schedule = (callback: () => void, delay: number, repeat = 0) => { const id = next++; timers.set(id, { at: now + delay, callback, repeat }); return id as unknown as ReturnType<typeof setTimeout>; };
  const cancel = (id: ReturnType<typeof setTimeout>) => { timers.delete(id as unknown as number); };
  const runtime: RealtimeRuntime = {
    request: async (...args) => { requests++; return request ? request(...args) : Response.json({ socketUrl: "wss://example.test/connect" }); },
    socket: () => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; },
    now: () => now,
    wallNow: () => now + wallOffset,
    later: (fn, delay) => schedule(fn, delay), cancel,
    every: (fn, delay) => schedule(fn, delay, delay), cancelEvery: cancel,
    onResume: (fn) => { resume = fn; return () => { removed = true; resume = null; }; },
  };
  const client = new RealtimeSocket({ sessionId: "session-demo", role: "controller", controllerKey: "a".repeat(64), onMessage() {}, onConnection: (connected, reason) => connections.push([connected, reason]), onTiming: (timing) => timings.push(timing) }, runtime);
  return { client, sockets, timings, connections, timers,
    get requests() { return requests; }, get removed() { return removed; },
    resume: () => resume?.(), sleep: (ms: number) => { now += ms; },
    wallSleep: (ms: number) => { wallOffset += ms; },
    tick(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, item] = due;
        now = Math.max(now, item.at);
        if (item.repeat) item.at += item.repeat; else timers.delete(id);
        item.callback();
      }
      now = until;
    },
  };
}

test("due comandi partono in ordine senza attendere l'ack; ricezione e PC hanno misure distinte", async () => {
  const run = setup(); await flush(); const socket = run.sockets[0]; socket.open();
  const first = run.client.command({ clientEventId: "command-first", command: "next" });
  const second = run.client.command({ clientEventId: "command-second", command: "pause" });
  assert.deepEqual(socket.sent.filter((m) => m.type === "command").map((m) => (m.command as { clientEventId: string }).clientEventId), ["command-first", "command-second"]);
  run.sleep(90); socket.message({ type: "ack", clientEventId: "command-first", serverSequence: 1 });
  await first;
  assert.equal(run.timings[0].ackMs, 90); assert.equal(run.timings[0].appliedMs, undefined);
  run.sleep(60); socket.message({ type: "applied", clientEventId: "command-first", serverSequence: 1, hostMs: 12 });
  assert.equal(run.timings.at(-1)?.appliedMs, 150); assert.equal(run.timings.at(-1)?.hostMs, 12);
  socket.message({ type: "ack", clientEventId: "command-second", serverSequence: 2 }); await second;
  run.client.stop(); assert.equal(run.removed, true); assert.equal(run.timers.size, 0);
});

test("ritorno dall'app: riconnessione immediata, stesso ID pendente e nessun effetto da socket obsoleti", async () => {
  const run = setup(); await flush(); const old = run.sockets[0]; old.open();
  const pending = run.client.command({ clientEventId: "command-recover", command: "toggle_reward" });
  const lateClose = old.onclose, lateMessage = old.onmessage;
  run.sleep(5_500); run.resume(); run.resume(); run.tick(800); await flush();
  assert.equal(run.requests, 2, "i resume ripetuti non aprono ticket concorrenti");
  const current = run.sockets[1]; current.open();
  assert.equal((current.sent.find((m) => m.type === "command")?.command as { clientEventId: string }).clientEventId, "command-recover");
  lateClose?.({ code: 1006 }); lateMessage?.({ data: JSON.stringify({ type: "ack", clientEventId: "command-recover", serverSequence: 99 }) });
  assert.equal(run.timings.length, 0);
  current.message({ type: "ack", clientEventId: "command-recover", serverSequence: 1 }); await pending;
  assert.equal(run.timings[0].ackMs, 6_300);
  run.client.stop();
});

test("comandi scaduti durante sospensione non vengono reinviati al ritorno", async () => {
  const run = setup(); await flush(); run.sockets[0].open();
  const pending = assert.rejects(run.client.command({ clientEventId: "command-expired", command: "next" }), /command_timeout/);
  run.sleep(7_000); run.resume(); run.tick(800); await flush(); run.sockets[1].open(); await pending;
  assert.equal(run.sockets[1].sent.some((m) => m.type === "command"), false);
  run.client.stop();
});

test("socket morto: l'heartbeat avvia il recupero senza aspettare l'evento close del browser", async () => {
  const run = setup(); await flush(); run.sockets[0].open();
  run.tick(10_000); assert.equal(run.sockets[0].readyState, 3);
  run.tick(500); await flush(); assert.equal(run.requests, 2);
  run.client.stop();
});

test("sospensione del dispositivo: recupera anche se performance.now resta congelato", async () => {
  const run = setup(); await flush(); run.sockets[0].open();
  const pending = assert.rejects(run.client.command({ clientEventId: "wall-suspended", command: "next" }), /command_timeout/);
  run.wallSleep(30_000); run.resume(); run.tick(800); await flush(); run.sockets[1].open(); await pending;
  assert.equal(run.requests, 2);
  assert.equal(run.sockets[1].sent.some((message) => message.type === "command"), false);
  run.client.stop();
});

test("una connessione sana dopo sospensione risponde al probe senza perdere il lease", async () => {
  const run = setup(); await flush(); run.sockets[0].open();
  run.sleep(6_000); run.resume(); run.sockets[0].message({ type: "pong" });
  run.tick(800); await flush();
  assert.equal(run.requests, 1); assert.equal(run.sockets[0].readyState, 1);
  run.client.stop();
});

test("un ticket rimasto sospeso non blocca il nuovo tentativo e non crea socket tardivi", async () => {
  let first = true, resolve!: (response: Response) => void;
  const run = setup(async () => {
    if (!first) return Response.json({ socketUrl: "wss://example.test/new" });
    first = false; return new Promise<Response>((done) => { resolve = done; });
  });
  run.wallSleep(6_000); run.resume(); await flush();
  assert.equal(run.requests, 2); assert.equal(run.sockets.length, 1);
  resolve(Response.json({ socketUrl: "wss://example.test/stale" })); await flush();
  assert.equal(run.sockets.length, 1);
  run.client.stop();
});

test("ripresa accelera il backoff; revoca e chiusura definitiva non vengono aggirate", async () => {
  const run = setup(); await flush(); run.sockets[0].open(); run.sockets[0].lost();
  run.resume(); await flush(); assert.equal(run.requests, 2);
  run.sockets[1].open(); run.sockets[1].message({ type: "replaced" });
  run.resume(); run.tick(60_000); await flush(); assert.equal(run.requests, 2); assert.equal(run.removed, true);
  const denied = setup(async () => Response.json({ error: "controller_replaced" }, { status: 403 }));
  await flush(); denied.resume(); denied.tick(60_000); await flush();
  assert.equal(denied.requests, 1); assert.equal(denied.sockets.length, 0);
});

test("timeout e stop cancellano attese, listener e tentativi tardivi", async () => {
  const run = setup(); await flush(); run.sockets[0].open();
  const pending = assert.rejects(run.client.command({ clientEventId: "command-timeout", command: "next" }), /command_timeout/);
  run.tick(6_500); await pending; run.client.stop(); assert.equal(run.timers.size, 0);
  let resolve!: (value: Response) => void;
  const stopped = setup(() => new Promise<Response>((done) => { resolve = done; }));
  stopped.client.stop(); resolve(Response.json({ socketUrl: "wss://example.test/connect" })); await flush();
  assert.equal(stopped.sockets.length, 0); assert.equal(stopped.timers.size, 0);
});

test("la diagnostica è limitata e ignora ricevute vecchie o di una sequenza diversa", async () => {
  const run = setup(); await flush(); const socket = run.sockets[0]; socket.open();
  for (let index = 0; index < 40; index++) {
    const promise = run.client.command({ clientEventId: `command-${index}`, command: "next" });
    socket.message({ type: "ack", clientEventId: `command-${index}`, serverSequence: index + 1 }); await promise;
  }
  const count = run.timings.length;
  socket.message({ type: "applied", clientEventId: "command-0", serverSequence: 1, hostMs: 1 });
  socket.message({ type: "applied", clientEventId: "command-39", serverSequence: 99, hostMs: 1 });
  assert.equal(run.timings.length, count);
  run.client.stop();
});
