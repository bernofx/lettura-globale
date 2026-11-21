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
  await evaluate(`[...(document.querySelector('dialog[open]') ?? document).querySelectorAll('button')]
    .find(button => (button.getAttribute('aria-label') ?? button.textContent.trim()) === ${JSON.stringify(label)}).click()`);
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
    window.testMusic = { starts: 0, stops: 0 };
    const nativeStart = AudioBufferSourceNode.prototype.start;
    const nativeStop = AudioBufferSourceNode.prototype.stop;
    const nativeConnect = AudioBufferSourceNode.prototype.connect;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) window.testMusic.starts++;
      return nativeStart.apply(this, args);
    };
    AudioBufferSourceNode.prototype.connect = function (target, ...args) {
      if (this.loop && target instanceof GainNode) window.testMusic.gain = target.gain;
      return nativeConnect.call(this, target, ...args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if (this.loop) window.testMusic.stops++;
      return nativeStop.apply(this, args);
    };
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
  await wait("document.querySelectorAll('.coloring-card').length >= 24");
  await wait(`[...document.querySelectorAll('.coloring-card canvas')].every(canvas =>
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0))`);
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.coloring-heading').textContent.trim()"), "Esci");
  assert.equal(await evaluate("document.querySelector('.coloring-dialog').getAttribute('aria-label')"), "Colorare");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.coloring-workspace')).display"), "none");
  assert.equal(await evaluate("document.querySelector('.coloring-rotate').checkVisibility()"), true);
  await viewport(800, 390);
  assert.equal(await evaluate("document.querySelector('.coloring-rotate').checkVisibility()"), false);
  assert.equal(await evaluate("document.querySelector('.coloring-colors').scrollHeight > document.querySelector('.coloring-colors').clientHeight"), true);
  await viewport(568, 320);
  assert.equal(await evaluate(`[...document.querySelectorAll('.coloring-heading button, .coloring-board, .coloring-controls, .coloring-tools button')].every(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight && bounds.left >= 0;
  })`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('.coloring-tools button, .coloring-colors button')].every(button =>
    !button.textContent.trim() && button.hasAttribute('aria-label') && button.offsetWidth >= 44 && button.offsetHeight >= 44)`), true);
  assert.equal(await evaluate(`document.querySelector('.coloring-tools').getBoundingClientRect().right <=
    document.querySelector('.coloring-colors').getBoundingClientRect().left`), true);
  await evaluate("document.querySelector('.coloring-colors').scrollTop = document.querySelector('.coloring-colors').scrollHeight");
  assert.equal(await evaluate(`document.querySelector('button[aria-label="Bianco"]').getBoundingClientRect().bottom <=
    document.querySelector('.coloring-colors').getBoundingClientRect().bottom`), true);

  await touch("touchStart", 315, 183);
  await touch("touchMove", 315, 275);
  await touch("touchMove", 300, 210);
  await touch("touchEnd");
  await wait("window.testMusic.starts === 1 && window.testMusic.gain?.value > 0");
  await button("Musica di sottofondo");
  await wait("window.testMusic.gain?.value === 0");
  await button("Musica di sottofondo");
  await wait("window.testMusic.gain?.value > 0");
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
  await wait("window.testMusic.gain?.value === 0");
  await viewport(568, 320);
  await wait("window.testMusic.gain?.value > 0");
  assert.deepEqual(await rgb(340, 330), green, "rotation preserves the current drawing");

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-coloring-landscape.png", Buffer.from(screenshot.data, "base64"));
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog')");
  await wait("window.testMusic.stops === 1");
  await button("Lumaca");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await button("Esci");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  assert.deepEqual(await rgb(340, 330), green, "switching drawings preserves work until leaving Games");
  await button("Esci");
  await evaluate("history.back()");
  await wait("document.querySelector('.child-choice-page')");
  await evaluate("history.forward()");
  await wait("document.querySelector('.games-page')");
  console.log("PASS Colorare: catalog, compact phone layout, scrolling palette, touch, rotation, and music lifecycle.");
} finally {
  socket.close();
}
