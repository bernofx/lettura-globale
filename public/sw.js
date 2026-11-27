const CACHE_NAME = "lettura-globale-v116";
const APP_SHELL = [
  "/", "/manifest.webmanifest", "/lettura-globale-icon-v2.png",
  "/images/quantity/candy.webp", "/images/quantity/ladybug.webp", "/images/quantity/stone.webp",
];

async function fetchWithTimeout(request, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackUrl ?? request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) ?? (fallbackUrl ? caches.match(fallbackUrl) : undefined) ?? Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "lettura-globale:update-ready", version: CACHE_NAME }))),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/signin-with-chatgpt") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, url.pathname === "/caa" ? "/caa" : "/"));
    return;
  }

  if (["script", "style", "worker"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Media elements (audio previews, Safari/iOS) ask for byte ranges: answer with a
  // real 206 from the cached file, or go to the network without caching a partial.
  if (request.headers.has("range")) {
    event.respondWith(caches.match(request.url).then((cached) => cached ? rangeResponse(cached, request.headers.get("range")) : fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      // Only complete 200 responses are reusable; a 206 cannot be stored.
      if (response.status === 200) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});

async function rangeResponse(cached, header) {
  const body = await cached.arrayBuffer();
  const size = body.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return new Response(body, { status: 200, headers: cached.headers });
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
    if (suffix === 0) start = size;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || end < start) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  const headers = new Headers(cached.headers);
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  headers.set("accept-ranges", "bytes");
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
