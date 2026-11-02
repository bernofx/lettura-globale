import assert from "node:assert/strict";
import test from "node:test";
import { AndroidPrintError, printAndroidCaa } from "../app/domain/android-print.ts";
import type { AndroidBridge } from "../app/domain/android-bridge.ts";

function fixture() {
  const events = new EventTarget(); const calls: Array<{ title: string; width: number; height: number; id: string }> = [];
  const bridge: AndroidBridge = { speak() {},stop() {},saveCsv() {},printCaa(title,width,height,id) { calls.push({ title,width,height,id }); } };
  const result = (id: string,status: string,message?: string) => events.dispatchEvent(new CustomEvent("lg-native-print-result",{ detail: { id,status,message } }));
  return { bridge,events,calls,result };
}
test("old APK print bridge requests an update instead of silently opening browser print",async () => {
  const f=fixture(); delete f.bridge.printCaa;
  await assert.rejects(printAndroidCaa(f.bridge,f.events,"Storia demo",{width:297,height:210}),error => error instanceof AndroidPrintError && /0\.1\.3/.test(error.message));
});
test("native print keeps the chosen physical paper size and opened is not saved",async () => {
  const f=fixture();const pending=printAndroidCaa(f.bridge,f.events,"Storia demo",{width:297,height:210});
  assert.equal(f.calls[0].width,297);assert.equal(f.calls[0].height,210);assert.equal(f.calls[0].title,"Storia demo");
  f.result("another-request","error","stale");f.result(f.calls[0].id,"opened");
  assert.equal(await pending,"opened");f.result(f.calls[0].id,"error","late");
});
test("native print propagates cancellation and system errors, without claiming a saved file",async () => {
  const f=fixture();const cancelled=printAndroidCaa(f.bridge,f.events,"Demo",{width:180,height:240});f.result(f.calls[0].id,"cancelled");assert.equal(await cancelled,"cancelled");
  const failed=printAndroidCaa(f.bridge,f.events,"Demo",{width:210,height:297});f.result(f.calls[1].id,"error","Rimuovi prima il blocco app");await assert.rejects(failed,/blocco app/);
});
test("native printing rejects invalid parameters, bridge failure and missing callback",async () => {
  const f=fixture();
  for (const width of [0,79,601,NaN,Infinity]) await assert.rejects(printAndroidCaa(f.bridge,f.events,"Demo",{width,height:297}),AndroidPrintError);
  assert.equal(f.calls.length,0);
  f.bridge.printCaa=()=>{throw new Error("native");};await assert.rejects(printAndroidCaa(f.bridge,f.events,"Demo",{width:210,height:297}),/Impossibile aprire/);
  f.bridge.printCaa=()=>undefined;await assert.rejects(printAndroidCaa(f.bridge,f.events,"Demo",{width:210,height:297},5),/Nessuna conferma/);
});
