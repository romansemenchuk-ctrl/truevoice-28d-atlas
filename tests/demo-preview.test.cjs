'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler:createAcademy}=require('../server/academy.cjs');
const {createHandler:createPaymentsApi}=require('../server/payments-api.cjs');

function response(){return{statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}
function request(url,{method='GET',body,headers={}}={}){return{url,method,body,headers};}
const course={weeks:[{n:1,title:'Demo'}],lessons:Array.from({length:28},(_,i)=>({w:Math.floor(i/7)+1,n:i%7+1,title:`Lesson ${i+1}`,sense:'sense',theory:'theory',practice:[],hw:'hw',s:'s',sound:'sound',pain:`internal ${i+1}`}))};
function academy(env='preview'){
 let clientTouched=false;
 const handler=createAcademy({
  config:{url:'',key:'',origins:[],emailEnabled:false,captchaSiteKey:'',local:false},
  runtimeEnv:{VERCEL_ENV:env},
  clientFactory:()=>{clientTouched=true;throw new Error('demo_must_not_touch_supabase');},
  courseLoader:async()=>course,
  artLoader:async()=>Buffer.from('demo-art')
 });
 return{handler,touched:()=>clientTouched};
}

test('preview demo auto-enters a synthetic admin/student account without Supabase',async()=>{
 const a=academy('preview'),r=response();
 await a.handler(request('/api/academy?action=session&demo=1'),r);
 assert.equal(r.statusCode,200);
 assert.equal(r.body.demo,true);
 assert.equal(r.body.user.role,'admin');
 assert.equal(r.body.user.name,'Roman');
 assert.equal(r.body.access.atlas,true);
 assert.equal(r.body.lessons.length,28);
 assert.ok(r.body.purchases.length>=2);
 assert.equal(a.touched(),false);
});

test('preview demo serves protected course and artwork without Supabase',async()=>{
 const a=academy('preview'),content=response(),art=response();
 await a.handler(request('/api/academy?action=content&demo=1'),content);
 assert.equal(content.statusCode,200);
 assert.equal(content.body.lessons.length,28);
 assert.equal(Object.hasOwn(content.body.lessons[0],'pain'),false);
 await a.handler(request('/api/academy?action=art&key=tract&demo=1'),art);
 assert.equal(art.statusCode,200);
 assert.equal(art.headers['content-type'],'image/webp');
 assert.equal(Buffer.from(art.body).toString(),'demo-art');
 assert.equal(a.touched(),false);
});

test('preview demo lesson/profile/resume writes are no-op synthetic responses',async()=>{
 const a=academy('preview');
 let r=response();
 await a.handler(request('/api/academy?action=lesson&demo=1',{method:'POST',body:{lesson:'1-1',version:2,data:{completed:true,steps:[],notes:'demo',bookmarked:true}}}),r);
 assert.equal(r.statusCode,200);assert.equal(r.body.version,3);assert.equal(r.body.notes,'demo');
 r=response();await a.handler(request('/api/academy?action=profile&demo=1',{method:'POST',body:{name:'Demo Roman',lastLesson:'2-2'}}),r);assert.equal(r.statusCode,200);assert.equal(r.body.name,'Demo Roman');
 r=response();await a.handler(request('/api/academy?action=resume&demo=1',{method:'POST',body:{lesson:'2-2'}}),r);assert.equal(r.statusCode,200);
 assert.equal(a.touched(),false);
});

test('production never enables demo mode',async()=>{
 const a=academy('production'),r=response();
 await a.handler(request('/api/academy?action=session&demo=1'),r);
 assert.equal(r.statusCode,404);
 assert.equal(r.body.error,'not_found');
 assert.equal(a.touched(),false);
});

test('preview demo admin registry is synthetic and read-only without payment worker',async()=>{
 let paymentsTouched=false,adminTouched=false;
 const handler=createPaymentsApi({
  runtimeEnv:{VERCEL_ENV:'preview'},
  payments:{registry:async()=>{paymentsTouched=true;throw new Error('must_not_run');}},
  adminAuthorizer:async()=>{adminTouched=true;throw new Error('must_not_run');}
 });
 let r=response();await handler(request('/api/payments?action=registry&demo=1'),r);
 assert.equal(r.statusCode,200);assert.ok(r.body.result.orders.length>=4);assert.ok(r.body.result.orders.every(o=>o.test===true));
 r=response();await handler(request('/api/payments?action=set-revoked&demo=1',{method:'POST',body:{}}),r);
 assert.equal(r.statusCode,403);assert.equal(r.body.error,'demo_read_only');
 assert.equal(paymentsTouched,false);assert.equal(adminTouched,false);
});

test('production payment API never exposes demo registry',async()=>{
 let touched=false;
 const handler=createPaymentsApi({runtimeEnv:{VERCEL_ENV:'production'},adminAuthorizer:async()=>{touched=true;throw new Error('must_not_run');}});
 const r=response();await handler(request('/api/payments?action=registry&demo=1'),r);
 assert.equal(r.statusCode,404);assert.equal(r.body.error,'not_found');assert.equal(touched,false);
});
