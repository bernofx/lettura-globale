// Full compiled Worker with synthetic sessions, D1 and private R2 only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync,readdirSync } from "node:fs";
import { resolve,join } from "node:path";
import { createHash } from "node:crypto";
import { newCaaStory,sentencesFromText } from "../app/domain/caa-stories.ts";
const require = createRequire(import.meta.resolve("wrangler/package.json"));
const {Miniflare} = require("miniflare");
const root = resolve("dist/server"),modules = [];
function collect(directory="") { for (const item of readdirSync(join(root,directory),{withFileTypes:true})) { const name = directory ? `${directory}/${item.name}` : item.name; if (item.isDirectory()) collect(name); else if (/\.m?js$/.test(name)) modules.push({type:"ESModule",path:name,contents:readFileSync(join(root,name),"utf8")}); } }
collect(); modules.sort((a,b)=>a.path==="index.js"?-1:b.path==="index.js"?1:a.path.localeCompare(b.path));
const mf = new Miniflare({name:"caa-api-test",compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],modules,durableObjects:{SESSIONS:{className:"RealtimeSession",useSQLite:true}},d1Databases:{DB:"caa-synthetic-db"},r2Buckets:["BUCKET"]});
const call = (path,init) => mf.dispatchFetch(`https://app.example${path}`,init);
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(name=>name.endsWith(".sql")).sort()) for (const sql of readFileSync(join("drizzle",file),"utf8").split("--> statement-breakpoint")) if (sql.trim()) await db.prepare(sql.trim()).run();
  const people = [{account:"account-one",adult:"adult-shared",token:"synthetic-one"},{account:"account-one",adult:"adult-two",token:"synthetic-two"},{account:"account-two",adult:"adult-shared",token:"synthetic-other-account"}];
  for (const person of people) await db.prepare("INSERT INTO auth_sessions (token_hash,user_id,email,display_name,adult_profile_id,expires_at,created_at) VALUES (?,?,?,?,?,?,?)").bind(createHash("sha256").update(person.token).digest("hex"),person.account,"demo@example.test","Synthetic",person.adult,Date.now()+600_000,Date.now()).run();
  assert.equal((await call("/api/caa-stories")).status,401);
  const headers = [];
  for (const person of people) {
    const base = {cookie:`lg-cloud-session=${person.token}`,"x-caa-profile":person.adult};
    const response = await call("/api/caa-stories",{headers:base}); assert.equal(response.status,200);
    const body = await response.json(); assert.equal(body.items.length,0); assert.match(body.scope,/^[a-f0-9]{32}$/);
    headers.push({...base,"x-caa-scope":body.scope,"content-type":"application/json"});
  }
  assert.notEqual(headers[0]["x-caa-scope"],headers[2]["x-caa-scope"],"same adult ID in another account has an isolated cache namespace");
  const story = {...newCaaStory(),title:"La storia è breve",draftText:"Il gatto dorme.",sentences:sentencesFromText("Il gatto dorme.")};
  const url = `/api/caa-stories/${story.id}`;
  const put = (story,etag,op,head=headers[0]) => call(url,{method:"PUT",headers:head,body:JSON.stringify({story,baseEtag:etag,operationId:op})});
  const created = await put(story,null,"operation-create-01"); assert.equal(created.status,200); const first = await created.json();
  assert.ok(first.etag); assert.equal(created.headers.get("cache-control"),"private, no-store");
  const read = await call(url,{headers:headers[0]}); assert.equal(read.status,200); assert.deepEqual((await read.json()).story,story);
  assert.equal((await call(url,{headers:headers[1]})).status,404);
  assert.equal((await call(url,{headers:headers[2]})).status,404);
  assert.equal((await call(url,{headers:{...headers[2],"x-caa-scope":headers[0]["x-caa-scope"]}})).status,401);
  assert.equal((await put(story,null,"operation-create-01")).status,200);
  const changed = {...story,title:"Nuovo titolo"}; const update = await put(changed,first.etag,"operation-update-01"); assert.equal(update.status,200);
  assert.equal((await put(story,first.etag,"operation-update-02")).status,409);
  assert.equal((await put({...story,id:"different-id"},null,"operation-wrong-id")).status,400);
  const bad = structuredClone(story); bad.sentences[0].tokens[0].symbol={kind:"arasaac",id:7114};
  assert.equal((await put(bad,first.etag,"operation-unlicensed")).status,400);
  assert.equal((await call("/api/media",{method:"POST",headers:{...headers[2],"x-caa-scope":headers[0]["x-caa-scope"],"x-media-id":"image-demo-123","content-type":"image/png"},body:new Uint8Array([1,2])})).status,401,"a queued image cannot cross accounts after a cookie change");
  const list = await (await call("/api/caa-stories",{headers:headers[0]})).json(); assert.equal(list.items[0].title,"Nuovo titolo");
  assert.equal((await (await call("/api/caa-stories",{headers:headers[1]})).json()).items.length,0);
  console.log("PASS full Worker CAA: auth, account/profile isolation, safe media queue, cloud round-trip, ETags, idempotence, invalid documents and license approval.");
} finally { await mf.dispose(); }
