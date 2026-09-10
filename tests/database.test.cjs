const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,seed,claims,scalar,A,B,C,SA,SB,SC}=require('./db-fixture.cjs');
test('database isolation and entitlement lifecycle',async t=>{const db=await fixture();try{await seed(db);
await t.test('access policy is 210 days / lifetime / no upgrade grant',async()=>{
 const rows=(await db.query(`select product_id,resource_key,access_mode,access_days from tv_core.product_resources order by product_id`)).rows;
 assert.deepEqual(rows,[
  {product_id:'atlas-28d',resource_key:'atlas',access_mode:'lifetime',access_days:null},
  {product_id:'mini-base',resource_key:'atlas',access_mode:'duration',access_days:210},
  {product_id:'mini-pro',resource_key:'atlas',access_mode:'duration',access_days:210}
 ]);
});
await t.test('anonymous denied',async()=>{await db.exec('set role anon');await assert.rejects(db.query('select public.tv_account()'),/permission denied/);await db.exec('reset role');});
await claims(db,A,SA);
await t.test('verified buyer claims only own purchase',async()=>{const v=(await scalar(db,'select public.tv_account() v')).v;assert.equal(v.user.id,A);assert.equal(v.user.role,'student');assert.equal(v.purchases.length,1);assert.equal(v.purchases[0].reference,'a');});
await t.test('save notes with optimistic conflict',async()=>{let v=(await scalar(db,'select public.tv_save_lesson($1,$2,$3) v',['1-1',0,{notes:'A private note',steps:[0],completed:false}])).v;assert.equal(v.version,1);v=(await scalar(db,'select public.tv_save_lesson($1,$2,$3) v',['1-1',0,{notes:'stale',steps:[]}])).v;assert.equal(v.conflict,true);assert.equal(v.current.notes,'A private note');});
await t.test('invalid steps and role escalation rejected',async()=>{await assert.rejects(db.query('select public.tv_save_lesson($1,$2,$3)',['1-1',1,{steps:[999]}]),/invalid lesson state/);await assert.rejects(db.query('insert into tv_core.member_roles(user_id,role) values($1,\'admin\')',[A]),/permission denied/);});
await t.test('disabling a sold product does not revoke issued entitlement',async()=>{await db.exec("reset role;update tv_core.products set enabled=false where id='mini-base'");await claims(db,A,SA);assert.equal((await scalar(db,"select tv_core.can_access('atlas') ok")).ok,true);});
await claims(db,B,SB);
await t.test('B cannot read A through RLS or RPC',async()=>{assert.equal((await db.query('select * from tv_core.lesson_state')).rows.length,0);assert.equal((await scalar(db,'select public.tv_account() v')).v.lessons.length,0);await assert.rejects(db.query('select * from tv_core.entitlements'),/permission denied/);});
await claims(db,C,SC);
await t.test('no purchase denied',async()=>await assert.rejects(db.query('select public.tv_account()'),/access denied/));
await t.test('terminal refund cannot be resurrected by old approved replay',async()=>{await db.exec('reset role');await db.exec("update tv_core.products set enabled=true where id='mini-base'");
 await db.query(`select public.tv_register_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,['wayforpay','order-terminal','terminal@example.test','mini-base',null,1500,'USD','2026-01-01T00:00:00Z','registered-order-terminal','hash-register']);
 await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,['wayforpay','order-terminal','approved','2026-01-01T00:01:00Z','approved-event','hash-approved']);
 await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,['wayforpay','order-terminal','refunded','2026-01-02T00:00:00Z','refund-event','hash-refund']);
 await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,['wayforpay','order-terminal','approved','2026-01-01T00:01:00Z','approved-replay','hash-approved-replay']);
 assert.equal((await scalar(db,"select status from tv_core.orders where reference='order-terminal'")).status,'refunded');
});
await db.exec("reset role;update tv_core.orders set status='refunded' where id='o-a'");await claims(db,A,SA);
await t.test('refund denies access and RLS read',async()=>{await assert.rejects(db.query('select public.tv_account()'),/access denied/);assert.equal((await db.query('select * from tv_core.lesson_state')).rows.length,0);});
await db.exec("reset role;update tv_core.orders set status='approved' where id='o-a';update tv_core.entitlements set revoked_at=null,valid_from=now()-interval '1 day',valid_until=now()-interval '1 second' where order_id='o-a'");await claims(db,A,SA);
await t.test('expired grant denied',async()=>await assert.rejects(db.query('select public.tv_account()'),/access denied/));
await db.exec(`reset role;insert into tv_core.member_roles values('${C}','admin',now())`);await claims(db,C,SC);
await t.test('explicit admin role recognized',async()=>assert.equal((await scalar(db,'select public.tv_account() v')).v.user.role,'admin'));
await db.exec(`reset role;delete from auth.sessions where id='${SC}'`);await claims(db,C,SC);
await t.test('deleted session denies admin',async()=>await assert.rejects(db.query('select public.tv_account()'),/access denied/));
await db.exec('reset role');
await t.test('all app tables have RLS and no anonymous RPC grant',async()=>{assert.equal((await scalar(db,"select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='tv_core' and c.relkind='r' and not c.relrowsecurity")).n,0);assert.equal((await scalar(db,"select has_function_privilege('anon','public.tv_save_lesson(text,integer,jsonb)','execute') allowed")).allowed,false);assert.equal((await scalar(db,"select has_function_privilege('authenticated','public.tv_register_order(text,text,text,text,text,bigint,text,timestamptz,text,text)','execute') allowed")).allowed,false);});
}finally{await db.close();}});
