// Local browser UX/offline regression. External providers are explicitly mocked;
// this does not claim a live ARASAAC availability check.
import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const runSeed=String(Date.now());
const origin="http://127.0.0.1:5180",scope=Number(runSeed).toString(16).padStart(32,"0"),adult="adult-caa-demo";
const tabs=await(await fetch("http://127.0.0.1:9222/json/list")).json();
const socket=new WebSocket(tabs.find(tab=>tab.type==="page").webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener("open",resolve,{once:true}));
const pending=new Map(),documents=new Map(),shares=new Map(),errors=[]; let sequence=0,revision=1,arasaacCalls=0,mediaUploads=0,stateCalls=0;
const state={schemaVersion:1,therapists:[{id:adult,firstName:"Demo",lastName:"CAA",email:"caa@example.test",role:"Amministratore",childIds:["child-caa-demo"]}],children:[{id:"child-caa-demo",firstName:"Demo",lastName:"",birthYear:"",notes:"",avatarColor:"#7568d9"}],activeChildId:"child-caa-demo",library:[{id:"letto",word:"LETTO",category:"Casa",image:"/api/media/letto",remoteImageId:"letto",source:"Demo",author:"Synthetic",license:"CC0",article:"IL"}],exercises:[],sequences:[],attempts:[],helps:[],sessionHistory:[]};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const fulfill=(requestId,body,status=200,type="application/json")=>send("Fetch.fulfillRequest",{requestId,responseCode:status,responseHeaders:[{name:"Content-Type",value:type},{name:"Access-Control-Allow-Origin",value:"*"}],body:Buffer.from(typeof body==="string"||Buffer.isBuffer(body)?body:JSON.stringify(body)).toString("base64")});
socket.addEventListener("message",async event=>{
 const data=JSON.parse(event.data); if(data.id){const handler=pending.get(data.id);pending.delete(data.id);if(data.error?.message?.includes("Invalid InterceptionId"))handler?.resolve({});else if(data.error)handler?.reject(new Error(JSON.stringify(data.error)));else handler?.resolve(data.result);}
 if(data.method==="Runtime.exceptionThrown")errors.push(data.params.exceptionDetails.text);
 if(data.method==="Page.javascriptDialogOpening")await send("Page.handleJavaScriptDialog",{accept:true});
 if(data.method!=="Fetch.requestPaused")return;
 const{requestId,request}=data.params,url=new URL(request.url);
 if(url.pathname==="/api/state"||url.pathname==="/api/state/changes"){stateCalls++;return fulfill(requestId,{state,revision:++revision});}
 if(url.pathname==="/api/caa-shares")return fulfill(requestId,{items:[{token:"e".repeat(64),title:"Ricevuta demo"}]});
 if(url.pathname.startsWith("/api/caa-shares/")){
   if(url.pathname.includes("/media/"))return fulfill(requestId,readFileSync("public/lettura-globale-icon-v2.png"),200,"image/png");
   const share=shares.get(url.pathname.split("/").at(-1));return share&&!share.revoked?fulfill(requestId,{story:share.story,expiresAt:share.expiresAt}):fulfill(requestId,{error:"not_found"},404);
 }
 if(url.pathname.endsWith("/shares")&&url.pathname.startsWith("/api/caa-stories/")){
   if(request.method==="GET")return fulfill(requestId,{items:[...shares.values()]});
   if(request.method==="DELETE"){shares.get(url.searchParams.get("token")).revoked=true;return fulfill(requestId,{revoked:true});}
   const body=JSON.parse(request.postData),id=url.pathname.split("/").at(-2),doc=documents.get(id);assert.equal(body.consent,true);assert.equal(body.baseEtag,doc.etag);
   const share={token:body.token,recipientEmail:body.public?null:body.recipientEmail,expiresAt:Date.now()+86400000,revoked:false,story:structuredClone(doc.story)};shares.set(body.token,share);return fulfill(requestId,share,201);
 }
 if(url.pathname==="/api/caa-stories")return fulfill(requestId,{scope,items:[...documents.values()].map(value=>({id:value.story.id,title:value.story.title,updatedAt:value.story.updatedAt,archived:value.story.archived,etag:value.etag}))});
 if(url.pathname.startsWith("/api/caa-stories/")){
   const id=url.pathname.split("/").at(-1),previous=documents.get(id);
   if(request.method==="GET")return previous?fulfill(requestId,previous):fulfill(requestId,{error:"not_found"},404);
   const body=JSON.parse(request.postData);if(previous?.operationId===body.operationId&&JSON.stringify(previous.story)===JSON.stringify(body.story))return fulfill(requestId,{etag:previous.etag});if((previous?.etag??null)!==body.baseEtag)return fulfill(requestId,{error:"story_conflict"},409);
   const value={story:body.story,operationId:body.operationId,etag:(++revision).toString(16).padStart(32,"0")};documents.set(id,value);return fulfill(requestId,{etag:value.etag});
 }
 if(url.origin==="https://api.arasaac.org"){arasaacCalls++;const term=decodeURIComponent(url.pathname.split('/').at(-1));assert.ok(["gatto","e","è","i"].includes(term));return fulfill(requestId,[{_id:term==="gatto"?7114:1234,keywords:[{keyword:term}]}]);}
 if(url.origin==="https://static.arasaac.org")return fulfill(requestId,readFileSync("public/lettura-globale-icon-v2.png"),200,"image/png");
 if(url.pathname==="/api/media"&&request.method==="POST"){mediaUploads++;return fulfill(requestId,{id:request.headers["x-media-id"]});}
 if(url.pathname.startsWith("/api/media/"))return fulfill(requestId,readFileSync("public/lettura-globale-icon-v2.png"),200,"image/png");
 if(url.origin!==origin)return send("Fetch.failRequest",{requestId,errorReason:"BlockedByClient"});
 return send("Fetch.continueRequest",{requestId});
});
const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(0,2200)")}`);};
const clickText=async text=>evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(text)}))?.click()`);
const fill=async(selector,text)=>{await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();input.select();})()`);await send("Input.insertText",{text});};
const select=async(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const checkPdf=async(name,width,height)=>{
 const pdf=await send("Page.printToPDF",{preferCSSPageSize:true,printBackground:true}),file=`/tmp/lg-caa-${name}.pdf`;writeFileSync(file,Buffer.from(pdf.data,"base64"));
 const info=execFileSync("pdfinfo",[file],{encoding:"utf8"}),size=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);assert.ok(size,info);
 assert.ok(Math.abs(Number(size[1])-width*72/25.4)<1,`PDF width: ${info}`);assert.ok(Math.abs(Number(size[2])-height*72/25.4)<1,`PDF height: ${info}`);
 return execFileSync("pdftotext",[file,"-"],{encoding:"utf8"});
};
try{
 await send("Page.enable");await send("Runtime.enable");await send("Network.enable");await send("Network.setBypassServiceWorker",{bypass:true});await send("Fetch.enable",{patterns:[{urlPattern:"*"}]});
 await send("Emulation.setDeviceMetricsOverride",{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`if(sessionStorage.getItem('caa-test-seeded')!=='${runSeed}'){const state=${JSON.stringify(state)};for(const [name,value]of Object.entries(state)){const keys={therapists:'lg-therapists',children:'lg-children',library:'lg-library',exercises:'lg-exercises',sequences:'lg-sequences',attempts:'lg-attempts',helps:'lg-helps',sessionHistory:'lg-session-history',activeChildId:'lg-active-child'};if(keys[name])localStorage.setItem(keys[name],JSON.stringify(value));}localStorage.setItem('lg-therapist-session',JSON.stringify({therapistId:'${adult}',expiresAt:Date.now()+86400000}));sessionStorage.setItem('caa-test-seeded','${runSeed}');}`});
 await send("Page.navigate",{url:`${origin}/`});await wait("document.querySelector('.sidebar')");await clickText("Storie in CAA");await wait("document.querySelector('.caa-stories-page .page-title-row button:not(:disabled)')");
 await clickText("Nuova storia");await wait("document.querySelector('.caa-text-form textarea')");await clickText("Inserisci un esempio");await clickText("Dividi in frasi");await wait("document.querySelectorAll('.caa-sentence-editor').length===3");
 await fill(".caa-sentence-editor:last-of-type textarea","Il gatto dorme nel letto.");
 await evaluate("[...document.querySelectorAll('.caa-token-button')].find(button=>button.querySelector('strong')?.textContent==='letto.').click()");
 await wait("document.querySelector('.caa-modal [data-source=library] button:not(:disabled)')");await evaluate("document.querySelector('.caa-modal [data-source=library] button').click()");
 await wait("!document.querySelector('.caa-modal') && [...document.querySelectorAll('.caa-token-button')].some(button=>button.textContent.includes('letto.')&&button.querySelector('img[src*=\"/api/media/letto\"]'))");
 await wait("document.querySelector('.caa-save-state').textContent.includes('Salvata nel cloud')");assert.ok([...documents.values()][0].story.sentences.flatMap(s=>s.tokens).some(t=>t.symbol?.id==='letto'),"short legacy catalog ID stays assigned and saved");
 await fill(".caa-sentence-editor:last-of-type textarea","Il gatto dorme nell'appartamento.");await evaluate("[...document.querySelectorAll('.caa-token-button')].find(button=>button.querySelector('strong')?.textContent===\"nell'appartamento.\").click()");await wait("document.querySelector('.caa-modal input')");await fill(".caa-modal input","letto");await wait("document.querySelector('.caa-modal [data-source=library] button:not(:disabled)')");await evaluate("document.querySelector('.caa-modal [data-source=library] button').click()");await wait("!document.querySelector('.caa-modal')");
 await fill(".caa-sentence-editor textarea","Il gatto si sveglia presto ");assert.ok(await evaluate("document.querySelector('.caa-sentence-editor textarea').value.endsWith(' ')") );
 await evaluate("[...document.querySelectorAll('.caa-sentence-editor:first-of-type .caa-token-button')].find(button=>button.textContent.includes('gatto'))?.click()");
 if(!await evaluate("Boolean(document.querySelector('.caa-modal'))"))await evaluate("[...document.querySelectorAll('.caa-token-button')].find(button=>button.textContent.includes('gatto')).click()");
 await wait("document.querySelector('.caa-modal')");assert.equal(arasaacCalls,0,"no external search before consent and explicit request");
 await evaluate("document.querySelector('.caa-modal input[type=checkbox]').click()");
 for(const term of ["a","e","è","i","o"]){await fill(".caa-modal input",term);assert.equal(await evaluate("[...document.querySelectorAll('.caa-modal button')].find(b=>b.textContent==='Cerca in ARASAAC').disabled"),false,term);}
 for(const term of ["b","u",""]){await fill(".caa-modal input",term);assert.equal(await evaluate("[...document.querySelectorAll('.caa-modal button')].find(b=>b.textContent==='Cerca in ARASAAC').disabled"),true,term);}
 for(const term of ["e","è","i"]){await fill(".caa-modal input",term);await clickText("Cerca in ARASAAC");await wait(`document.querySelector('.caa-modal [data-source=arasaac] button span')?.textContent===${JSON.stringify(term)}`);}
 await fill(".caa-modal input","gatto");await clickText("Cerca in ARASAAC");await wait("document.querySelector('.caa-modal [data-source=arasaac] button span')?.textContent==='gatto'");await evaluate("document.querySelector('.caa-modal [data-source=arasaac] button').click()");await wait("!document.querySelector('.caa-modal')");assert.equal(arasaacCalls,4);
 await send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await evaluate("[...document.querySelectorAll('.caa-token-button')].find(button=>button.textContent.includes('presto')).click()");await wait("document.querySelector('.caa-modal input[type=file]')");
 await evaluate("document.querySelectorAll('.caa-modal input[type=checkbox]')[1].click()");
 const fileInput=await send("Runtime.evaluate",{expression:"document.querySelector('.caa-modal input[type=file]')",returnByValue:false});
 await send("DOM.setFileInputFiles",{files:[`${process.cwd()}/public/lettura-globale-icon-v2.png`],objectId:fileInput.result.objectId});
 await wait("!document.querySelector('.caa-modal') && document.querySelector('.caa-token-button img[src^=blob]')");assert.equal(mediaUploads,0,"offline photo stays queued locally");
 await send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await wait("document.querySelector('.caa-save-state').textContent.includes('Salvata nel cloud')");assert.equal(mediaUploads,1,"photo uploads before the document is marked saved");
 await clickText("Riusa simboli e immagini note");await wait("document.querySelectorAll('.caa-token-button img[src*=\"static.arasaac.org\"]').length===3");assert.equal(arasaacCalls,4,"repeat words reuse the chosen symbol without more external queries");
 await evaluate("document.querySelectorAll('.caa-sentence-editor')[0].querySelectorAll('.caa-token-editor>div')[2].querySelector('.caa-token-operation').click()");await wait("[...document.querySelectorAll('.caa-token-button strong')].some(node=>node.textContent==='si sveglia')");
 await clickText("Apri anteprima");await wait("document.querySelector('.caa-preview-pages .caa-word-label')");
 assert.ok(await evaluate("[...document.querySelectorAll('.caa-preview-pages .caa-word-label')].every(node=>node.textContent===node.textContent.toLocaleUpperCase('it-IT'))"),"new stories print in uppercase by default");
 assert.ok(await evaluate("[...document.querySelectorAll('.caa-preview-pages .caa-word-label')].filter(node=>node.textContent.includes('APPARTAMENTO')).every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.getBoundingClientRect().height<=parseFloat(getComputedStyle(node).lineHeight)+1&&node.scrollWidth<=node.parentElement.clientWidth+2)"),"long picture labels expand the card, never split or overlap");
 const a4Text=await checkPdf("a4-uppercase",210,297);assert.ok(a4Text.includes("NELL'APPARTAMENTO."),"actual PDF text contains the entire uppercase word on one line");
 const beforeScale=await evaluate("(()=>{const image=document.querySelector('.caa-preview-pages .caa-word-image'),word=document.querySelector('.caa-preview-pages .caa-word-label');return {image:parseFloat(getComputedStyle(image).width),font:getComputedStyle(word).fontSize};})()");
 await fill(".caa-preview .caa-image-scale input[inputmode=numeric]","90");await evaluate("document.activeElement.blur()");await wait("document.querySelector('.caa-preview-pages .caa-paper').style.getPropertyValue('--caa-symbol-size')==='23.4mm'");
 const afterScale=await evaluate("(()=>{const image=document.querySelector('.caa-preview-pages .caa-word-image'),word=document.querySelector('.caa-preview-pages .caa-word-label');return {image:parseFloat(getComputedStyle(image).width),font:getComputedStyle(word).fontSize};})()");assert.ok(Math.abs(afterScale.image/beforeScale.image-0.9)<0.01);assert.equal(afterScale.font,beforeScale.font,"the percentage must never reduce text size");
 await checkPdf("scaled-images",210,297);await fill(".caa-preview .caa-image-scale input[inputmode=numeric]","100");await evaluate("document.activeElement.blur()");
 await evaluate("(()=>{const label=document.querySelector('.caa-preview-pages .caa-word-label');window.__caaLabel={node:label,text:label.textContent};label.textContent='W'.repeat(200);window.__overflowPrinted=false;window.print=()=>{window.__overflowPrinted=true};})()");
 await clickText("Stampa / Salva PDF");await wait("document.querySelector('.caa-preview .caa-error')?.textContent.includes('troppo testo')");assert.equal(await evaluate("window.__overflowPrinted"),false,"oversized unbroken word blocks printing rather than clipping");await evaluate("window.__caaLabel.node.textContent=window.__caaLabel.text");
 await clickText("1. Testo");await wait("document.querySelector('.caa-case-select')");await select(".caa-case-select","original");await clickText("3. Anteprima");await wait("[...document.querySelectorAll('.caa-preview-pages .caa-word-label')].some(node=>node.textContent===\"nell'appartamento.\")");
 const originalText=await checkPdf("original",210,297);assert.ok(originalText.includes("nell'appartamento."));
 await clickText("1. Testo");await select(".caa-case-select","uppercase");await clickText("2. Frasi e formato");await wait("document.querySelector('.caa-paper-select')");
 for(const [paper,w,h] of [["a5-portrait",148,210],["a3-landscape",420,297],["custom",180,240]]){
   await select(".caa-paper-select",paper);
   if(paper==="custom"){await wait("document.querySelectorAll('.caa-format-fields input[inputmode=numeric]').length===2");await fill(".caa-format-fields input[inputmode=numeric]","180");await evaluate("document.querySelector('.caa-format-fields input[inputmode=numeric]').blur()");await fill(".caa-format-fields >label:nth-last-child(2) input","240");await evaluate("document.activeElement.blur()");}
   await clickText("3. Anteprima");await wait("document.querySelector('.caa-preview')");await checkPdf(paper,w,h);await clickText("2. Frasi e formato");await wait("document.querySelector('.caa-paper-select')");
 }
 await evaluate("(()=>{const input=document.querySelector('.caa-format select');input.value='book';input.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait("document.querySelector('.caa-format input[type=checkbox]')");await evaluate("document.querySelector('.caa-format input[type=checkbox]').click()");await clickText("Apri anteprima");await wait("document.querySelectorAll('.caa-preview-pages .caa-paper').length===4");
 await wait("[...document.querySelectorAll('.caa-preview-pages img')].every(image=>image.complete&&image.naturalWidth>0)");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('#caa-print-root footer b')].map(node=>Number(node.textContent))"),[1,3,2,4]);
 assert.ok(await evaluate("document.querySelector('#caa-print-root').textContent.includes('Sergio Palao') && document.querySelector('#caa-print-root').textContent.includes('CC BY-NC-SA')"),"ARASAAC credits survive export, not only the picker");
 await clickText("Fogli di stampa");await wait("document.querySelectorAll('.caa-preview-pages .caa-cut-sheet').length===2");
 await evaluate("window.print=()=>{window.__caaPrinted=true}");await clickText("Stampa / Salva PDF");await wait("window.__caaPrinted");
 const pdf=await send("Page.printToPDF",{preferCSSPageSize:true,printBackground:true});const bytes=Buffer.from(pdf.data,"base64");assert.equal(bytes.subarray(0,5).toString(),"%PDF-");writeFileSync("/tmp/lg-caa-book.pdf",bytes);
 await clickText("2. Frasi e formato");await wait("document.querySelector('.caa-book-paper-select')");await select(".caa-book-paper-select","a3");await clickText("3. Anteprima");await wait("document.querySelector('.caa-preview')");await checkPdf("book-a3",420,297);await clickText("2. Frasi e formato");await select(".caa-book-paper-select","a4");await clickText("3. Anteprima");await wait("document.querySelector('.caa-preview')");
 await evaluate("document.querySelector('.caa-editor-heading .text-button').click()");await wait("!document.querySelector('.caa-editor-heading')");await clickText("Archiviate (");await wait("document.querySelector('.caa-story-list strong')");await evaluate("document.querySelector('.caa-story-list strong').closest('button').click()");await wait("document.querySelector('.caa-editor-heading .text-button')?.textContent==='Ripristina'");await clickText("Ripristina");await wait("document.querySelector('.caa-editor-heading .text-button')?.textContent==='Archivia'");await clickText("3. Anteprima");
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("window.scrollTo(0,0)");await new Promise(resolve=>setTimeout(resolve,300));const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});writeFileSync("/tmp/lg-caa-mobile.png",Buffer.from(screenshot.data,"base64"));
 await clickText("1. Testo");await wait("document.querySelector('.caa-text-form input')");await send("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await fill(".caa-text-form input","Bozza offline dimostrativa");await wait("document.querySelector('.caa-save-state').textContent.includes('Bozza sul dispositivo')");
 await send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await wait("document.querySelector('.caa-save-state').textContent.includes('Salvata nel cloud')");assert.equal([...documents.values()][0].story.title,"Bozza offline dimostrativa");
 await fill(".caa-text-form textarea","Il gatto dorme.\nIl cane corre.");assert.ok(await evaluate("[...document.querySelectorAll('.caa-steps button')].filter(button=>button.disabled).length===2"),"edited raw text cannot silently print stale sentences");await clickText("Dividi in frasi");await wait("document.querySelectorAll('.caa-sentence-editor').length===2");await wait("document.querySelector('.caa-save-state').textContent.includes('Salvata nel cloud')");
 await send("Page.reload");await wait("document.querySelector('.sidebar')");await clickText("Storie in CAA");await wait("document.querySelector('.caa-story-list strong')");assert.equal(await evaluate("document.querySelector('.caa-story-list strong').textContent"),"Bozza offline dimostrativa");
 await evaluate("document.querySelector('.caa-story-list strong').closest('button').click()");await wait("document.querySelector('.caa-sharing')");await clickText("Condividi questa storia");await wait("document.querySelector('.caa-sharing input[type=checkbox]')");
 assert.equal(await evaluate("[...document.querySelectorAll('.caa-sharing button')].find(b=>b.textContent==='Crea link pubblico').disabled"),true);
 await evaluate("document.querySelector('.caa-sharing input[type=checkbox]').click()");await clickText("Crea link pubblico");await wait("document.querySelector('.caa-sharing input[readonly]')");
 const publicUrl=await evaluate("document.querySelector('.caa-sharing input[readonly]').value");assert.ok(publicUrl.includes('/caa?share='));
 await fill(".caa-sharing input[type=email]","recipient@example.test");await clickText("Invia al terapista");await wait("document.querySelector('.caa-sharing').textContent.includes('Storia inviata')");assert.equal(shares.size,2);
 assert.ok(await evaluate("document.querySelector('.caa-received').textContent.includes('Ricevuta demo')"),"received stories are visible in the adult area");
 const callsBeforePublic=stateCalls;await send("Page.navigate",{url:publicUrl});await wait("document.querySelector('.caa-shared-view .caa-preview')");assert.equal(stateCalls,callsBeforePublic,"public story opens without bootstrapping login or private state");
 assert.equal(await evaluate("Boolean(document.querySelector('.sidebar'))"),false);
 await wait("[...document.querySelectorAll('.caa-preview-pages img')].every(image=>image.complete&&image.naturalWidth>0)");
 assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),"public preview fits mobile width");
 const publicScreenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});writeFileSync("/tmp/lg-caa-shared-mobile.png",Buffer.from(publicScreenshot.data,"base64"));
 const publicToken=new URL(publicUrl).searchParams.get('share');shares.get(publicToken).revoked=true;await send("Page.reload");await wait("document.querySelector('.caa-shared-view [role=alert]')");assert.equal(await evaluate("Boolean(document.querySelector('.caa-preview'))"),false,"revoked story fails visibly instead of showing login or old content");
 await send("Page.navigate",{url:`${origin}/`});await wait("document.querySelector('.sidebar')");
 state.therapists[0].role="Terapista";state.therapists[0].childIds=[];state.children=[];
 await send("Page.reload");await wait("document.querySelector('.child-choice-page')");await clickText("Apri Storie in CAA senza scegliere un bambino");await wait("document.querySelector('.caa-stories-page .caa-story-list strong')");
 // Synthetic A4 booklet with A5 pages: page 1 has five rows at 100%, but fits at 95%.
 const fitSentences=[5,5,4,3].map(count=>({id:crypto.randomUUID(),text:Array(count).fill("gatto").join(" "),pageBreak:false,tokens:Array.from({length:count},()=>({id:crypto.randomUUID(),text:"gatto",symbol:{kind:"media",id:"letto",source:"Demo",author:"Synthetic",license:"CC0"}}))}));
 const fitStory={...structuredClone([...documents.values()][0].story),id:crypto.randomUUID(),title:"Prova adattamento immagini",format:"book",bookPaper:"a4",symbolSize:26,symbolScale:100,sentencesPerPage:3,cover:false,letterCase:"original",sentences:fitSentences,draftText:fitSentences.map(s=>s.text).join("\n")};documents.set(fitStory.id,{story:fitStory,etag:(++revision).toString(16).padStart(32,"0")});
 await send("Page.reload");await wait("document.querySelector('.child-choice-page')");await clickText("Apri Storie in CAA senza scegliere un bambino");await wait("[...document.querySelectorAll('.caa-story-list strong')].some(n=>n.textContent==='Prova adattamento immagini')");await evaluate("[...document.querySelectorAll('.caa-story-list strong')].find(n=>n.textContent==='Prova adattamento immagini').closest('button').click()");await wait("document.querySelectorAll('.caa-sentence-editor').length===4");await clickText("3. Anteprima");await wait("document.querySelectorAll('.caa-preview-pages .caa-paper').length===2");await clickText("Fogli di stampa");
 await evaluate("window.__fitPrinted=false;window.print=()=>{window.__fitPrinted=true}");await clickText("Stampa / Salva PDF");await wait("document.querySelector('.caa-preview .caa-error')?.textContent.includes('La pagina 1 contiene troppo testo')");assert.equal(await evaluate("window.__fitPrinted"),false);
 const fitFont=await evaluate("getComputedStyle(document.querySelector('.caa-preview-pages .caa-word-label')).fontSize");
 await fill(".caa-preview .caa-image-scale input[inputmode=numeric]","95");await evaluate("document.activeElement.blur()");await wait("document.querySelector('.caa-preview-pages .caa-paper').style.getPropertyValue('--caa-symbol-size')==='24.7mm'");assert.equal(await evaluate("getComputedStyle(document.querySelector('.caa-preview-pages .caa-word-label')).fontSize"),fitFont);
 assert.equal(await evaluate("document.querySelector('.caa-preview-pages .caa-word-label').textContent"),"gatto","percentage never changes the selected original case");
 await clickText("Stampa / Salva PDF");await wait("window.__fitPrinted");const fitText=await checkPdf("book-fit-95",297,210);assert.equal((fitText.match(/\bgatto\b/g)??[]).length,17,"every word on both pages survives the final PDF after image-only reduction");
 assert.ok(await evaluate("[...document.querySelectorAll('#caa-print-root .caa-paper')].every(p=>p.style.getPropertyValue('--caa-symbol-size')==='24.7mm')"),"preview and print use the same scale");
 await wait("document.querySelector('.caa-save-state').textContent.includes('Salvata nel cloud')");assert.equal(documents.get(fitStory.id).story.symbolScale,95);
 await send("Page.reload");await wait("document.querySelector('.child-choice-page')");await clickText("Apri Storie in CAA senza scegliere un bambino");await wait("[...document.querySelectorAll('.caa-story-list strong')].some(n=>n.textContent==='Prova adattamento immagini')");await evaluate("[...document.querySelectorAll('.caa-story-list strong')].find(n=>n.textContent==='Prova adattamento immagini').closest('button').click()");await wait("document.querySelector('.caa-format .caa-image-scale input[inputmode=numeric]')?.value==='95'");
 await clickText("3. Anteprima");await wait("document.querySelector('.caa-preview')");
 await evaluate("window.LetturaGlobaleAndroid={speak(){},stop(){},saveCsv(){}};window.print=()=>{throw new Error('native path must not invoke window.print')}");await clickText("Stampa / Salva PDF");await wait("document.querySelector('.caa-preview .caa-error')?.textContent.includes('0.1.3')");
 await evaluate("window.__nativePrintCalls=[];window.LetturaGlobaleAndroid.printCaa=(title,width,height,id)=>{window.__nativePrintCalls.push({title,width,height,id});setTimeout(()=>window.dispatchEvent(new CustomEvent('lg-native-print-result',{detail:{id,status:'opened'}})),0)}");await clickText("Stampa / Salva PDF");await wait("window.__nativePrintCalls.length===1 && document.querySelector('.caa-preview [role=status]')?.textContent.includes('Salva come PDF')");
 assert.deepEqual(await evaluate("({width:window.__nativePrintCalls[0].width,height:window.__nativePrintCalls[0].height})"),{width:297,height:210});await evaluate("delete window.LetturaGlobaleAndroid");
 assert.deepEqual(errors,[]);console.log("PASS CAA browser: PDF, image scale/cloud, sharing, legacy APK update message and native print routing/physical size (bridge simulated; Android hardware not tested).");
}finally{socket.close();}
