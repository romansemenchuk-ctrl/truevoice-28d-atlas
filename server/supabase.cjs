'use strict';
const {createServerClient,parseCookieHeader,serializeCookieHeader}=require('@supabase/ssr');
function appendCookie(res,value){const old=res.getHeader('Set-Cookie')||[];const list=Array.isArray(old)?old:[old],name=value.split('=')[0];res.setHeader('Set-Cookie',[...list.filter(x=>x.split('=')[0]!==name),value]);}
function cookies(req){return parseCookieHeader(req.headers.cookie||'');}
function clientFor(req,res,c){return createServerClient(c.url,c.key,{
 cookieOptions:{name:c.local?'tv-auth':'__Host-tv-auth',path:'/',httpOnly:true,secure:!c.local,sameSite:'lax'},
 global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})},
 cookies:{getAll:()=>cookies(req),setAll:values=>values.forEach(({name,value,options})=>appendCookie(res,serializeCookieHeader(name,value,{...options,path:'/',httpOnly:true,secure:!c.local,sameSite:'lax'})))}
});}
function configFromEnv(env=process.env){
 const origins=[env.ATLAS_SITE_URL,env.VERCEL_URL&&'https://'+env.VERCEL_URL,env.VERCEL_BRANCH_URL&&'https://'+env.VERCEL_BRANCH_URL].filter(Boolean).map(s=>new URL(s).origin);
 const local=env.NODE_ENV==='development'&&!env.VERCEL;
 if(local)origins.push('http://localhost:8081','http://127.0.0.1:8081');
 return {url:env.SUPABASE_URL||'https://aqskidnelqmowzfkjieg.supabase.co',key:env.SUPABASE_PUBLISHABLE_KEY||require('./project.cjs').publishableKey,origins,local,emailEnabled:env.ATLAS_EMAIL_ENABLED==='true',captchaSiteKey:env.TURNSTILE_SITE_KEY||''};
}
module.exports={clientFor,configFromEnv,appendCookie,cookies,serializeCookieHeader};
