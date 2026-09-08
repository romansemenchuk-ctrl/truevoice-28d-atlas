const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../server/academy.cjs');
const config={url:'https://test.supabase.co',key:'public-test',origins:['https://atlas.example'],emailEnabled:false,local:false};
function client(kind='student'){return {auth:{getUser:async()=>kind==='guest'?{data:{user:null},error:{status:401}}:{data:{user:{id:'u1',email:'a@example.test',email_confirmed_at:new Date().toISOString()}}},signOut:async()=>({error:null}),signInWithOtp:async()=>{throw Error('MUST NOT SEND EMAIL')},verifyOtp:async()=>({data:{user:{id:'u1'}},error:null})},rpc:async()=>kind==='blocked'?{data:null,error:{code:'42501'}}:{data:{user:{id:'u1',role:kind,name:'',email:'a@example.test'},lessons:[],purchases:[]},error:null}};}
function res(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},getHeader(k){return this.headers[k.toLowerCase()];},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;},end(b){this.body=b;return this;}};}
async function run(action,{kind='student',method='GET',headers={},body,override={}}={}){const r=res();await createHandler({config:{...config,...override},clientFactory:()=>client(kind),courseLoader:async()=>({weeks:[],lessons:[{w:1,n:1,title:'Title',theory:[],practice:[],pain:'ADMIN SECRET'}]})})({url:'/api/academy?action='+action,method,headers:{host:'atlas.example',...headers},body},r);return r;}
const good={origin:'https://atlas.example','content-type':'application/json',cookie:'__Host-tv-csrf='+('a'.repeat(64)),'x-csrf-token':'a'.repeat(64)};
test('anonymous cannot fetch course',async()=>assert.equal((await run('content',{kind:'guest'})).statusCode,401));
test('student cannot fetch internal methodology',async()=>assert.equal((await run('admin-content')).statusCode,403));
test('explicit server role permits internal methodology',async()=>{const r=await run('admin-content',{kind:'admin'});assert.equal(r.statusCode,200);assert.equal(r.body.lessons[0].pain,'ADMIN SECRET');});
test('student content excludes internal fields',async()=>{const r=await run('content');assert.equal(r.statusCode,200);assert.equal(r.body.lessons[0].pain,undefined);});
test('missing purchase denies course despite verified identity',async()=>assert.equal((await run('content',{kind:'blocked'})).statusCode,403));
test('mutations reject foreign Origin',async()=>assert.equal((await run('profile',{method:'POST',headers:{...good,origin:'https://evil.example'},body:{}})).statusCode,403));
test('mutations reject missing CSRF',async()=>assert.equal((await run('profile',{method:'POST',headers:{origin:'https://atlas.example','content-type':'application/json'},body:{}})).statusCode,403));
test('SMTP safety gate sends no message',async()=>assert.equal((await run('request-code',{method:'POST',headers:good,body:{email:'a@example.test'}})).statusCode,503));
test('private responses are not shared-cacheable',async()=>assert.match((await run('content')).headers['cache-control'],/no-store/));
test('unknown actions and methods fail closed',async()=>{assert.equal((await run('unknown')).statusCode,404);assert.equal((await run('content',{method:'POST',headers:good,body:{}})).statusCode,405);});
test('session JSON contains no Supabase tokens',async()=>{const r=await run('session');assert.equal(r.statusCode,200);assert.doesNotMatch(JSON.stringify(r.body),/access_token|refresh_token/);});
test('health cookie is HttpOnly, Secure and host-only',async()=>{const r=await run('health');const cookie=r.headers['set-cookie'].join(';');assert.match(cookie,/__Host-tv-csrf=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.doesNotMatch(cookie,/Domain=/);});
test('missing configuration fails closed',async()=>assert.equal((await run('content',{override:{key:''}})).statusCode,503));
