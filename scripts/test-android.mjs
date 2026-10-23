import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "lg-android-test-"));
for (const args of [
  ["com.sun.tools.javac.Main", "-d", out, join(root, "android/app/src/main/java/it/letturaglobale/tablet/UrlPolicy.java"), join(root, "android/app/src/main/java/it/letturaglobale/tablet/PinningUiPolicy.java"), join(root, "android/tests/UrlPolicyTest.java")],
  ["-cp", out, "it.letturaglobale.tablet.UrlPolicyTest"],
]) {
  const result = spawnSync("java", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0);
}
const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
assert.match(manifest, /minSdkVersion="30"/);
assert.match(manifest, /allowBackup="false"/);
assert.match(manifest, /usesCleartextTraffic="false"/);
assert.match(manifest, /android:launchMode="singleTask"/);
assert.match(manifest, /android:autoVerify="true"/);
assert.match(manifest, /android:host="lettura-globale\.bernofx\.workers\.dev" android:path="\/"/);
const links = JSON.parse(readFileSync(join(root, "public/.well-known/assetlinks.json"), "utf8"));
assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
assert.equal(links[0].target.package_name, "it.letturaglobale.tablet");
assert.match(links[0].target.sha256_cert_fingerprints[0], /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
const activity = readFileSync(join(root, "android/app/src/main/java/it/letturaglobale/tablet/MainActivity.java"), "utf8");
assert.match(activity, /onNewIntent\(Intent intent\)/);
assert.match(activity, /Intent\.ACTION_VIEW\.equals/);
const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(permissions, ["android.permission.INTERNET"]);
console.log("PASS: Android 11 minimo, solo Internet, niente backup o HTTP.");
