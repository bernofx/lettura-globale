// Run against the local production build and a fresh Chromium profile with CDP.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync, writeFileSync } from "node:fs";

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
let stateRevision = 1;
const pending = new Map();
let id = 0;
let availableVersion = null;
let hasCustomSoundtrack = false;
const soundtrack = { name: "coloring-game.mp3", etag: "test-mp3" };
const gameSoundtrackPath = "/api/game-soundtrack";
const puzzlePath = "/api/puzzle-images";
const drawingsPath = "/api/coloring-drawings";
const drawingScope = "b".repeat(32);
const cloudDrawings = new Map();
const puzzleUploads = new Map();
let postponePuzzleUpload = true;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { method, resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const command = pending.get(message.id);
    pending.delete(message.id);
    // A page reload can cancel an intercepted request before CDP replies.
    const cancelled = command?.method.startsWith("Fetch.") && message.error?.message.includes("Invalid InterceptionId");
    if (message.error && !cancelled) command?.reject(new Error(command.method + ": " + message.error.message));
    else command?.resolve(message.result);
  }
  if (message.method === "Fetch.requestPaused") {
    const { requestId, request } = message.params;
    if (request.url === `${origin}/api/app-version` && availableVersion === null) {
      void send("Fetch.continueRequest", { requestId });
      return;
    }
    const url = new URL(request.url);
    if (url.pathname === drawingsPath) {
      const drawingId = url.searchParams.get("drawing");
      const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
      assert.equal(headers["x-coloring-profile"], therapist.id);
      const drawing = cloudDrawings.get(drawingId);
      let data = url.searchParams.has("gallery")
        ? { scope: drawingScope, drawings: [...cloudDrawings].map(([id, saved]) => ({ id, etag: saved.operation })) }
        : { scope: drawingScope, drawing: drawing ?? null, etag: drawing?.operation };
      if (request.method === "PUT") {
        assert.equal(headers["x-coloring-scope"], drawingScope);
        const saved = JSON.parse(request.postData);
        cloudDrawings.set(drawingId, saved);
        data = { written: true, etag: saved.operation };
      }
      void send("Fetch.fulfillRequest", {
        requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(data)).toString("base64"),
      });
      return;
    }
    if (url.pathname === puzzlePath) {
      const puzzleId = url.searchParams.get("image");
      let status = 200;
      let data;
      if (request.method === "PUT") {
        const title = decodeURIComponent(Object.entries(request.headers).find(([name]) => name.toLowerCase() === "x-puzzle-title")?.[1] ?? "");
        if (postponePuzzleUpload && title === "giochi") {
          status = 503;
          data = { error: "storage_unavailable" };
        } else {
          const image = { id: puzzleId, title, image: puzzlePath + "?image=" + puzzleId };
          puzzleUploads.set(puzzleId, image);
          data = { image };
        }
      } else if (request.method === "DELETE") {
        puzzleUploads.delete(puzzleId);
        data = { deleted: true };
      } else if (!puzzleId) {
        data = { scope: "a".repeat(32), images: [...puzzleUploads.values()] };
      } else if (!puzzleUploads.has(puzzleId)) {
        status = 404;
        data = { error: "image_not_found" };
      }
      void send("Fetch.fulfillRequest", {
        requestId, responseCode: status,
        responseHeaders: [{ name: "Content-Type", value: data ? "application/json" : "image/webp" }],
        body: (data ? Buffer.from(JSON.stringify(data)) : readFileSync("public/images/categories/casa.webp")).toString("base64"),
      });
      return;
    }
    if (url.pathname === gameSoundtrackPath) {
      if (request.method === "PUT") {
        const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
        assert.equal(headers["x-soundtrack-rights"], "confirmed", "the rights confirmation is sent with the upload");
        assert.equal(decodeURIComponent(headers["x-soundtrack-source"]), "Registrazione di prova", "the source is sent with the upload");
        assert.equal(decodeURIComponent(headers["x-soundtrack-license"]), "CC0", "the licence is sent with the upload");
        hasCustomSoundtrack = true;
      }
      if (request.method === "DELETE") hasCustomSoundtrack = false;
      const info = url.searchParams.has("info") || request.method !== "GET";
      const audio = !info && hasCustomSoundtrack;
      const body = info
        ? Buffer.from(JSON.stringify({ soundtrack: hasCustomSoundtrack ? soundtrack : null }))
        : audio ? readFileSync("public/audio/coloring-game.mp3") : Buffer.from("{}");
      void send("Fetch.fulfillRequest", {
        requestId, responseCode: info || audio ? 200 : 404,
        responseHeaders: [{ name: "Content-Type", value: audio ? "audio/mpeg" : "application/json" }],
        body: body.toString("base64"),
      });
      return;
    }
    if (url.pathname === "/api/state/changes" && request.method === "PATCH") {
      const { values } = JSON.parse(request.postData);
      if (typeof values.tracingOrderRequired === "boolean") state.tracingOrderRequired = values.tracingOrderRequired;
      stateRevision++;
    }
    const body = request.url === `${origin}/api/app-version` ? { version: availableVersion } : { state, revision: stateRevision };
    void send("Fetch.fulfillRequest", {
      requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
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

async function chooseFixture(selector, fixture) {
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, selector);
  await send("DOM.setFileInputFiles", { nodeId, files: [new URL(fixture, import.meta.url).pathname] });
}

async function assertGameIgnoresBack(selector) {
  await wait("history.state?.lgGameGuard");
  const state = await evaluate("history.state.lgGameGuard");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { currentIndex, entries } = await send("Page.getNavigationHistory");
    const pops = await evaluate("window.testGamePops");
    await send("Page.navigateToHistoryEntry", { entryId: entries[currentIndex - 1].id });
    await wait(`window.testGamePops > ${pops}`);
    assert.equal(await evaluate("history.state?.lgGameGuard"), state, "Back restored the active game's history guard");
    assert.equal((await send("Page.getNavigationHistory")).currentIndex, currentIndex, "Back does not accumulate entries");
    assert.ok(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.isConnected`), "Back leaves the game open");
  }
  // Twice: Chromium's close watcher lets a repeated Esc without user activation
  // close a modal dialog natively even when the first cancel was prevented.
  for (let press = 0; press < 2; press++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await delay(50);
  }
  assert.ok(await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); return Boolean(element?.isConnected && (element.tagName !== "DIALOG" || element.open)); })()`), "Escape leaves the game open and visible");
}

async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await wait(`innerWidth === ${width} && innerHeight === ${height}`);
}

const gameFitsVisibleViewport = `[...document.querySelectorAll('.coloring-header-actions button, .coloring-reset, .coloring-board, .coloring-controls, .coloring-tools button')].every(element => {
  const bounds = element.getBoundingClientRect();
  const { offsetLeft, offsetTop, width, height } = visualViewport;
  return bounds.width > 0 && bounds.height > 0 &&
    bounds.left >= offsetLeft - 1 && bounds.top >= offsetTop - 1 &&
    bounds.right <= offsetLeft + width + 1 && bounds.bottom <= offsetTop + height + 1;
})`;

const canvasFillsBoard = `(() => {
  const canvas = document.querySelector('.coloring-board canvas');
  const board = canvas.parentElement;
  return canvas.clientWidth === board.clientWidth && canvas.clientHeight === board.clientHeight &&
    canvas.clientHeight >= document.querySelector('.coloring-dialog').clientHeight - 20 &&
    canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight;
})()`;

const documentFitsWidth = "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1";

function drawingPixel(x, y) {
  return `const scale = Math.min(canvas.width / 720, canvas.height / 480);
    const pixelX = (canvas.width - 720 * scale) / 2 + ${x} * scale;
    const pixelY = (canvas.height - 480 * scale) / 2 + ${y} * scale;`;
}

async function touch(type, x, y) {
  let touchPoints = [];
  if (type === "touchStart" || type === "touchMove") {
    const point = await evaluate(`(() => {
      const canvas = document.querySelector('.coloring-board canvas');
      const rect = canvas.getBoundingClientRect();
      ${drawingPixel(x, y)}
      if (canvas.closest('dialog').dataset.rotated === 'true') {
        return { x: rect.right - rect.width * pixelY / canvas.height,
          y: rect.top + rect.height * pixelX / canvas.width };
      }
      return { x: rect.left + rect.width * pixelX / canvas.width,
        y: rect.top + rect.height * pixelY / canvas.height };
    })()`);
    touchPoints = [{ ...point, id: 1 }];
  }
  await send("Input.dispatchTouchEvent", { type, touchPoints });
}

const rgb = (x, y) => evaluate(`(() => {
  const canvas = document.querySelector('.coloring-board canvas');
  ${drawingPixel(x, y)}
  return Array.from(canvas.getContext('2d').getImageData(Math.round(pixelX), Math.round(pixelY), 1, 1).data);
})()`);
async function assertPixel(x, y, expected, message) {
  const actual = await rgb(x, y);
  assert.ok(actual.every((channel, index) => Math.abs(channel - expected[index]) <= 2),
    `${message} (actual ${actual}, expected ${expected})`);
}

function thumbnailHasColor(title, x, y, color, radius = 0) {
  return `(() => {
    const card = [...document.querySelectorAll('.coloring-gallery .coloring-card')].find(item => item.querySelector('span')?.textContent === ${JSON.stringify(title)});
    const canvas = card?.querySelector('canvas');
    const pixels = canvas?.getContext('2d')?.getImageData(${Math.round(x / 3) - radius}, ${Math.round(y / 3) - radius}, ${2 * radius + 1}, ${2 * radius + 1}).data;
    if (!pixels) return false;
    const color = ${JSON.stringify(color)};
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (color.every((value, index) => Math.abs(value - pixels[offset + index]) <= 2)) return true;
    }
    return false;
  })()`;
}

const white = [255, 255, 255, 255];
const red = [232, 66, 82, 255];
const green = [43, 155, 88, 255];
const yellow = [248, 210, 69, 255];

try {
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/state*` }, { urlPattern: `${origin}/api/app-version` }, { urlPattern: `${origin}${gameSoundtrackPath}*` }, { urlPattern: `${origin}${puzzlePath}*` }, { urlPattern: `${origin}${drawingsPath}*` }] });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.testMusic = { starts: 0, stops: 0 };
    window.testGamePops = 0;
    window.testFeedback = 0;
    window.addEventListener("popstate", () => window.testGamePops++);
    const nativeStart = AudioBufferSourceNode.prototype.start;
    const nativeStop = AudioBufferSourceNode.prototype.stop;
    const nativeConnect = AudioBufferSourceNode.prototype.connect;
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.endsWith("/correct.mp3") || this.src.endsWith("/wrong.mp3")) window.testFeedback++;
      return nativePlay.apply(this, args);
    };
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) {
        window.testMusic.starts++;
        window.testMusic.duration = this.buffer?.duration;
      } else { window.testFeedback++; }
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
  await viewport(320, 800);
  await wait("document.querySelector('.child-choice-page')");
  assert.equal(await evaluate(documentFitsWidth), true, "profile selection fits a narrow phone");
  await button("Apri Giochi");
  await wait("document.querySelectorAll('.game-picker button').length === 4");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.game-picker button')].map(button => button.textContent.trim())"), ["Colorare", "Palloncini", "Puzzle a incastro", "Ripassa lettere e numeri"]);
  assert.equal(await evaluate("document.querySelectorAll('.game-picker button .coloring-card-art').length"), 4);
  assert.equal(await evaluate("document.querySelector('.games-page h1').textContent"), "Giochi");
  await button("Colorare");
  await wait("document.querySelectorAll('.coloring-card').length >= 24");
  assert.equal(await evaluate("document.querySelector('.games-page h1').textContent"), "Colorare");
  assert.ok(await evaluate(`(() => {
    const button = document.querySelector('.game-picker-back');
    const icon = button.querySelector('svg').getBoundingClientRect();
    const label = button.querySelector('span').getBoundingClientRect();
    return icon.right <= label.left && Math.abs(icon.top + icon.height / 2 - label.top - label.height / 2) < 1 &&
      button.getBoundingClientRect().width < document.querySelector('.games-page').clientWidth;
  })()`), "the back arrow and text are horizontally aligned on a narrow phone");
  await wait(`[...document.querySelectorAll('.coloring-card canvas')].every(canvas =>
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0))`);
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.coloring-controls button[aria-label=Esci]').title"), "Esci");
  assert.equal(await evaluate("document.querySelector('.coloring-dialog').getAttribute('aria-label')"), "Colorare");
  await wait("document.querySelector('.coloring-dialog').dataset.rotated === 'true'");
  await wait(gameFitsVisibleViewport);
  await wait(canvasFillsBoard);
  const palette = await evaluate(`(() => {
    const bounds = document.querySelector('.coloring-colors').getBoundingClientRect();
    return { x: bounds.left + bounds.width / 5, y: bounds.top + bounds.height / 2, width: bounds.width };
  })()`);
  for (let step = 0; step <= 8; step++) {
    await send("Input.dispatchTouchEvent", {
      type: step === 0 ? "touchStart" : "touchMove",
      touchPoints: [{ x: palette.x + step * palette.width / 12, y: palette.y, id: 1 }],
    });
  }
  await touch("touchEnd");
  await wait("document.querySelector('.coloring-colors').scrollTop > 0");
  await touch("touchStart", 130, 110);
  await touch("touchMove", 160, 110);
  await touch("touchEnd");
  await assertPixel(145, 110, red, "the brush follows the touch while the game is turned");
  await touch("touchStart", -65, 130);
  await touch("touchMove", -65, 165);
  await touch("touchEnd");
  await assertPixel(-65, 145, red, "the expanded left margin is paintable");
  await wait("window.testMusic.starts === 1 && window.testMusic.gain?.value > 0");
  await assertGameIgnoresBack(".coloring-dialog[open]");
  await assertPixel(-65, 145, red, "Back preserves the current painting");
  assert.equal(await evaluate("window.testMusic.stops"), 0, "Back does not interrupt the game's music");
  await viewport(800, 390);
  await wait("document.querySelector('.coloring-dialog').dataset.rotated === 'false'");
  await wait(canvasFillsBoard);
  await assertPixel(-65, 145, red, "resizing preserves marks in the expanded margins");
  assert.equal(await evaluate("document.querySelector('.coloring-colors').scrollHeight > document.querySelector('.coloring-colors').clientHeight"), true);
  await viewport(568, 320);
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await wait(gameFitsVisibleViewport);
  await wait(canvasFillsBoard);
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await wait("visualViewport.scale >= 1.99");
  await wait(gameFitsVisibleViewport);
  await wait(canvasFillsBoard);
  assert.equal(await evaluate(`[...document.querySelectorAll('.coloring-tools button, .coloring-colors button')].every(button =>
    !button.textContent.trim() && button.hasAttribute('aria-label') && button.offsetWidth >= 44 && button.offsetHeight >= 44)`), true);
  assert.equal(await evaluate(`document.querySelector('.coloring-tools').getBoundingClientRect().right <=
    document.querySelector('.coloring-colors').getBoundingClientRect().left`), true);
  assert.equal(await evaluate(`(() => {
    const [brush, crayon, bucket] = [...document.querySelectorAll('.coloring-tools button')].map(button => button.getBoundingClientRect());
    return brush.left === crayon.left && brush.left === bucket.left && brush.bottom <= crayon.top && crayon.bottom <= bucket.top;
  })()`), true);
  await evaluate("document.querySelector('.coloring-colors').scrollTop = document.querySelector('.coloring-colors').scrollHeight");
  assert.equal(await evaluate(`document.querySelector('button[aria-label="Bianco"]').getBoundingClientRect().bottom <=
    document.querySelector('.coloring-colors').getBoundingClientRect().bottom`), true);

  await touch("touchStart", 315, 183);
  await touch("touchMove", 315, 275);
  await touch("touchMove", 300, 210);
  await touch("touchEnd");
  await wait("window.testMusic.starts === 1 && window.testMusic.gain?.value > 0");
  assert.ok(Math.abs(await evaluate("window.testMusic.duration") - 64) < 0.1, "the bundled Calypso excerpt plays");
  await button("Musica di sottofondo");
  await wait("window.testMusic.gain?.value === 0");
  await button("Musica di sottofondo");
  await wait("window.testMusic.gain?.value > 0");
  await assertPixel(315, 215, red, "brush works within the roof");
  await assertPixel(300, 210, red, "the stroke resumes inside its original area");
  await assertPixel(315, 272, white, "dragging past the roof leaves the wall untouched");
  const pinch = await evaluate(`(() => {
    const bounds = document.querySelector('.coloring-board canvas').getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.2, span: bounds.width * 0.4 };
  })()`);
  for (let step = 0; step <= 10; step++) {
    const span = pinch.span * (1 - step * 0.08);
    await send("Input.dispatchTouchEvent", {
      type: step === 0 ? "touchStart" : "touchMove",
      touchPoints: [{ x: pinch.x - span, y: pinch.y, id: 1 }, { x: pinch.x + span, y: pinch.y, id: 2 }],
    });
  }
  await touch("touchEnd");
  await wait("visualViewport.scale < 1.2");
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await wait("visualViewport.scale === 1 && document.querySelector('.coloring-dialog').style.transform.endsWith('scale(1)')");
  await wait(gameFitsVisibleViewport);

  await touch("touchStart", 115, 140);
  await touch("touchMove", 355, 135);
  await touch("touchEnd");
  await assertPixel(140, 140, red, "the paper outside the drawing can be painted");
  await assertPixel(355, 135, white, "a stroke on the background stays behind the figure");

  await button("Pastello");
  await button("Blu");
  await touch("touchStart", 295, 350);
  await touch("touchMove", 360, 350);
  await touch("touchEnd");
  assert.notDeepEqual(await rgb(300, 350), white, "new contact paints the wall with the crayon");
  await assertPixel(355, 350, white, "crayon leaves the overlapping door untouched");

  await button("Secchio");
  await button("Verde");
  await touch("touchStart", 355, 350);
  await touch("touchEnd");
  await assertPixel(340, 330, green, "bucket fills all of the door");
  await assertPixel(235, 355, white, "bucket leaves the wall outside the door untouched");
  await assertPixel(315, 215, red, "bucket preserves existing strokes in other zones");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await wait("!navigator.onLine");
  await button("Giallo");
  await touch("touchStart", 125, 140);
  await touch("touchEnd");
  await assertPixel(600, 420, yellow, "bucket fills the full background");
  await assertPixel(340, 330, green, "background fill preserves previously colored areas");
  await assertPixel(355, 135, white, "background fill leaves the unpainted figure white");
  await viewport(390, 800);
  await wait("document.querySelector('.coloring-dialog').dataset.rotated === 'true'");
  await wait(canvasFillsBoard);
  await assertPixel(-60, 160, yellow, "bucket covers the extended margins when they reappear");
  assert.ok(await evaluate("window.testMusic.gain?.value > 0"));
  await viewport(568, 320);
  await wait("document.querySelector('.coloring-dialog').dataset.rotated === 'false'");
  await assertPixel(340, 330, green, "rotation preserves the current drawing");

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-coloring-landscape.png", Buffer.from(screenshot.data, "base64"));
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog')");
  await wait("!history.state?.lgGameGuard");
  await wait("window.testMusic.stops === 1");
  await wait(thumbnailHasColor("Casa", 340, 330, green));
  await wait(thumbnailHasColor("Casa", 600, 420, yellow));
  await wait(thumbnailHasColor("Casa", 315, 215, red, 4));
  await button("Lumaca");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog') && !history.state?.lgGameGuard");
  // Wait for the modal focus restoration before applying zoom to the gallery.
  await evaluate("window.testGalleryReady = false; requestAnimationFrame(() => requestAnimationFrame(() => { window.testGalleryReady = true; }))");
  await wait("window.testGalleryReady");
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await wait("visualViewport.scale >= 1.99");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await wait(gameFitsVisibleViewport);
  await assertPixel(340, 330, green, "opening a drawing restores the latest paint while offline");
  await assertPixel(600, 420, yellow, "the offline background fill was also restored");
  const exit = await evaluate(`(() => {
    const bounds = document.querySelector('.coloring-controls button[aria-label=Esci]').getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, id: 1 };
  })()`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [exit] });
  await touch("touchEnd");
  await wait("!document.querySelector('.coloring-dialog[open]')");
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await viewport(390, 844);
  await button("Tazza");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await wait(gameFitsVisibleViewport);
  await wait(canvasFillsBoard);
  const portrait = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-coloring-portrait.png", Buffer.from(portrait.data, "base64"));
  const size = await evaluate(`(() => {
    const canvas = document.querySelector('.coloring-board canvas');
    return [canvas.clientWidth, canvas.clientHeight];
  })()`);
  console.log("PASS Tazza at 390 × 844:", size.join(" × "), "px of paintable surface");
  await button("Esci");
  await button("Torna ai giochi");
  await wait("document.querySelector('.game-picker')");
  await evaluate("history.back()");
  await wait("document.querySelector('.child-choice-page')");
  await evaluate("history.forward()");
  await wait("document.querySelector('.games-page')");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await wait("navigator.onLine");
  const deadline = Date.now() + 6000;
  while (!cloudDrawings.get("casa")?.areas.some(area => area.index === -1 && area.fill === "#f8d245") && Date.now() < deadline) await delay(100);
  assert.ok(cloudDrawings.get("casa")?.areas.some(area => area.index === -1 && area.fill === "#f8d245"), "the offline edit syncs when the network returns");
  await wait(`Object.keys(localStorage).some(key => key.startsWith("lg-coloring:") && key.endsWith(":casa") && JSON.parse(localStorage.getItem(key)).pending === false)`);
  await evaluate(`Object.keys(localStorage).filter(key => key.startsWith("lg-coloring:")).forEach(key => localStorage.removeItem(key))`);
  await send("Page.reload");
  await wait("document.querySelector('.games-page') || document.querySelector('.child-choice-page')");
  if (!await evaluate("Boolean(document.querySelector('.games-page'))")) await button("Apri Giochi");
  await viewport(568, 320);
  await button("Colorare");
  await wait(thumbnailHasColor("Casa", 340, 330, green));
  await wait(thumbnailHasColor("Casa", 600, 420, yellow));
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await wait(canvasFillsBoard);
  await assertPixel(340, 330, green, "a fresh page restores the drawing from the cloud");
  assert.ok(await evaluate("document.querySelector('.coloring-reset').offsetLeft < 10 && document.querySelector('.coloring-reset').offsetTop < 10"));
  await button("Azzera disegno");
  await assertPixel(340, 330, white, "reset removes the fill");
  await assertPixel(315, 215, white, "reset removes the freehand stroke");
  await assertPixel(600, 420, [0, 0, 0, 0], "reset removes the background fill");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.coloring-board')).backgroundColor"), "rgb(255, 255, 255)", "the blank paper remains white");
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog[open]')");
  await wait(thumbnailHasColor("Casa", 340, 330, white));
  await wait(thumbnailHasColor("Casa", 600, 420, [0, 0, 0, 0]));
  const resetDeadline = Date.now() + 6000;
  while (cloudDrawings.get("casa")?.areas.length && Date.now() < resetDeadline) await delay(100);
  assert.deepEqual(cloudDrawings.get("casa")?.areas, [], "the cloud stores the reset as a new blank drawing");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await wait(canvasFillsBoard);
  await assertPixel(340, 330, white, "a reset drawing stays blank after reopening");
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog[open]') && !history.state?.lgGameGuard");
  // Exercise the ordinary app shell with a long synthetic profile name.
  const child = { id: "child-width-demo", firstName: "AlessandroMassimiliano", lastName: "Dimostrazione", birthYear: "2015", notes: "", avatarColor: "#7568d9" };
  therapist.childIds = [child.id];
  state.children = [child];
  state.activeChildId = child.id;
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem("lg-therapists", ${JSON.stringify(JSON.stringify([therapist]))});
    localStorage.setItem("lg-children", ${JSON.stringify(JSON.stringify([child]))});
    localStorage.setItem("lg-active-child", ${JSON.stringify(JSON.stringify(child.id))});
  ` });
  await send("Page.reload");
  await wait("document.querySelector('.topbar .child-pill strong')?.textContent === 'AlessandroMassimiliano'");
  for (const width of [320, 360, 390, 430, 568, 768]) {
    await viewport(width, width === 568 ? 320 : 800);
    for (const [view, tab] of [["Oggi"], ["Libreria"], ["Esercizi"], ["Sessione"], ["Giochi"], ["Storie in CAA"], ["Progressi"], ["Impostazioni", "Profili"], ["Impostazioni", "Aspetto"]]) {
      await button("Apri menu");
      await button(view);
      await wait(`document.querySelector('.nav-item.active')?.textContent === ${JSON.stringify(view)}`);
      if (tab) {
        await button(tab);
        await wait(`document.querySelector('.settings-tabs [aria-current=page]')?.textContent === ${JSON.stringify(tab)}`);
      }
      if (!await evaluate(documentFitsWidth)) {
        const overflow = await evaluate(`[...document.querySelectorAll("main *")].filter(element => element.getBoundingClientRect().right > ${width} + 1)
          .slice(0, 12).map(element => [element.tagName, String(element.className), Math.round(element.getBoundingClientRect().right)])`);
        assert.fail(`${view} must fit a ${width}px mobile viewport: ${JSON.stringify(overflow)}`);
      }
    }
  }
  await viewport(320, 800);
  await button("Apri menu");
  await button("Libreria");
  await wait("document.querySelectorAll('.library-sections > .library-area.panel > .section-heading').length === 6");
  const testPhoto = "../public/images/categories/casa.webp";
  for (const action of ["Aggiungi parola o foto", "Aggiungi frase"]) {
    await button(action);
    await wait("document.querySelector('#upload-library-title ~ .file-picker .drop-zone')");
    await chooseFixture("#upload-library-title ~ .file-picker input[type=file]", testPhoto);
    await wait("document.querySelector('#upload-library-title ~ .file-picker .drop-zone small')?.textContent === 'Cambia immagine'");
    await evaluate("document.querySelector('#upload-library-title').closest('.modal').querySelector('input[type=checkbox]').click()");
    await chooseFixture("#upload-library-title ~ .file-picker input[type=file]", testPhoto);
    await wait("!document.querySelector('#upload-library-title').closest('.modal').querySelector('input[type=checkbox]').checked");
    await button("Annulla");
    await wait("!history.state?.lgModal");
  }
  await evaluate("document.querySelector('.library-card .card-actions button').click()");
  await wait("document.querySelector('#edit-library-title ~ .file-picker .drop-zone')?.textContent.includes('Sostituisci immagine')");
  await button("Annulla");
  await wait("!history.state?.lgModal");
  await evaluate("document.querySelector('.category-library-card button').click()");
  await wait("document.querySelector('#category-image-title ~ .file-picker .drop-zone')");
  await chooseFixture("#category-image-title ~ .file-picker input[type=file]", testPhoto);
  await wait("document.querySelector('#category-image-title ~ .file-picker .drop-zone small')?.textContent === 'Cambia immagine'");
  assert.equal(await evaluate("[...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('Salva associazione')).disabled"), true);
  await button("Annulla");

  await wait("document.querySelector('.game-soundtrack-panel .section-heading button:not(:disabled)')");
  await button("Aggiungi MP3");
  await wait("document.querySelector('.game-soundtrack-dialog .drop-zone') && history.state?.lgModal");
  await evaluate("history.back()");
  await wait("!document.querySelector('.game-soundtrack-dialog') && document.querySelector('.nav-item.active')?.textContent === 'Libreria'");
  await button("Aggiungi MP3");
  await wait("document.querySelector('.game-soundtrack-dialog input[type=file]')");
  await chooseFixture(".game-soundtrack-dialog input[type=file]", "../public/audio/coloring-game.mp3");
  await wait("document.querySelector('.game-soundtrack-dialog .drop-zone small')?.textContent === 'Cambia file'");
  for (const [index, value] of ["Registrazione di prova", "CC0"].entries()) {
    await evaluate(`document.querySelectorAll('.game-soundtrack-dialog input[type=text], .game-soundtrack-dialog input:not([type])')[${index}].focus()`);
    await send("Input.insertText", { text: value });
  }
  assert.equal(await evaluate("document.querySelector('.game-soundtrack-dialog button[type=submit]').disabled"), true, "rights are still required");
  await evaluate("document.querySelector('.game-soundtrack-dialog input[type=checkbox]').click()");
  await button("Carica MP3");
  await wait("!document.querySelector('.game-soundtrack-dialog') && !history.state?.lgModal");
  await wait("document.querySelector('.game-soundtrack-panel [role=status]')?.textContent.includes('salvata nel cloud')");
  assert.equal(await evaluate("document.querySelector('.game-soundtrack-current strong').textContent"), soundtrack.name);
  assert.equal(await evaluate(documentFitsWidth), true, "the MP3 controls fit a narrow phone");
  await button("Apri menu");
  await button("Giochi");
  await button("Colorare");
  await button("Casa");
  await wait("document.querySelector('.coloring-dialog[open]')");
  await touch("touchStart", 130, 110);
  await touch("touchEnd");
  await wait("window.testMusic.duration > 20 && window.testMusic.duration < 35");
  await button("Esci");
  await wait("!history.state?.lgGameGuard");
  const musicBeforeBalloons = await evaluate("window.testMusic.starts");
  const stopsBeforeBalloons = await evaluate("window.testMusic.stops");
  await button("Torna ai giochi");
  await button("Palloncini");
  await wait("document.querySelector('.games-page h1')?.textContent === 'Palloncini'");
  assert.equal(await evaluate(documentFitsWidth), true, "the balloon detail fits a narrow phone");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await button("Inizia");
  await wait("document.querySelector('.balloon-game-dialog[open]')?.getAttribute('aria-label') === 'Palloncini'");
  await wait(`window.testMusic.starts === ${musicBeforeBalloons} + 1`);
  assert.ok(await evaluate("window.testMusic.duration > 20 && window.testMusic.duration < 35"), "balloons use the uploaded game soundtrack");
  const balloon = await evaluate(`(() => {
    const bounds = document.querySelector('.balloon-game-dialog [data-current-wave=true] button').getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
  })()`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [balloon] });
  await touch("touchEnd");
  await wait("document.querySelector('.balloon-game-dialog .celebration-status')?.textContent === '1 palloncini scoppiati'");
  // Dragging a finger across balloons pops each one it crosses and draws a trail.
  const dragPath = await evaluate(`(() => {
    const centres = [...document.querySelectorAll('.balloon-game-dialog [data-current-wave=true] button:not(:disabled)')]
      .map(button => button.getBoundingClientRect()).map(rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
    return centres.length >= 2 ? [centres[0], centres[1]] : null;
  })()`);
  assert.ok(dragPath, "at least two balloons are available to drag across");
  const [dragFrom, dragTo] = dragPath;
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...dragFrom, id: 2 }] });
  for (let step = 1; step <= 12; step++) {
    const point = { x: dragFrom.x + (dragTo.x - dragFrom.x) * step / 12, y: dragFrom.y + (dragTo.y - dragFrom.y) * step / 12, id: 2 };
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  // The helper does not await promises: read the next drawn frame into a page variable.
  await evaluate(`delete window.testTrailInk; requestAnimationFrame(() => {
    const canvas = document.querySelector('.balloon-game-dialog .celebration-trail');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0; for (let index = 3; index < data.length; index += 4) if (data[index]) ink++;
    window.testTrailInk = ink;
  })`);
  await wait("window.testTrailInk !== undefined");
  assert.ok(await evaluate("window.testTrailInk") > 0, "the drag leaves a visible trail");
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait("Number(document.querySelector('.balloon-game-dialog .celebration-status')?.textContent.split(' ')[0]) >= 3");
  await wait("document.querySelector('.balloon-game-dialog button[aria-label=\"Scoppia il palloncino 9\"]')");
  await assertGameIgnoresBack(".balloon-game-dialog[open]");
  await button("Chiudi il gioco dei palloncini");
  await wait("!document.querySelector('.balloon-game-dialog') && !history.state?.lgGameGuard");
  await wait(`window.testMusic.stops === ${stopsBeforeBalloons} + 1`);
  assert.equal(await evaluate("document.querySelector('.games-page h1').textContent"), "Palloncini");
  await send("Emulation.setEmulatedMedia", { features: [] });
  await button("Inizia");
  await wait("document.querySelector('.balloon-game-dialog[open] .celebration-trail')");
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 40, y: 230, id: 1 }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 275, y: 230, id: 1 }] });
  await touch("touchEnd");
  await delay(530);
  const trailStillVisible = `(() => {
    const canvas = document.querySelector('.balloon-game-dialog .celebration-trail');
    return canvas.getContext('2d').getImageData(185, 230, 1, 1).data[3] > 5;
  })()`;
  assert.ok(await evaluate(trailStillVisible), "the trail is still visible after half a second");
  await delay(550);
  assert.equal(await evaluate(trailStillVisible), false, "the trail fades away after the drag");
  await button("Chiudi il gioco dei palloncini");
  await wait("!document.querySelector('.balloon-game-dialog') && !history.state?.lgGameGuard");
  await button("Torna ai giochi");
  await button("Puzzle a incastro");
  await wait("document.querySelector('.puzzle-gallery-card[aria-label=Casa] .puzzle-preview')");
  assert.equal(await evaluate(documentFitsWidth), true, "puzzle gallery fits a narrow phone");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.puzzle-gallery-card[aria-label=Casa] button')].map(button=>button.textContent)"),
    ["4 × 4", "4 × 5", "5 × 5"]);
  assert.ok(await evaluate("[...document.querySelectorAll('.puzzle-formats button')].every(button=>button.offsetWidth>=44 && button.offsetHeight>=44)"));
  assert.ok(await evaluate("document.querySelector('.puzzle-gallery-tools .drop-zone').checkVisibility()"), "the device picker is visible before opening a game");
  assert.ok(await evaluate("document.querySelector('.puzzle-gallery-tools .section-heading p').textContent.includes('fino all’uscita')"), "the device picker explains how long images are available");
  await evaluate(`(() => {
    const input = document.querySelector('.puzzle-gallery-tools input[type=file]');
    const photo = document.createElement('canvas');
    photo.width = 1280;
    photo.height = 720;
    const ctx = photo.getContext('2d');
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#f00';
    ctx.fillRect(0, 0, 100, 720);
    ctx.fillStyle = '#00f';
    ctx.fillRect(1180, 0, 100, 720);
    photo.toBlob(blob => {
      const inputData = new DataTransfer();
      inputData.items.add(new File([blob], 'panoramica-sintetica.png', {type:'image/png'}));
      input.files = inputData.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    });
  })()`);
  await wait("document.querySelector('.puzzle-gallery-card[aria-label=panoramica-sintetica] .puzzle-preview')");
  assert.equal(await evaluate("document.querySelectorAll('.puzzle-gallery-card').length"), 4);
  assert.equal(await evaluate("document.querySelectorAll('.puzzle-gallery-card[aria-label=panoramica-sintetica] button').length"), 3);
  await viewport(568, 320);
  await button("panoramica-sintetica · 4 × 5 · 20 pezzi");
  await wait("document.querySelectorAll('.puzzle-tray button').length === 20");
  await wait("document.querySelector('.puzzle-piece').offsetWidth >= 44");
  assert.equal(await evaluate("document.querySelector('.puzzle-board canvas').width / document.querySelector('.puzzle-board canvas').height"), 1.25);
  const center = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x:r.left+r.width/2,y:r.top+r.height/2,id:1 }; })()`);
  const tile = await center(".puzzle-tray button:last-child");
  const below = await center(".puzzle-tray button:nth-child(8)");
  const tileAt = ({x,y}) => evaluate("document.elementFromPoint(" + x + "," + y + ")?.closest('button')?.dataset.piece");
  const topId = await tileAt(tile);
  const belowId = await tileAt(below);
  assert.ok(topId && belowId && topId !== belowId);
  for (const [from,to] of [[tile,below],[below,tile]]) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
    await touch("touchEnd");
    assert.equal(await tileAt(below), from === tile ? topId : belowId);
  }
  await assertGameIgnoresBack(".puzzle-dialog[open]");
  assert.ok(await evaluate("document.querySelector('.puzzle-toolbar [aria-pressed=true]').textContent === 'Nascondi immagine'"), "the overlay starts enabled");
  await button("Nascondi immagine");
  await button("Mostra immagine");
  assert.ok(await evaluate(`(() => {
    const canvas = document.querySelector('.puzzle-board canvas');
    const ctx = canvas.getContext('2d');
    const left = ctx.getImageData(12, 215, 1, 1).data;
    const right = ctx.getImageData(canvas.width-13, 215, 1, 1).data;
    return left[0] > 220 && left[2] < 40 && right[2] > 220 && right[0] < 40;
  })()`), "the guide keeps both sides of a wide photo");
  const feedbackBeforePuzzle = await evaluate("window.testFeedback");
  for (let index = 0; index < 20; index++) {
    const piece = `document.querySelector('.puzzle-piece[data-piece="${index}"]')`;
    await evaluate(`${piece}.click()`);
    await wait(`${piece}.getAttribute('aria-pressed') === 'true'`);
    await evaluate("document.querySelectorAll('.puzzle-slots button')[" + index + "].click()");
    await wait(`!${piece}`);
  }
  await wait("[...document.querySelector('.puzzle-toolbar [role=status]')?.childNodes ?? []].filter(node => !node.classList?.contains('visually-hidden')).map(node => node.textContent).join('') === 'Puzzle completato!' && document.querySelector('.puzzle-completion')");
  await wait(`window.testFeedback === ${feedbackBeforePuzzle} + 1`);
  await wait("document.querySelector('.puzzle-toolbar [role=status]')?.textContent === 'Casa, 0/20 pezzi' && !document.querySelector('.puzzle-toolbar [role=status]').hasAttribute('aria-label')");
  assert.equal(await evaluate("document.querySelectorAll('.puzzle-tray button').length"), 20);
  assert.ok(await evaluate("Boolean(document.querySelector('.puzzle-toolbar [aria-pressed=true]'))"), "the next puzzle also starts with the guide");
  assert.ok(await evaluate("document.querySelector('.puzzle-dialog[open]') && history.state?.lgGameGuard"));
  await button("Esci dal puzzle");
  await wait("!history.state?.lgGameGuard");
  for (const [size, pieces] of [["4 × 4",16],["5 × 5",25]]) {
    await viewport(320, 800);
    await button("Casa · " + size + " · " + pieces + " pezzi");
    await wait("document.querySelectorAll('.puzzle-tray button').length === "+pieces);
    await wait("document.querySelector('.puzzle-dialog').dataset.rotated === 'true'");
    if (pieces === 25) {
      const from = await center(".puzzle-tray button:last-child");
      const id = Number(await tileAt(from));
      const to = await center(".puzzle-slots button:nth-child(" + (id + 1) + ")");
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
      await touch("touchEnd");
      await wait("[...document.querySelector('.puzzle-toolbar [role=status]')?.childNodes ?? []].filter(node => !node.classList?.contains('visually-hidden')).map(node => node.textContent).join('') === '1/25 pezzi'");
      await viewport(568, 320);
      await wait("document.querySelector('.puzzle-dialog').dataset.rotated === 'false'");
      await wait("[...document.querySelectorAll('.puzzle-piece')].every(piece => piece.offsetWidth >= 44)");
    }
    await button("Esci dal puzzle");
    await wait("!history.state?.lgGameGuard");
  }
  await button("Apri menu");
  await button("Libreria");
  await wait("document.querySelector('.game-soundtrack-current strong')?.textContent === 'coloring-game.mp3'");
  await button("Ripristina musica predefinita");
  await wait("document.querySelector('.game-soundtrack-current strong')?.textContent.includes('Calypso')");

  await button("Apri menu");
  await button("Sessione");
  await wait("document.querySelector('.wizard-paths button')");
  await evaluate("document.querySelector('.wizard-paths button').click()");
  await wait("document.querySelector('.session-wizard').textContent.includes('Numero quantità')");
  await evaluate("[...document.querySelectorAll('.session-wizard button')].find(button => button.textContent.startsWith('Numero quantità')).click()");
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('.session-wizard label')].find(label => label.textContent.startsWith('Numero di turni')).querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  assert.ok(await evaluate("document.querySelector('.session-wizard').textContent.includes('Modalità della sessione')"), "quick start chooses the mode on the same page");
  await button("Continua");
  await wait("document.querySelector('.ready-screen')");
  assert.equal(await evaluate("Boolean(document.querySelector('.review-step'))"), false, "quick start skips the summary step");
  await button("Inizia");
  await wait("document.querySelector('.quantity-session')");
  await button("Numero errato");
  await wait("document.querySelector('.sequence-celebration')");
  await assertGameIgnoresBack(".sequence-celebration");
  await button("Chiudi il gioco dei palloncini");
  await wait("!document.querySelector('.sequence-celebration') && !history.state?.lgGameGuard");
  assert.ok(await evaluate("Boolean(document.querySelector('.session-complete-screen'))"), "the X returns to the session summary");

  await button("Apri menu");
  await button("Libreria");
  await wait("document.querySelector('.puzzle-library .section-heading button.primary-button')?.textContent === 'Aggiungi immagini'");
  await button("Aggiungi immagini");
  await wait("document.querySelector('.puzzle-upload-dialog .drop-zone') && history.state?.lgModal");
  assert.equal(await evaluate(documentFitsWidth), true, "the puzzle upload dialog fits a narrow phone");
  await evaluate("history.back()");
  await wait("!document.querySelector('.puzzle-upload-dialog') && document.querySelector('.nav-item.active')?.textContent === 'Libreria'");
  await button("Aggiungi immagini");
  await wait("document.querySelector('.puzzle-upload-dialog input[type=file]')?.multiple");
  const libraryDocument = await send("DOM.getDocument");
  const files = await send("DOM.querySelector", { nodeId: libraryDocument.root.nodeId, selector: ".puzzle-upload-dialog input[type=file]" });
  await send("DOM.setFileInputFiles", {
    nodeId: files.nodeId,
    files: ["casa", "giochi"].map(name => new URL("../public/images/categories/" + name + ".webp", import.meta.url).pathname),
  });
  await wait("document.querySelector('.puzzle-upload-dialog .drop-zone strong')?.textContent === '2 immagini selezionate'");
  await evaluate("document.querySelector('.puzzle-upload-dialog input[type=checkbox]').click()");
  await wait("document.querySelector('.puzzle-upload-dialog button[type=submit]:not(:disabled)')");
  await button("Carica immagini");
  await wait("!document.querySelector('.puzzle-upload-dialog') && !history.state?.lgModal");
  await wait("[...document.querySelectorAll('.puzzle-library [role=status]')].some(node => node.textContent.includes('in attesa di sincronizzazione'))");
  assert.equal(puzzleUploads.size, 1, "an unavailable upload is queued while the other image is saved");
  postponePuzzleUpload = false;
  await evaluate("window.dispatchEvent(new Event('online'))");
  await wait("document.querySelectorAll('.puzzle-library .category-library-card').length === 2");
  await button("Apri menu");
  await button("Giochi");
  await button("Puzzle a incastro");
  await wait("document.querySelectorAll('.puzzle-gallery-card').length === 5");
  await button("giochi · 4 × 5 · 20 pezzi");
  await wait("document.querySelectorAll('.puzzle-tray button').length === 20");
  await button("Esci dal puzzle");
  await wait("!history.state?.lgGameGuard");
  await button("Apri menu");
  await button("Libreria");
  await wait("document.querySelector('.puzzle-library [aria-label=\"Rimuovi giochi\"]')");
  await button("Rimuovi giochi");
  await button("Rimuovi immagine");
  await wait("document.querySelectorAll('.puzzle-library .category-library-card').length === 1");
  assert.equal(puzzleUploads.size, 1);

  await viewport(568, 320);
  await button("Apri menu");
  await button("Giochi");
  await button("Colorare");
  await wait("document.querySelector('.coloring-gallery .coloring-card span')?.textContent === 'Coccinella sorridente'");
  await button("Coccinella sorridente");
  await wait("document.querySelector('.coloring-dialog[open]')?.dataset.rotated === 'false'");
  await wait(canvasFillsBoard);
  const ladybugInk = [23, 20, 27, 255];
  await assertPixel(368, 197, ladybugInk, "the supplied drawing starts with dark spots");
  await button("Secchio");
  await button("Rosso");
  await touch("touchStart", 425, 205);
  await touch("touchEnd");
  await assertPixel(425, 205, red, "the shell can be filled");
  await assertPixel(235, 305, white, "filling the shell leaves the face separate");
  await assertPixel(368, 197, ladybugInk, "filling the shell leaves the black spots in place");
  await button("Verde");
  await touch("touchStart", 368, 197);
  await touch("touchEnd");
  await assertPixel(368, 197, green, "a spot can also be recolored separately");
  await button("Azzera disegno");
  await assertPixel(425, 205, white, "reset restores the blank shell");
  await assertPixel(368, 197, ladybugInk, "reset restores the original dark markings");
  const ladybug = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-coloring-smiling-ladybug.png", Buffer.from(ladybug.data, "base64"));
  await button("Esci");
  await wait("!document.querySelector('.coloring-dialog') && !history.state?.lgGameGuard");

  await viewport(1501, 1048);
  await button("Torna ai giochi");
  await button("Ripassa lettere e numeri");
  await wait("[...document.querySelectorAll('.tracing-picker .coloring-card')].map(card => card.textContent.trim()).join() === 'Lettere,Numeri'");
  const orderCheckbox = "document.querySelector('.tracing-options input')";
  assert.equal(await evaluate(`${orderCheckbox}.checked`), false, "free order is the default");
  const tracingMusicStarts = await evaluate("window.testMusic.starts");
  const tracingMusicStops = await evaluate("window.testMusic.stops");
  await button("Lettere");
  await wait("document.querySelector('.tracing-dialog[open][data-phase=demo] .tracing-finger[transform]')");
  assert.equal(await evaluate("document.querySelector('#tracing-title').textContent"), "Ripassa l’A", "Letters start from the first letter");
  const demoStart = await evaluate("document.querySelector('.tracing-finger').getAttribute('transform')");
  await wait(`document.querySelector('.tracing-finger[visibility=visible]')?.getAttribute('transform') !== ${JSON.stringify(demoStart)}`);
  await wait("document.querySelector('.tracing-dialog[data-phase=practice]')");
  assert.equal(await evaluate("document.querySelectorAll('.tracing-sheet .tracing-arrow').length"), 3);
  assert.equal(await evaluate("document.querySelectorAll('.tracing-start circle').length"), 2, "the free A hides the crossbar start");

  async function traceTouch(type, x, y) {
    const touchPoints = type === "touchEnd" ? [] : [await evaluate(`(() => {
      const { x, y } = new DOMPoint(${x}, ${y}).matrixTransform(document.querySelector('.tracing-sheet').getScreenCTM());
      return { x, y, id: 1 };
    })()`)];
    await send("Input.dispatchTouchEvent", { type, touchPoints });
  }
  const traced = "document.querySelector('.tracing-sheet > .tracing-ink').getAttribute('d')";
  function guidePoints() {
    return evaluate(`[...document.querySelectorAll('.tracing-sheet .tracing-guide')].map(path => {
      const length = path.getTotalLength(), steps = Math.max(2, Math.ceil(length / 8));
      return Array.from({ length: steps + 1 }, (_, index) => { const { x, y } = path.getPointAtLength(length * index / steps); return [x, y]; });
    })`);
  }
  async function tracePoints(points) {
    await traceTouch("touchStart", ...points[0]);
    for (const point of points.slice(1)) await traceTouch("touchMove", ...point);
    await traceTouch("touchEnd");
  }
  await traceTouch("touchStart", 4, 60);
  await traceTouch("touchMove", 4, 160);
  await traceTouch("touchEnd");
  assert.equal(await evaluate(traced), "", "drawing far from the guide leaves no ink");
  await traceTouch("touchStart", 13, 319);
  await traceTouch("touchMove", 148, 34);
  await traceTouch("touchEnd");
  await wait(`Boolean(${traced})`);
  const firstStroke = await evaluate(traced);
  assert.match(firstStroke, /^M35 319L/);
  const tracingScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-tracing-tablet.png", Buffer.from(tracingScreenshot.data, "base64"));

  await viewport(390, 844);
  await wait("document.querySelector('.tracing-dialog').dataset.rotated === 'true'");
  assert.equal(await evaluate(traced), firstStroke, "rotation preserves the traced stroke");
  await wait(`window.testMusic.starts === ${tracingMusicStarts} + 1 && window.testMusic.gain?.value > 0`);
  assert.ok(Math.abs(await evaluate("window.testMusic.duration") - 64) < 0.1, "tracing uses the default game soundtrack after the custom track is removed");
  await assertGameIgnoresBack(".tracing-dialog[open]");
  await traceTouch("touchStart", 83, 218);
  await traceTouch("touchMove", 257, 218);
  await traceTouch("touchEnd");
  await traceTouch("touchStart", 305, 319);
  await traceTouch("touchMove", 170, 34);
  await traceTouch("touchEnd");
  await wait("document.querySelector('.tracing-dialog[data-phase=completed] .tracing-completed')");
  assert.equal(await evaluate(traced), "M35 319 L170 34 M170 34 L305 319 M83 218 H257", "a completed glyph has no visual gaps");
  assert.equal(await evaluate("document.querySelector('#tracing-title').textContent"), "Ripassa l’A", "the check is shown before advancing");
  await wait("document.querySelector('.tracing-dialog[data-phase=practice] #tracing-title')?.textContent === 'Ripassa la B'");
  assert.equal(await evaluate(traced), "", "the next letter starts without the previous ink");
  assert.equal(await evaluate("window.testMusic.starts"), tracingMusicStarts + 1, "the soundtrack does not restart at each letter");
  assert.equal(await evaluate("window.testMusic.stops"), tracingMusicStops);
  await traceTouch("touchStart", 76, 35);
  await traceTouch("touchMove", 76, 105);
  await traceTouch("touchEnd");
  assert.ok(await evaluate(traced), "the second letter can be traced");
  await button("Ricomincia");
  await wait("document.querySelector('.tracing-dialog[data-phase=demo]')");
  assert.equal(await evaluate(traced), "", "reset clears the trace and replays the demonstration");
  await button("Esci dal ripasso");
  await wait("!document.querySelector('.tracing-dialog') && !history.state?.lgGameGuard");
  await wait(`window.testMusic.stops === ${tracingMusicStops} + 1`);
  await wait("[...document.querySelectorAll('.tracing-picker .coloring-card')].length === 2", "Exit returns to the Letters / Numbers choice");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate(`${orderCheckbox}.click()`);
  const preferenceDeadline = Date.now() + 6000;
  while (state.tracingOrderRequired !== true && Date.now() < preferenceDeadline) await delay(100);
  assert.equal(state.tracingOrderRequired, true, "the tracing preference is sent to the cloud");
  await button("Lettere");
  await wait("document.querySelector('.tracing-dialog[data-phase=practice]')");
  assert.equal(await evaluate("document.querySelectorAll('.tracing-start circle').length"), 3, "with the required order every stroke shows its start");
  const rejectedStroke = "document.querySelector('.tracing-ink-error').getAttribute('d')";
  const beforeLambda = await evaluate("window.testFeedback");
  await traceTouch("touchStart", 35, 319);
  await traceTouch("touchMove", 170, 34);
  await traceTouch("touchMove", 305, 319);
  assert.equal(await evaluate(rejectedStroke), "", "going on into the next stroke is not an error");
  await traceTouch("touchEnd");
  assert.equal(await evaluate(traced), "M35 319 L170 34 M170 34 L305 319", "A drawn as «Λ» traces both legs without lifting");
  assert.equal(await evaluate("window.testFeedback"), beforeLambda);
  const beforeWrong = await evaluate("window.testFeedback");
  await traceTouch("touchStart", 257, 218);
  await traceTouch("touchMove", 83, 218);
  await wait(`Boolean(${rejectedStroke})`);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tracing-ink-error')).stroke"), "rgb(199, 37, 56)");
  await traceTouch("touchEnd");
  await wait(`!${rejectedStroke} && window.testFeedback === ${beforeWrong} + 1`);
  assert.equal(await evaluate(traced), "M35 319 L170 34 M170 34 L305 319", "an error preserves the accepted strokes");
  const beforeCancel = await evaluate("window.testFeedback");
  await traceTouch("touchStart", 83, 218);
  await traceTouch("touchMove", 257, 218);
  await send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await wait("document.querySelector('.tracing-dialog[data-phase=completed] .tracing-completed')", "a cancelled gesture keeps its progress and completes the glyph");
  assert.equal(await evaluate("window.testFeedback"), beforeCancel + 1, "only the success tone plays");
  await wait("document.querySelector('.tracing-dialog[data-phase=practice] #tracing-title')?.textContent === 'Ripassa la B'");
  const [stem, topCurve, bottomCurve] = await guidePoints();
  await tracePoints(stem);
  const beforeJoin = await evaluate("window.testFeedback");
  await traceTouch("touchStart", ...topCurve[0]);
  for (const next of topCurve.slice(1)) await traceTouch("touchMove", ...next);
  // Both bowls in one gesture: back along the middle bar, then the lower bowl.
  await traceTouch("touchMove", 140, 168);
  assert.equal(await evaluate(rejectedStroke), "");
  for (const next of bottomCurve) await traceTouch("touchMove", ...next);
  assert.equal(await evaluate(rejectedStroke), "");
  assert.equal(await evaluate("window.testFeedback"), beforeJoin);
  await traceTouch("touchEnd");
  await wait("document.querySelector('.tracing-dialog[data-phase=completed] .tracing-completed')");
  await button("Esci dal ripasso");
  await wait("!document.querySelector('.tracing-dialog') && !history.state?.lgGameGuard");
  // Trace every guide of the current glyph along its real geometry, in drawing order.
  async function traceGuides() {
    for (const points of await guidePoints()) await tracePoints(points);
  }
  await button("Numeri");
  await wait("document.querySelector('.tracing-dialog[data-phase=practice]')");
  assert.equal(await evaluate("document.querySelector('#tracing-title').textContent"), "Ripassa l’1", "Numbers start from 1");
  const tracedNumber = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync("/tmp/lg-tracing-phone.png", Buffer.from(tracedNumber.data, "base64"));
  for (const [index, digit] of [..."1234567890"].entries()) {
    await wait(`document.querySelector('.tracing-dialog[data-phase=practice] #tracing-title')?.textContent.endsWith(${JSON.stringify(digit)})`);
    await traceGuides();
    await wait("document.querySelector('.tracing-dialog[data-phase=completed] .tracing-completed')");
    if (index === 0) await wait(`document.querySelector('.tracing-dialog[data-phase=practice] #tracing-title')?.textContent === 'Ripassa il 2'`);
  }
  // After the last number (0) the game returns to the Letters / Numbers choice.
  await wait("!document.querySelector('.tracing-dialog') && !history.state?.lgGameGuard");
  await wait("[...document.querySelectorAll('.tracing-picker .coloring-card')].map(card => card.textContent.trim()).join() === 'Lettere,Numeri'");
  await send("Emulation.setEmulatedMedia", { features: [] });
  console.log("PASS Ripassa lettere e numeri: ordine libero, ordine obbligatorio con errore rosso e audio, tratti continui, preferenza cloud, avanzamento e musica.");

  availableVersion = "r999999-abcdef0";
  await viewport(320, 800);
  await send("Page.reload");
  await wait("document.querySelector('.topbar .app-version.has-update button')?.textContent === 'Aggiorna'");
  assert.equal(await evaluate(documentFitsWidth), true, "the update action fits alongside the profile on a narrow phone");
  console.log("PASS Giochi: icon catalog, full landscape layout in portrait viewport, zoom, touch, palette, MP3 upload and playback.");
  console.log("PASS Palloncini: dedicated detail page, playable touch targets, new waves, uploaded soundtrack and close button.");
  console.log("PASS Puzzle gallery: previews and direct launch of 16, 20 and 25 pieces, device image, stacking, completion, rotation and protected exit.");
  console.log("PASS Puzzle library: multiple files, automatic retry, gallery visibility, playback and confirmed removal.");
  console.log("PASS game navigation: Back and Escape leave Colorare and the balloons open, and the X restores navigation.");
  // The three interface styles are chosen in Aspetto and applied to the whole app.
  await viewport(1280, 800);
  await button("Impostazioni");
  await button("Aspetto");
  for (const [name, style] of [["Studio", "studio"], ["Giocoso", "playful"], ["Classico", "classic"]]) {
    await evaluate(`[...document.querySelectorAll('.interface-style-grid button')].find(button => button.querySelector('strong').textContent === ${JSON.stringify(name)}).click()`);
    await wait(`document.documentElement.dataset.style === ${JSON.stringify(style)} && document.querySelector('.interface-style-grid [aria-pressed=true] strong').textContent === ${JSON.stringify(name)}`);
    assert.equal(await evaluate(documentFitsWidth), true, `${name} fits the tablet width`);
  }
  console.log("PASS App shell: nine views fit six mobile and tablet widths; Classico, Studio and Giocoso styles apply.");
} finally {
  socket.close();
}
