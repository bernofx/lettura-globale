import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { resolve, join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";

// Uses official Android SDK tools directly; no duplicate web build or JS runtime bundle.
const root = resolve(import.meta.dirname, "..");
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
if (!sdk) throw new Error("Imposta ANDROID_SDK_ROOT con piattaforma Android 35 e build-tools 35.0.0.");
const tools = join(sdk, "build-tools/35.0.0");
const platform = join(sdk, "platforms/android-35/android.jar");
const main = join(root, "android/app/src/main");
const out = join(root, "android/build");
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(out, "run-"));
const classes = join(work, "classes");
const dex = join(work, "dex");
const res = join(work, "res/drawable");
for (const path of [classes, dex, res]) mkdirSync(path, { recursive: true });
copyFileSync(join(root, "public/lettura-globale-icon-v2.png"), join(res, "app_icon.png"));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} non riuscito (${result.status})`);
}
function files(directory, suffix) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name), suffix) : entry.name.endsWith(suffix) ? [join(directory, entry.name)] : []); }
run(join(tools, "aapt2"), ["compile", "--dir", join(work, "res"), "-o", join(work, "resources.zip")]);
run(join(tools, "aapt2"), ["link", "-I", platform, "--manifest", join(main, "AndroidManifest.xml"), "-o", join(work, "unsigned.apk"), join(work, "resources.zip")]);
run("java", ["com.sun.tools.javac.Main", "-encoding", "UTF-8", "-source", "8", "-target", "8", "-bootclasspath", join(tools, "core-lambda-stubs.jar") + delimiter + platform, "-d", classes, ...files(join(main, "java"), ".java")]);
run(join(tools, "d8"), ["--lib", platform, "--min-api", "30", "--output", dex, ...files(classes, ".class")]);
run("zip", ["-q", "-j", join(work, "unsigned.apk"), ...files(dex, ".dex")]);
run(join(tools, "zipalign"), ["-f", "-p", "4", join(work, "unsigned.apk"), join(work, "aligned.apk")]);
const signing = join(root, ".android-local"); mkdirSync(signing, { recursive: true });
const key = join(signing, "test.keystore");
if (!existsSync(key) && existsSync(join(root, "public/downloads/lettura-globale-android11-v0.1.0.apk")) && process.env.LG_ANDROID_NEW_TEST_KEY !== "1") {
  throw new Error("Manca la chiave usata per l’APK pubblicata: non rigenerarla silenziosamente. Per una nuova installazione di prova, non un aggiornamento, imposta LG_ANDROID_NEW_TEST_KEY=1.");
}
// Conventional Android test signing only. This is not the eventual production signing identity.
if (!existsSync(key)) run("keytool", ["-genkeypair", "-keystore", key, "-alias", "androiddebugkey", "-storepass", "android", "-keypass", "android", "-keyalg", "RSA", "-keysize", "2048", "-validity", "3650", "-dname", "CN=Android Debug,O=Android,C=US"]);
const apk = join(out, "lettura-globale-android11-prova.apk");
run(join(tools, "apksigner"), ["sign", "--ks", key, "--ks-key-alias", "androiddebugkey", "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", apk, join(work, "aligned.apk")]);
run(join(tools, "apksigner"), ["verify", "--verbose", apk]);
run(join(tools, "aapt2"), ["dump", "badging", apk]);
console.log(`APK di prova: ${apk}`);
