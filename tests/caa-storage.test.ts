import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { getStory,listStories,putStory,storyPrefix } from "../app/api/caa-stories/storage.ts";
import { newCaaStory } from "../app/domain/caa-stories.ts";
const require = createRequire(import.meta.resolve("wrangler/package.json"));
const { Miniflare } = require("miniflare");

test("real R2 cloud round-trip: profile/account isolation, Unicode metadata, idempotence and conditional conflicts",async () => {
  const mf = new Miniflare({modules:true,script:"export default {fetch(){return new Response('synthetic')}}",compatibilityDate:"2026-05-15",r2Buckets:["BUCKET"]});
  try {
    const bucket = await mf.getR2Bucket("BUCKET") as R2Bucket;
    const own = await storyPrefix("account-demo","adult-demo");
    const other = await storyPrefix("account-other","adult-demo");
    const colleague = await storyPrefix("account-demo","adult-colleague");
    assert.notEqual(own,other); assert.notEqual(own,colleague);
    const story = {...newCaaStory(),title:"Il gatto è qui · 猫"}; const key = `${own}${story.id}.json`;
    const first = await putStory(bucket,key,story,null,"operation-demo-01");
    assert.equal(first.status,200); assert.ok(first.etag);
    assert.equal((await listStories(bucket,own)).items[0].title,story.title);
    assert.equal((await listStories(bucket,other)).items.length,0);
    assert.equal(await getStory(bucket,`${colleague}${story.id}.json`),null);
    assert.deepEqual((await getStory(bucket,key))?.story,story);
    assert.deepEqual(await putStory(bucket,key,story,null,"operation-demo-01"),first,"retry after lost response is idempotent");
    assert.equal((await putStory(bucket,key,{...story,title:"tampered"},null,"operation-demo-01")).status,409);
    const updated = {...story,title:"Nuovo titolo"};
    const result = await putStory(bucket,key,updated,first.etag!,"operation-demo-02"); assert.equal(result.status,200);
    assert.equal((await putStory(bucket,key,story,first.etag!,"operation-demo-03")).status,409);
    assert.equal((await getStory(bucket,key))?.story.title,"Nuovo titolo");
    const archive = await putStory(bucket,key,{...updated,archived:true},result.etag!,"operation-demo-04"); assert.equal(archive.status,200);
    assert.equal((await listStories(bucket,own)).items[0].archived,true);
    const racing = {...newCaaStory(),title:"Retry concorrente"};
    const both = await Promise.all([putStory(bucket,`${own}${racing.id}.json`,racing,null,"operation-race-01"),putStory(bucket,`${own}${racing.id}.json`,racing,null,"operation-race-01")]);
    assert.deepEqual(both.map(r=>r.status),[200,200]); assert.equal(both[0].etag,both[1].etag);
  } finally { await mf.dispose(); }
});
