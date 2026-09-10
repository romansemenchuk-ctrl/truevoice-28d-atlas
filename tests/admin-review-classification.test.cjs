const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,seed,scalar,A,C}=require('./db-fixture.cjs');

test('admin can classify only an unclassified review without changing financial identity or granting access',async()=>{
 const db=await fixture();
 try{
  await seed(db);
  await db.exec(`insert into tv_core.member_roles(user_id,role) values('${C}','admin')`);
  await db.query(`select public.tv_register_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
   'wayforpay','legacy-review-classify','legacy@example.test',null,'Old offer',1900,'USD',
   '2026-06-01T00:00:00Z','history:legacy-review-classify','hash-history-review-classify'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','legacy-review-classify','review','2026-06-01T00:01:00Z','review:legacy-review-classify','hash-review-classify'
  ]);
  const before=(await db.query("select buyer_email,amount_minor,currency,purchased_at,status,product_id from tv_core.orders where reference='legacy-review-classify'")).rows[0];

  await assert.rejects(
   db.query('select public.tv_admin_classify_review($1,$2,$3,$4)',[A,'wayforpay:legacy-review-classify','mini-base','support mapped legacy offer']),
   /admin required/
  );

  const result=(await scalar(db,'select public.tv_admin_classify_review($1,$2,$3,$4) v',[C,'wayforpay:legacy-review-classify','mini-base','support mapped legacy offer'])).v;
  assert.equal(result.productId,'mini-base');
  assert.equal(result.status,'review');

  const after=(await db.query("select buyer_email,amount_minor,currency,purchased_at,status,product_id from tv_core.orders where reference='legacy-review-classify'")).rows[0];
  assert.equal(after.buyer_email,before.buyer_email);
  assert.equal(after.amount_minor,before.amount_minor);
  assert.equal(after.currency,before.currency);
  assert.equal(new Date(after.purchased_at).toISOString(),new Date(before.purchased_at).toISOString());
  assert.equal(after.status,'review');
  assert.equal(after.product_id,'mini-base');
  assert.equal((await scalar(db,"select count(*)::int n from tv_core.entitlements where order_id='wayforpay:legacy-review-classify'")).n,0);
  assert.equal((await scalar(db,"select count(*)::int n from tv_core.audit_events where action='review_classify' and actor_id=$1",[C])).n,1);

  await assert.rejects(
   db.query('select public.tv_admin_classify_review($1,$2,$3,$4)',[C,'wayforpay:legacy-review-classify','mini-pro','try reclassify']),
   /review is already classified/
  );
  assert.equal((await scalar(db,"select has_function_privilege('authenticated','public.tv_admin_classify_review(uuid,text,text,text)','execute') allowed")).allowed,false);
 }finally{await db.close();}
});
