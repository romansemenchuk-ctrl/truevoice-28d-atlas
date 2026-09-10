'use strict';
const crypto=require('node:crypto');
const {createPayments}=require('./payments.cjs');
const MAX_BODY=131072;
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
function same(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function readBody(req){let b=req.body;if(b===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>MAX_BODY)fail(413,'body_too_large');}b=raw;}if(Buffer.isBuffer(b))b=b.toString('utf8');if(typeof b==='string'){if(Buffer.byteLength(b)>MAX_BODY)fail(413,'body_too_large');try{b=JSON.parse(b);}catch{fail(400,'invalid_json');}}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'invalid_json');if(Buffer.byteLength(JSON.stringify(b))>MAX_BODY)fail(413,'body_too_large');return b;}
function authorizeBridge(req,secret){if(!secret||secret.length<32)fail(503,'bridge_not_configured');const h=String(req.headers.authorization||''),want='Bearer '+secret;if(!same(h,want))fail(403,'bridge_forbidden');}
function createHandler({payments,config}={}){
 const p=payments||createPayments();const c=config||{bridgeSecret:String(process.env.ATLAS_PAYMENT_BRIDGE_SECRET||'')};
 return async(req,res)=>{res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');const send=(n,b)=>res.status(n).json(b);try{
  const url=new URL(req.url,'https://invalid.local'),action=url.searchParams.get('action');
  if(!['register-order','provider-event'].includes(action))fail(404,'not_found');
  if(req.method!=='POST'){res.setHeader('Allow','POST');fail(405,'method_not_allowed');}
  if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'json_required');
  authorizeBridge(req,c.bridgeSecret);const body=await readBody(req);
  if(action==='register-order'){
   const allowed=new Set(['reference','email','productId','amountMinor','currency','purchasedAt']);if(Object.keys(body).some(k=>!allowed.has(k)))fail(400,'invalid_fields');
   const result=await p.registerTrustedOrder(body);return send(200,{ok:true,result});
  }
  if(['email','clientEmail','buyerEmail'].some(k=>Object.hasOwn(body,k)))fail(400,'ownership_field_forbidden');
  const result=await p.applyProviderEvent(body);return send(200,{ok:true,result});
 }catch(e){const status=Number.isInteger(e.status)?e.status:500;const safe=status<500&&e.code?e.code:status===503&&e.code?e.code:'server_error';return send(status,{error:safe});}};
}
module.exports={createHandler,readBody,authorizeBridge};
