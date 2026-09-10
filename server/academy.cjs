'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {clientFor,configFromEnv,appendCookie,cookies,serializeCookieHeader}=require('./supabase.cjs');
const METHODS={health:'GET',session:'GET',content:'GET','admin-content':'GET',art:'GET',profile:'POST',resume:'POST',lesson:'POST',logout:'POST','request-code':'POST','verify-code':'POST'};
const fail=(status,code)=>{const e=new Error(code);e.status=status;throw e;};
const same=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const pickLesson=l=>Object.fromEntries(['w','n','title','sense','theory','practice','hw','s','sound'].filter(k=>l[k]!==undefined).map(k=>[k,l[k]]));
function runtimeCapabilities(env,c){
 const serviceKey=String(env?.SUPABASE_SERVICE_ROLE_KEY||''),merchant=String(env?.WAYFORPAY_MERCHANT_ACCOUNT||''),waySecret=String(env?.WAYFORPAY_SECRET_KEY||''),bridge=String(env?.ATLAS_PAYMENT_BRIDGE_SECRET||''),cron=String(env?.CRON_SECRET||'');
 return{serviceRoleConfigured:!!c.url&&!!serviceKey,wayForPayConfigured:!!merchant&&!!waySecret,bridgeConfigured:bridge.length>=32,cronConfigured:cron.length>=32};
}
async function readBody(req){
 let b=req.body;
 if(b===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>131072)fail(413,'body_too_large');}b=raw;}
 if(Buffer.isBuffer(b))b=b.toString('utf8');
 if(typeof b==='string'){if(Buffer.byteLength(b)>131072)fail(413,'body_too_large');try{b=JSON.parse(b);}catch{fail(400,'invalid_json');}}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'invalid_json');if(Buffer.byteLength(JSON.stringify(b))>131072)fail(413,'body_too_large');return b;
}
function email(value){const s=String(value||'').trim().toLowerCase();if(s.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail(400,'invalid_email');return s;}
async function rpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error){if(error.code==='42501')fail(name==='tv_account'?401:403,name==='tv_account'?'login_required':'purchase_required');if(error.code==='22023')fail(400,'invalid_data');fail(503,'database_unavailable');}return data;}
function csrf(req,res,c){const name=c.local?'tv-csrf':'__Host-tv-csrf';let token=cookies(req).find(x=>x.name===name)?.value;
 if(!/^[a-f0-9]{64}$/.test(token||'')){token=crypto.randomBytes(32).toString('hex');appendCookie(res,serializeCookieHeader(name,token,{path:'/',httpOnly:true,secure:!c.local,sameSite:'strict',maxAge:43200}));}return token;}
function mutationGuard(req,c){
 if(!c.origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')fail(403,'origin_denied');
 if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'json_required');
 const token=cookies(req).find(x=>x.name===(c.local?'tv-csrf':'__Host-tv-csrf'))?.value;
 if(!/^[a-f0-9]{64}$/.test(token||'')||!same(token,req.headers['x-csrf-token']))fail(403,'csrf_required');
}
function createHandler({config,clientFactory=clientFor,courseLoader,artLoader,runtimeEnv=process.env}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');const send=(n,data)=>res.status(n).json(data);
  try{
   const c=config||configFromEnv(),url=new URL(req.url,'https://invalid.local'),action=url.searchParams.get('action')||'session';
   if(!Object.hasOwn(METHODS,action))fail(404,'not_found');if(req.method!==METHODS[action]){res.setHeader('Allow',METHODS[action]);fail(405,'method_not_allowed');}
   if(action==='health'){const bundleReady=await fs.access(path.join(process.cwd(),'_server','course.json')).then(()=>true,()=>false);return send(200,{version:'4.1.0-core',configured:!!c.key,bundleReady,emailEnabled:c.emailEnabled&&!!c.captchaSiteKey,captchaSiteKey:c.captchaSiteKey,capabilities:runtimeCapabilities(runtimeEnv,c),csrf:csrf(req,res,c)});}
   if(req.method!=='GET')mutationGuard(req,c);if(!c.key||!c.url)fail(503,'setup_required');
   const b=req.method!=='GET'?await readBody(req):null,client=clientFactory(req,res,c);
   if(action==='request-code'||action==='verify-code'){
    if(!c.emailEnabled||!c.captchaSiteKey)fail(503,'email_setup_required');const address=email(b.email);
    if(action==='request-code'){
     if(typeof b.captchaToken!=='string'||!b.captchaToken||b.captchaToken.length>4096)fail(400,'captcha_required');
     const {error}=await client.auth.signInWithOtp({email:address,options:{shouldCreateUser:true,captchaToken:b.captchaToken}});
     if(error?.status===429)fail(429,'rate_limited');if(error&&error.status>=500)fail(503,'email_unavailable');
     return send(202,{message:'Перевір пошту. Доступ до кабінету відкривається лише за підтвердженою покупкою.'});
    }
    if(!/^\d{6,10}$/.test(String(b.code||'')))fail(400,'invalid_code');
    const {data,error}=await client.auth.verifyOtp({email:address,token:String(b.code),type:'email'});
    if(error||!data?.user)fail(error?.status===429?429:401,error?.status===429?'rate_limited':'invalid_code');
    try{await rpc(client,'tv_account');}catch(e){await client.auth.signOut({scope:'local'});throw e;}return send(200,{ok:true});
   }
   if(action==='logout'){
    const {error}=await client.auth.signOut({scope:'local'});if(error&&error.status!==401&&error.status!==403)fail(503,'logout_failed');
    for(const item of cookies(req).filter(x=>x.name.startsWith(c.local?'tv-auth':'__Host-tv-auth')))appendCookie(res,serializeCookieHeader(item.name,'',{path:'/',maxAge:0,httpOnly:true,secure:!c.local,sameSite:'lax'}));return send(200,{ok:true});
   }
   const {data,error}=await client.auth.getUser();if(error||!data?.user?.id||!data.user.email_confirmed_at)fail(401,'login_required');
   const account=await rpc(client,(action==='session'||action==='profile')?'tv_account':'tv_authorize');
   if(action==='session')return send(200,{...account,csrf:csrf(req,res,c)});
   if(action==='content'||action==='admin-content'){
    if(action==='admin-content'&&account.user.role!=='admin')fail(403,'admin_required');
    const course=courseLoader?await courseLoader():JSON.parse(await fs.readFile(path.join(process.cwd(),'_server','course.json'),'utf8'));
    return send(200,action==='admin-content'?{lessons:course.lessons.map(l=>({w:l.w,n:l.n,pain:l.pain||''}))}:{weeks:course.weeks,lessons:course.lessons.map(pickLesson)});
   }
   if(action==='art'){
    const key=url.searchParams.get('key');if(!['tract','breath','larynx','body'].includes(key))fail(404,'not_found');
    const image=artLoader?await artLoader(key):await fs.readFile(path.join(process.cwd(),'_server','anatomy',key+'.webp'));res.setHeader('Content-Type','image/webp');res.status(200);return res.end(image);
   }
   if(action==='resume'){if(Object.keys(b).some(k=>k!=='lesson'))fail(400,'invalid_fields');return send(200,await rpc(client,'tv_set_resume',{p_lesson:b.lesson}));}
   if(action==='profile'){
    if(Object.keys(b).some(k=>!['name','lastLesson'].includes(k)))fail(400,'invalid_fields');return send(200,await rpc(client,'tv_save_profile',{p_name:b.name,p_last_lesson:b.lastLesson}));
   }
   if(action==='lesson'){
    if(Object.keys(b).some(k=>!['lesson','version','data'].includes(k))||!Number.isInteger(b.version)||b.version<0)fail(400,'invalid_fields');
    const result=await rpc(client,'tv_save_lesson',{p_lesson:b.lesson,p_version:b.version,p_data:b.data});return send(result.conflict?409:200,result);
   }
   fail(404,'not_found');
  }catch(e){if(!e.status)console.error('Academy request failed:',e.name);return send(e.status||500,{error:e.status?e.message:'server_error'});}
 };
}
module.exports={createHandler,pickLesson,readBody,mutationGuard,runtimeCapabilities};
