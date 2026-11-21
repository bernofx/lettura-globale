// Run against the local production build and a fresh Chromium profile with CDP.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { writeFileSync } from "node:fs";

const origin = process.env.COLORING_TEST_ORIGIN ?? "http://127.0.0.1:5180";
const debuggerUrl = process.env.COLORING_TEST_DEBUGGER ?? "http://127.0.0.1:9222";
const tabs = await (await fetch(`${debuggerUrl}/json/list`)).json();
const socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const therapist = { id: "adult-coloring-demo", firstName: "Demo", lastName: "Giochi", email: "games@example.test", role: "Terapista", childIds: [] };
const state = { schemaVersion: 1, therapists: [therapist], children: [], library: [], exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [] };
const pending = new Map();
let id = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const command = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) command?.reject(new Error(message.error.message));
    else command?.resolve(message.result);
  }
  if (message.method === "Fetch.requestPaused") {
    const { requestId } = message.params;
    void send("Fetch.fulfillRequest", {
      requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ state, revision: 1 })).toString("base64"),
    });
  }
});

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true });
  assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

async function wait(expression) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${expression}`);
}

async function button(label) {
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
}

async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await wait(`innerWidth === ${width} && innerHeight === ${height}`);
}

async function touch(type, x, y) {
  let touchPoints = [];
  if (type === "touchStart" || type === "touchMove") {
    const point = await evaluate(`(() => {
      const canvas = document.querySelector('.coloring-board canvas');
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + rect.width * ${x} / canvas.width,
        y: rect.top + rect.height * ${y} / canvas.height };
    })()`);
    touchPoints = [{ ...point, id: 1 }];
  }
  await send("Input.dispatchTouchEvent", { type, touchPoints });
}

const rgb = (x, y) => evaluate(`Array.from(document.querySelector('.coloring-board canvas').getContext('2d').getImageData(${x}, ${y}, 1, 1).data)`);
const white = [255, 255, 255, 255];
const red = [232, 66, 82, 255];
const green = [43, 155, 88, 255];

try {
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/state*` }] });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem("lg-therapists", ${JSON.stringify(JSON.stringify([therapist]))});
    localStorage.setItem("lg-children", "[]");
    localStorage.setItem("lg-therapist-session", JSON.stringify({
      therapistId: ${JSON.stringify(therapist.id)}, expiresAt: Date.now() + 86400000
    }));
  ` });
  await send("Page.navigate", { url: origin });
  await viewport(390, 800);
  await wait("document.querySelector('.child-choice-page')");
  await button("Apri Giochi");
  await wait("document.querySelectorAll('.coloring-card').length === 4");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.coloring-workspace')).display"), "none");
  assert.equal(await evaluate("document.querySelector('.coloring-rotate').checkVisibility()"), true);
  await viewport(800, 390);
  assert.equal(await evaluate("document.querySelector('.coloring-rotate').checkVisibility()"), false);
  assert.equal(await evaluate("document.querySelector('.coloring-colors').scrollHeight > document.querySelector('.coloring-colors').clientHeight"), true);

  await touch("touchStart", 315, 183);
  await touch("touchMove", 315, 275);
  await touch("touchMove", 300, 210);
  await touch("touchEnd");
  assert.deepEqual(await rgb(315, 215), red, "brush works within the roof");
  assert.deepEqual(await rgb(300, 210), red, "the stroke resumes inside its original area");
  assert.deepEqual(await rgb(315, 272), white, "dragging past the roof leaves the wall untouched");

  await touch("touchStart", 115, 140);
  await touch("touchMove", 355, 135);
  await touch("touchEnd");
  assert.deepEqual(await rgb(355, 135), white, "a gesture started outside the drawing cannot enter a paintable area");

  await button("Pastello");
  await button("Blu");
  await touch("touchStart", 295, 350);
  await touch("touchMove", 360, 350);
  await touch("touchEnd");
  assert.notDeepEqual(await rgb(300, 350), white, "new contact paints the wall with the crayon");
  assert.deepEqual(await rgb(355, 350), white, "crayon leaves the overlapping door untouched");

  await button("Secchio");
  await button("Verde");
  await touch("touchStart", 355, 350);
  await touch("touchEnd");
  assert.deepEqual(await rgb(340, 330), green, "bucket fills all of the door");
  assert.deepEqual(await rgb(235, 355), white, "bucket leaves the wall outside the door untouched");
  assert.deepEqual(await rgb(315, 215), red, "bucket preserves existing strokes in other zones");
  await viewport(390, 800);
  await viewport(800, 390);
  assert.deepEqual(await rgb(340, 330), green, "rotation preserves the current drawing");

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-coloring-landscape.png", Buffer.from(screenshot.data, "base64"));
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog')");
  await button("Lumaca");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await button("Esci");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  assert.deepEqual(await rgb(340, 330), green, "switching drawings preserves work until leaving Games");
  console.log("PASS Coloring browser: global entry, portrait/landscape, touch clipping, crayon, bucket, and drawing changes.");
} finally {
  socket.close();
}
