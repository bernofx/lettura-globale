import assert from "node:assert/strict";
import test from "node:test";
import { arasaacResults,caaCutSheets,caaId,caaPages,caaPageSize,caaSymbolUrl,editCaaSentence,newCaaStory,parseCaaStory,sentenceText,sentencesFromText,splitCaaText } from "../app/domain/caa-stories.ts";

test("CAA text splits sentences/newlines without requiring page-by-page entry",() => {
  assert.deepEqual(splitCaaText("Il gatto mangia. Poi dorme!\nIl cane corre? Sì."),["Il gatto mangia.","Poi dorme!","Il cane corre?","Sì."]);
  const sentences = sentencesFromText("Il gatto mangia. Poi dorme.");
  assert.equal(sentences.length,2); assert.equal(sentenceText(sentences[0]),"Il gatto mangia.");
});
test("editing keeps trailing spaces, stable symbol associations and grouped expressions",() => {
  let sentence = { id: "sentence-demo",text: "Il gatto si sveglia",pageBreak: false,tokens: [{id:"token-gatto",text:"gatto",symbol:{kind:"arasaac" as const,id:7114}},{id:"token-si-sveglia",text:"si sveglia",symbol:{kind:"arasaac" as const,id:1234}}] };
  const updated = editCaaSentence(sentence,"Il gatto si sveglia presto ");
  assert.equal(sentenceText(updated),"Il gatto si sveglia presto ");
  assert.equal(updated.tokens.find(t => t.text === "gatto")?.id,"token-gatto");
  assert.equal(updated.tokens.find(t => t.text === "si sveglia")?.symbol?.kind,"arasaac");
  assert.strictEqual(editCaaSentence(updated,sentenceText(updated)),updated);
  assert.equal(editCaaSentence(updated,"Il cane corre").tokens.some(t => t.symbol),false);
  sentence = { ...sentence,text: "Il gatto si sveglia" }; assert.equal(sentence.tokens.length,2);
});
test("round-trip validates drafts, images, limits and explicit noncommercial approval",() => {
  const story = { ...newCaaStory(),draftText:"Il gatto mangia.",sentences:sentencesFromText("Il gatto mangia.") };
  assert.deepEqual(parseCaaStory(JSON.parse(JSON.stringify(story))),parseCaaStory(story));
  story.sentences[0].tokens[1].symbol = {kind:"arasaac",id:7114};
  assert.throws(() => parseCaaStory(story),/invalid_arasaac/);
  story.nonCommercial = true; assert.equal(parseCaaStory(story).nonCommercial,true);
  assert.throws(() => parseCaaStory({...story,draftText:"a".repeat(4001)}));
  assert.throws(() => parseCaaStory({...story,extra:"x".repeat(180_001)}),/story_too_large/);
  assert.throws(() => parseCaaStory({...story,sentences:[story.sentences[0],story.sentences[0]]}));
  assert.equal(caaId(undefined),false); assert.equal(caaId("../../file"),false);
  const token = story.sentences[0].tokens[1];
  const media = {kind:"media",id:"image-demo-123",source:"Upload",author:"Utente",license:"Diritti confermati"};
  assert.doesNotThrow(() => parseCaaStory({...story,sentences:[{...story.sentences[0],tokens:[{...token,symbol:media}]}]}));
  assert.throws(() => parseCaaStory({...story,sentences:[{...story.sentences[0],tokens:[{...token,symbol:{...media,id:"../escape"}}]}]}));
  assert.throws(() => parseCaaStory({...story,sentences:[{...story.sentences[0],tokens:[{...token,symbol:{kind:"bundled",path:"https://evil.test/x.png",source:"x",author:"x",license:"x"}}]}]}));
});
test("cut-and-stack layout has every page exactly once, padded only at the end",() => {
  const story = { ...newCaaStory(),format:"book" as const,sentences:sentencesFromText(Array.from({length:8},(_,i)=>`Frase ${i+1}.`).join("\n")) };
  const pages = caaPages(story); const sheets = caaCutSheets(pages);
  assert.deepEqual(sheets.map(sheet=>[sheet.left.number,sheet.right?.number]),[[1,5],[2,6],[3,7],[4,8]]);
  const afterCut = [...sheets.map(s=>s.left),...sheets.flatMap(s=>s.right?[s.right]:[])];
  assert.deepEqual(afterCut.map(p=>p.number),[1,2,3,4,5,6,7,8]);
  const odd = caaCutSheets(pages.slice(0,3)); assert.equal(odd[1].right,null);
  assert.deepEqual(caaPageSize(story),{width:148.5,height:210});
  const withCover = caaPages({...story,cover:true,sentencesPerPage:2}); assert.equal(withCover.length,5); assert.equal(withCover[0].cover,true);
  story.sentences[1].pageBreak = true; assert.equal(caaPages({...story,sentencesPerPage:3}).length,4);
  assert.equal(caaPages({...story,format:"sheet"}).length,1);
});
test("provider responses and URLs only allow fixed catalog IDs, never arbitrary remote URLs",() => {
  assert.deepEqual(arasaacResults([{_id:7114,keywords:[{keyword:"gatto"}]},{_id:"123"},{_id:-1},{url:"https://evil.test"}]),[{id:7114,label:"gatto"}]);
  assert.equal(caaSymbolUrl({kind:"arasaac",id:7114}),"https://static.arasaac.org/pictograms/7114/7114_500.png");
  assert.throws(() => arasaacResults({results:[]}));
});
