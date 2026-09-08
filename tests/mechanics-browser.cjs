// Deterministic phase sampling exercises the real pacer and rendered SVG, not a second test clock.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const {start}=require('./local-server.cjs');
(async()=>{
 const srv=await start(),browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'fixture',value:'A',url:'http://127.0.0.1:8081'}]);
  const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',name,e.message.slice(0,300));}};
  await page.goto('http://127.0.0.1:8081/');await page.waitForFunction(()=>window.academyReady);await page.locator('#open-atlas').click();
  await page.locator('[data-plate="breath"]').click();await page.locator('[data-mode="diagram"]').click();
  await test('breathing diagram renders one phase indicator driven by the actual pacer',async()=>{
   assert.equal(await page.locator('[data-mechanics-phase]').count(),1);
   const state=await page.evaluate(()=>{breathPacer.setPattern('box4');return [0,3999,4000,7999,8000,11999,12000].map(ms=>{breathPacer.updateDOM(ms);const r=document.querySelector('.atlas-workbench');return {phase:r.dataset.breathPhase,expansion:Number(r.style.getPropertyValue('--breath')),caption:r.querySelector('[data-mechanics-phase]').textContent};});});
   assert.deepEqual(state.map(x=>x.phase),['0','0','1','1','2','2','3']);
   assert.ok(state[1].expansion>.99&&state[2].expansion===1&&state[5].expansion<.001&&state[6].expansion===0);
   assert.match(state[0].caption,/ВДИХ/);assert.match(state[2].caption,/ПАУЗА/);assert.match(state[4].caption,/ВИДИХ/);
  });
  await test('airflow stops during holds and reverses during exhalation',async()=>{
   const states=await page.evaluate(()=>{breathPacer.setPattern('box4');return [2000,5000,10000,14000].map(ms=>{breathPacer.updateDOM(ms);const r=document.querySelector('.atlas-workbench'),a=r.querySelector('[data-breath-flow]');return {direction:a.dataset.direction,hidden:a.style.opacity,offset:a.style.strokeDashoffset};});});
   assert.deepEqual(states.map(x=>x.direction),['inhale','hold','exhale','hold']);assert.equal(states[1].hidden,'0');assert.equal(states[3].hidden,'0');assert.notEqual(states[0].offset,states[2].offset);
  });
  await test('pause freezes circle, caption and diaphragm without an autonomous animation',async()=>{
   await page.evaluate(()=>breathPacer.setPattern('coherent'));await page.locator('[data-pacer-toggle]').click();await page.waitForTimeout(650);await page.locator('[data-pacer-toggle]').click();
   const snapshot=()=>page.evaluate(()=>{const r=document.querySelector('.atlas-workbench');return {value:r.style.getPropertyValue('--breath'),shape:r.querySelector('[data-diaphragm-dome]').getAttribute('d'),caption:r.querySelector('[data-mechanics-phase]').textContent,flow:r.querySelector('[data-breath-flow]').style.strokeDashoffset};});
   const before=await snapshot();await page.waitForTimeout(450);assert.deepEqual(await snapshot(),before);
   assert.equal(await page.locator('[data-breath-flow]').evaluate(e=>getComputedStyle(e).animationName),'none');
  });
  await test('reset returns the diaphragm and counter to start',async()=>{await page.locator('[data-pacer-reset]').click();assert.equal(await page.locator('.pacer-counter').textContent(),'5');assert.equal(await page.locator('.atlas-workbench').getAttribute('data-breath-phase'),'0');assert.match(await page.locator('[data-diaphragm-dome]').getAttribute('d'),/Q300 360/);});
  await test('changing anatomical plates preserves the guide and redraws the current phase',async()=>{
   await page.evaluate(()=>{breathPacer.setPattern('box4');breathPacer.elapsed=9000;breathPacer.updateDOM();});await page.locator('[data-plate="tract"]').click();await page.locator('[data-plate="breath"]').click();assert.equal(await page.locator('.atlas-workbench').getAttribute('data-breath-phase'),'2');assert.match(await page.locator('[data-mechanics-phase]').textContent(),/ВИДИХ/);assert.equal(await page.evaluate(()=>breathPacer.elapsed),9000);
  });
  await test('reduced motion keeps instructions but freezes moving anatomy',async()=>{
   await page.emulateMedia({reducedMotion:'reduce'});const actual=await page.evaluate(()=>{breathPacer.updateDOM(2000);const a=document.querySelector('[data-diaphragm-dome]').getAttribute('d');breathPacer.updateDOM(10000);return {same:a===document.querySelector('[data-diaphragm-dome]').getAttribute('d'),caption:document.querySelector('[data-mechanics-phase]').textContent};});assert.equal(actual.same,true);assert.match(actual.caption,/ВИДИХ/);await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await test('phonation demonstration pauses when the document is hidden',async()=>{
   await page.locator('[data-plate="larynx"]').click();await page.locator('[data-mode="diagram"]').click();
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await page.locator('.fold-left').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  });
  await test('unsupported decorative animation toggle never disables phase text',async()=>{await page.locator('[data-plate="breath"]').click();await page.locator('[data-motion]').click();await page.evaluate(()=>{breathPacer.setPattern('box4');breathPacer.updateDOM(9000);});assert.match(await page.locator('[data-mechanics-phase]').textContent(),/ВИДИХ/);});
  await test('mechanics have no uncaught exceptions',async()=>assert.deepEqual(errors,[]));
  await page.locator('.atlas-workbench').screenshot({path:'/tmp/academy-mechanics.png'});
  fs.writeFileSync('/tmp/academy-mechanics-results.json',JSON.stringify(results,null,2));
  console.log(`RESULT ${results.filter(r=>r.status==='PASS').length}/${results.length}`);process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
 }finally{await browser.close();await srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
