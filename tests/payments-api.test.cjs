const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../server/payments-api.cjs');
const SECRET='x'.repeat(40);
function res(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};}
const payments={registerTrustedOrder:async b=>({orderId:'o1',reference:b.reference,status:'pending'}),applyProviderEvent:async b=>({reference:b.orderReference,status:'approved'})};
async function run(action,{authorization='Bearer '+SECRET,body={},contentType='application/json',method='POST'}={}){const r=res();await createHandler({payments,config:{bridgeSecret:SECRET}})({url:'/api/payments?action='+action,method,headers:{authorization,'content-type':contentType},body},r);return r;}

test('wrong bridge secret is forbidden',async()=>assert.equal((await run('register-order',{authorization:'Bearer nope'})).statusCode,403));
test('bridge requires JSON',async()=>assert.equal((await run('register-order',{contentType:'text/plain'})).statusCode,415));
test('body cap is enforced before action parsing',async()=>{const r=await run('register-order',{body:{reference:'r',email:'a@example.test',productId:'mini-base',amountMinor:1500,currency:'USD',purchasedAt:new Date().toISOString(),padding:'x'.repeat(132000)}});assert.equal(r.statusCode,413);});
test('trusted order registration succeeds with exact fields',async()=>{const r=await run('register-order',{body:{reference:'tv-base-1-a',email:'a@example.test',productId:'mini-base',amountMinor:1500,currency:'USD',purchasedAt:'2026-09-10T00:00:00Z'}});assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);});
test('provider event rejects buyer ownership fields',async()=>{const r=await run('provider-event',{body:{orderReference:'tv-base-1-a',email:'attacker@example.test'}});assert.equal(r.statusCode,400);assert.equal(r.body.error,'ownership_field_forbidden');});
test('provider event can contain signed provider facts but never ownership email',async()=>{const r=await run('provider-event',{body:{merchantAccount:'m',orderReference:'tv-base-1-a',amount:'15.00',currency:'USD',authCode:'A',cardPan:'44****1111',transactionStatus:'Approved',reasonCode:1100,merchantSignature:'sig'}});assert.equal(r.statusCode,200);assert.equal(r.body.result.reference,'tv-base-1-a');assert.doesNotMatch(JSON.stringify(r.body),/attacker@example|clientEmail|buyerEmail/);});
