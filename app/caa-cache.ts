import type { CaaStored } from "./domain/caa-stories";
export type CaaMedia = { owner: string; id: string; blob: Blob; uploaded: boolean };
export type CaaIdentity = { profileId: string; session: string; scope: string };

function database() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open("lg-caa-stories",1);
    request.onupgradeneeded = () => { for (const name of ["stories","media"]) { const store = request.result.createObjectStore(name); store.createIndex("owner","owner"); } request.result.createObjectStore("identity"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("cache_blocked"));
  });
}
export async function caaIdentityCache(profileId: string,value?: CaaIdentity): Promise<CaaIdentity | undefined> {
  const db = await database();
  try { return await new Promise((resolve,reject) => { const tx = db.transaction("identity",value ? "readwrite" : "readonly"); const store = tx.objectStore("identity"); const request = value ? store.put(value,profileId) : store.get(profileId); let result: CaaIdentity | undefined; request.onsuccess = () => { result = value ?? request.result; }; tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function caaCachePut(store: "stories" | "media", key: string, value: CaaStored | CaaMedia) {
  const db = await database();
  try { await new Promise<void>((resolve,reject) => { const tx = db.transaction(store,"readwrite"); tx.objectStore(store).put(value,key); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function caaCachedStories(owner: string): Promise<CaaStored[]> {
  const db = await database();
  try { return await new Promise((resolve,reject) => { const request = db.transaction("stories").objectStore("stories").index("owner").getAll(owner); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function caaCachedMedia(owner: string,id: string): Promise<CaaMedia | undefined> {
  const db = await database();
  try { return await new Promise((resolve,reject) => { const request = db.transaction("media").objectStore("media").get(`${owner}:${id}`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
