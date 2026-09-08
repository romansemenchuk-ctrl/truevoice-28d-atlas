// Synthetic auth harness, bound only to localhost. Not imported by production or copied to dist.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {createHandler}=require('../server/academy.cjs');
const {fixture,seed,claims,A,B,C,SA,SB,SC}=require('./db-fixture.cjs');
async function start(){
 const db=await fixture();await seed(db);await db.query("insert into tv_core.member_roles(user_id,role) values($1,'admin')",[C]);
 let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
 const config={url:'https://test.supabase.co',key:'test-public',origins:['http://127.0.0.1:8081'],emailEnabled:false,local:true};const ids={A:[A,SA],B:[B,SB],C:[C,SC]};
 const handler=createHandler({config,clientFactory:(req,res)=>{const key=(req.headers.cookie||'').match(/(?:^|;\s*)fixture=([ABC])(?:;|$)/)?.[1],id=ids[key];
 return {auth:{getUser:async()=>id?{data:{user:{id:id[0],email:key.toLowerCase()+'@example.test',email_confirmed_at:new Date().toISOString()}}}:{data:{user:null},error:{status:401}},signOut:async()=>{res.setHeader('Set-Cookie','fixture=; Path=/; Max-Age=0');return {error:null};}},rpc:async(name,args)=>serial(async()=>{
  if(!id)return {data:null,error:{code:'42501'}};
  try{await claims(db,...id);let sql,params=[];
   if(name==='tv_account')sql='select public.tv_account() v';
   else if(name==='tv_authorize')sql='select public.tv_authorize() v';
   else if(name==='tv_set_resume'){sql='select public.tv_set_resume($1) v';params=[args.p_lesson];}
   else if(name==='tv_save_lesson'){sql='select public.tv_save_lesson($1,$2,$3) v';params=[args.p_lesson,args.p_version,args.p_data];}
   else if(name==='tv_save_profile'){sql='select public.tv_save_profile($1,$2) v';params=[args.p_name,args.p_last_lesson];}
   else throw Error('unknown RPC');return {data:(await db.query(sql,params)).rows[0].v,error:null};
  }catch(e){return {data:null,error:{code:e.code||'500'}};}finally{await db.exec('reset role');}
 })};}});
 const root=path.resolve('dist'),server=http.createServer(async(req,res)=>{
  res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};const url=new URL(req.url,'http://127.0.0.1:8081');
  if(url.pathname==='/api/academy')return handler(req,res);
  try{const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))throw Error('denied');const data=await fs.readFile(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.statusCode=404;res.end('Not found');}
 });await new Promise(ok=>server.listen(8081,'127.0.0.1',ok));return {server,db,serial,close:async()=>{await new Promise(ok=>server.close(ok));await db.close();}};
}
module.exports={start};
