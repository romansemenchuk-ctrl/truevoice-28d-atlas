// Synthetic identities only. Never loaded by the deployment.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
const SA='20000000-0000-4000-8000-000000000001',SB='20000000-0000-4000-8000-000000000002',SC='20000000-0000-4000-8000-000000000003';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz,created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`);
for(const name of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));return db;}
async function seed(db){await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${A}','a@example.test',now()),('${B}','b@example.test',now()),('${C}','c@example.test',now());
insert into auth.sessions(id,user_id) values('${SA}','${A}'),('${SB}','${B}'),('${SC}','${C}');
insert into tv_core.orders(id,provider,reference,buyer_email,product_id,amount_minor,currency,status,verified_at) values('o-a','test','a','a@example.test','mini-base',1500,'USD','approved',now()),('o-b','test','b','b@example.test','mini-base',1500,'USD','approved',now());
insert into tv_core.entitlements(order_id,resource_key,user_id) values('o-a','atlas',null),('o-b','atlas','${B}');`);}
async function claims(db,id,session){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,exp:Math.floor(Date.now()/1000)+3600})]);await db.exec('set role authenticated');}
const scalar=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
module.exports={fixture,seed,claims,scalar,A,B,C,SA,SB,SC};
