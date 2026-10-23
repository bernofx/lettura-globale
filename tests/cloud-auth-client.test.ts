import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CloudLoginError, cloudLoginErrorMessage, loginToCloud, logoutFromCloud } from "../app/domain/cloud-auth-client.ts";

test("every login asks the server and trusts only its confirmed profile ID", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const id = await loginToCloud(async (url, init) => {
    calls.push({ url, init });
    return Response.json({ therapistId: "server-adult" });
  }, " TEST@EXAMPLE.TEST ", "1357");
  assert.equal(id, "server-adult");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/login");
  assert.equal(calls[0].init?.credentials, "same-origin");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { email: "test@example.test", pin: "1357" });
});

test("a rejection, unavailable network or malformed success never opens a local session", async () => {
  await assert.rejects(loginToCloud(async () => Response.json({ error: "invalid_credentials" }, { status: 401 }), "demo@example.test", "1357"), (error: unknown) => error instanceof CloudLoginError && error.status === 401);
  await assert.rejects(loginToCloud(async () => { throw new Error("offline"); }, "demo@example.test", "1357"));
  for (const body of [{}, { therapistId: "" }, { therapistId: 1 }]) {
    await assert.rejects(loginToCloud(async () => Response.json(body), "demo@example.test", "1357"), /invalid_login_response/);
  }
});

test("PIN errors, technical failures and rate limits have distinct safe messages", async () => {
  assert.match(cloudLoginErrorMessage(new CloudLoginError(401, "invalid_credentials")), /non corretti/);
  assert.match(cloudLoginErrorMessage(new CloudLoginError(503, "pin_verification_unavailable")), /Non significa che il PIN sia errato/);
  assert.match(cloudLoginErrorMessage(new CloudLoginError(503, "pin_reset_required")), /amministratore di reimpostarlo/);
  assert.match(cloudLoginErrorMessage(new Error("secret-internal-detail")), /Accesso non effettuato/);
  assert.doesNotMatch(cloudLoginErrorMessage(new Error("secret-internal-detail")), /secret-internal-detail/);
  await assert.rejects(loginToCloud(async () => Response.json({ error: "too_many_attempts" }, { status: 429, headers: { "retry-after": "30" } }), "demo@example.test", "1357"), (error: unknown) => {
    assert.match(cloudLoginErrorMessage(error), /30 secondi/);
    return true;
  });
});

test("logout resolves only after the server confirms revocation", async () => {
  let respond!: (value: Response) => void;
  let completed = false;
  const pending = logoutFromCloud((url, init) => {
    assert.equal(url, "/api/logout");
    assert.equal(init?.method, "POST");
    return new Promise((resolve) => { respond = resolve; });
  }).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  respond(Response.json({ ok: true }));
  await pending;
  assert.equal(completed, true);
  await assert.rejects(logoutFromCloud(async () => new Response(null, { status: 503 })), /logout_unconfirmed/);
});

test("UI has no backend-status dependent or local-PIN login path", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const form = page.slice(page.indexOf("function TherapistLogin("), page.indexOf("function ChildChooser("));
  assert.match(form, /await loginToCloud/);
  assert.doesNotMatch(form, /verifyStoredPin|backendStatus|onLogin\(|therapists\.filter/);
  assert.ok(form.indexOf("await loginToCloud") < form.indexOf("createPersistentTherapistSession"));
  assert.match(form, /window\.location\.reload\(\)/);
  const logout = page.slice(page.indexOf("const logout = async"), page.indexOf("const confirmDelete"));
  assert.ok(logout.indexOf('setLogoutState("pending")') < logout.indexOf("await logoutFromCloud"));
  assert.ok(logout.indexOf("await enqueueBackendSave") < logout.indexOf("await logoutFromCloud"));
  assert.ok(logout.indexOf("await logoutFromCloud") < logout.indexOf('setLogoutState("idle")'));
  assert.match(page, /if \(logoutState !== "idle"\) return <LoadingScreen/);
});
