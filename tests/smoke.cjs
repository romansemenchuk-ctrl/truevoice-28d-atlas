/* Run after npm run build; serve dist on port 8080. Requires Playwright + Chromium. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.ATLAS_URL||'http://127.0.0.1:8080/';
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone']});
 const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',name,e.message);}};
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.atlasApp?.version==='3.0.0');
 await test('28 lessons preserve titles, theory and practice',async()=>{
  for(let i=0;i<28;i++){const actual=await page.evaluate(i=>{window.atlasApp.navigate(i);const l=window.LESSONS_DATA[i];return {title:document.querySelector('.lesson-title').textContent,expected:l.title,practice:document.querySelectorAll('.step-card').length,expectedPractice:l.practice.length,theory:document.querySelectorAll('.theory-card').length,expectedTheory:l.theory.length};},i);assert.equal(actual.title,actual.expected);assert.equal(actual.practice,actual.expectedPractice);assert.equal(actual.theory,actual.expectedTheory);}
  await page.evaluate(()=>window.atlasApp.navigate(0));
 });
 await test('Four artwork plates load and hotspots update explanations',async()=>{
  for(const key of ['tract','breath','larynx','body']){await page.locator(`[data-plate="${key}"]`).click();await page.waitForFunction(k=>document.querySelector('.atlas-image').src.includes(k+'.webp')&&document.querySelector('.atlas-image').complete&&document.querySelector('.atlas-image').naturalWidth===1122,key);await page.locator('.atlas-zone-list [data-zone="2"]').click();assert.equal(await page.locator('.atlas-hotspot[data-zone="2"]').getAttribute('aria-pressed'),'true');assert.ok((await page.locator('.atlas-fact p').textContent()).length>40);}
 });
 await test('Zoom, pan, reset, labels and schematic controls',async()=>{
  await page.locator('[data-zoom="1"]').click();assert.equal(await page.locator('.atlas-scale').textContent(),'125%');
  await page.locator('.atlas-stage').focus();await page.keyboard.press('+');assert.equal(await page.locator('.atlas-scale').textContent(),'150%');await page.keyboard.press('0');assert.equal(await page.locator('.atlas-scale').textContent(),'100%');
  await page.locator('[data-labels]').click();assert.equal(await page.locator('[data-labels]').getAttribute('aria-pressed'),'false');await page.locator('[data-labels]').click();
  await page.locator('[data-mode="diagram"]').click();assert.equal(await page.locator('.atlas-schematic').isVisible(),true);await page.locator('[data-mode="art"]').click();
 });
 await test('Breath phases match durations, skip zero holds and pause',async()=>{
  const phases=await page.evaluate(()=>{breathPacer.setPattern('coherent');return [0,4999,5000,9999,10000].map(t=>breathPacer.position(t).phase);});assert.deepEqual(phases,[0,0,2,2,0]);
  await page.locator('[data-pacer-toggle]').click();await page.waitForTimeout(1100);await page.locator('[data-pacer-toggle]').click();const n=await page.locator('.pacer-counter').textContent();await page.waitForTimeout(350);assert.equal(await page.locator('.pacer-counter').textContent(),n);assert.equal(await page.evaluate(()=>breathPacer.isRunning),false);
 });
 await test('Notes survive immediate navigation and reload',async()=>{
  await page.locator('#lesson-notes-input').fill('QA: подих, тіло, голос <test>');await page.evaluate(()=>{atlasApp.navigate(1);atlasApp.navigate(0);});assert.equal(await page.locator('#lesson-notes-input').inputValue(),'QA: подих, тіло, голос <test>');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.atlasApp);assert.equal(await page.locator('#lesson-notes-input').inputValue(),'QA: подих, тіло, голос <test>');
 });
 await test('Timer completion is idempotent and does not undo a completed step',async()=>{
  await page.evaluate(()=>{window.realAtlasSeconds=window.atlasSeconds;window.atlasSeconds=()=>1;window.atlasStorage.setStepDone(LESSONS_DATA[0],0,true);atlasApp.navigate(0);});
  await page.locator('[data-timer-toggle="0"]').click();await page.waitForTimeout(1400);assert.equal(await page.locator('[data-step="0"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#timer-display-0').textContent(),/Готово/);
  await page.locator('[data-timer-toggle="0"]').click();await page.waitForTimeout(1400);assert.equal(await page.locator('[data-step="0"]').getAttribute('aria-pressed'),'true');await page.evaluate(()=>window.atlasSeconds=window.realAtlasSeconds);
 });
 await test('Focus practice closes without an orphan timer or delayed restart',async()=>{
  await page.locator('#btn-focus-mode').click();assert.equal(await page.locator('#focus-modal').isVisible(),true);await page.locator('#focus-close-btn').click();await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>focusMode.clock===null&&!focusMode.isRunning),true);assert.equal(await page.locator('#pane').evaluate(e=>e.inert),false);
 });
 await test('Search and modal focus keyboard lifecycle',async()=>{
  await page.locator('#search-input-header').click();await page.locator('#search-modal-input').fill('дих');assert.ok(await page.locator('.search-hit').count()>0);await page.keyboard.press('Escape');assert.equal(await page.locator('#search-modal-backdrop').evaluate(e=>e.classList.contains('open')),false);assert.equal(await page.locator('#pane').evaluate(e=>e.inert),false);
 });
 await test('Invalid imported progress rejected without mutating existing notes',async()=>{
  const actual=await page.evaluate(()=>{const before=JSON.stringify(atlasStorage.state);const rejected=!atlasStorage.importDataJSON('{"done":[],"notes":null}');return rejected&&JSON.stringify(atlasStorage.state)===before;});assert.equal(actual,true);
 });
 await test('Rapid ambient audio toggle keeps the newest oscillator group alive',async()=>{
  const actual=await page.evaluate(async()=>{audioEngine.startAmbientDrone();audioEngine.stopAmbientDrone();audioEngine.startAmbientDrone();await new Promise(r=>setTimeout(r,650));const ok=audioEngine.isAmbientPlaying&&audioEngine.ambientNodes.length===3;audioEngine.stopAmbientDrone();return ok;});assert.equal(actual,true);
 });
 await test('Microphone record, local save, playback and cleanup',async()=>{
  await page.locator('#btn-voice-rec').click();await page.locator('#modal-record-btn').click();await page.waitForFunction(()=>voiceRecorder.isRecording);await page.waitForTimeout(700);await page.locator('#modal-record-btn').click();await page.waitForFunction(()=>!voiceRecorder.stopPromise&&!voiceRecorder.isRecording);await page.waitForSelector('.recording-item audio');const record=await page.evaluate(async()=>{const samples=await voiceRecorder.getAllSamples();return {count:samples.length,size:samples[0]?.blob.size,mime:samples[0]?.blob.type,stopped:voiceRecorder.stream===null};});assert.ok(record.count>0&&record.size>0);assert.match(record.mime,/audio\//);assert.equal(record.stopped,true);await page.locator('#voice-modal-close').click();
 });
 await test('Visibility change pauses timers and breath guide',async()=>{
  const state=await page.evaluate(()=>{const c=new PracticeClock(50);c.start();breathPacer.start(document.querySelector('.atlas-workbench'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));const ok=!c.running&&!breathPacer.isRunning;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));c.destroy();return ok;});assert.equal(state,true);
 });
 await test('Deep-link routes restore the intended lesson',async()=>{
  await page.goto(new URL('#lesson-4-7',base).href,{waitUntil:'networkidle'});await page.waitForFunction(()=>atlasStorage.state.idx===27);assert.equal(await page.locator('#btn-next-lesson').isDisabled(),true);
 });
 await test('Responsive layout at 320, 390, 768 and 1440 pixels',async()=>{
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Horizontal overflow at ${width}`);}
 });
 await test('Reduced-motion disables decorative anatomy animations',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-plate="larynx"]').click();await page.locator('[data-mode="diagram"]').click();assert.equal(await page.locator('.fold-left').evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 });
 await test('No uncaught JavaScript exceptions',async()=>assert.deepEqual(errors,[]));
 await page.evaluate(()=>{atlasApp.navigate(0);});await page.setViewportSize({width:1440,height:1080});await page.locator('[data-plate="tract"]').click();await page.waitForTimeout(300);await page.screenshot({path:'/tmp/atlas-desktop.png',fullPage:false});await page.locator('.atlas-workbench').screenshot({path:'/tmp/atlas-workbench.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/atlas-mobile.png',fullPage:false});
 fs.writeFileSync('/tmp/atlas-qa.json',JSON.stringify({date:new Date().toISOString(),browser:'Chromium',base,results,errors},null,2));
 await browser.close();const failed=results.filter(t=>t.status==='FAIL');console.log(`RESULT: ${results.length-failed.length}/${results.length} PASS`);process.exitCode=failed.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
