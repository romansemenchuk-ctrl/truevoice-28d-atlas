const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,seed,claims,scalar,C,SC}=require('./db-fixture.cjs');

async function createReviewOrder(db,reference){
 await db.query(`select public.tv_register_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
  'wayforpay',reference,'c@example.test','mini-base',null,1500,'USD',
  '2026-09-01T00:00:00Z','register:'+reference,'hash-register:'+reference
 ]);
}

test('older Approved replay cannot clear a newer verified review',async()=>{
 const db=await fixture();
 try{
  await seed(db);await createReviewOrder(db,'order-review-replay');
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','order-review-replay','approved','2026-09-01T00:01:00Z','approve-review-replay','hash-approve-review-replay'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','order-review-replay','review','2026-09-02T00:00:00Z','review-review-replay','hash-review-review-replay'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','order-review-replay','approved','2026-09-01T00:01:00Z','stale-approve-review-replay','hash-stale-approve-review-replay'
  ]);

  assert.equal((await scalar(db,"select status from tv_core.orders where reference='order-review-replay'")).status,'review');
  await claims(db,C,SC);await scalar(db,'select public.tv_account() v');
  assert.equal((await scalar(db,"select tv_core.can_access('atlas') ok")).ok,false);
 }finally{await db.close();}
});

test('fresh re-verification of the same Approved provider fact clears review quarantine',async()=>{
 const db=await fixture();
 try{
  await seed(db);await createReviewOrder(db,'order-review-reverify');
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','order-review-reverify','approved','2026-09-01T00:01:00Z','approved-provider-fact','same-approved-payload-hash'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
   'wayforpay','order-review-reverify','review','2026-09-02T00:00:00Z','review-provider-fact','review-payload-hash'
  ]);
  const result=(await scalar(db,`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6) v`,[
   'wayforpay','order-review-reverify','approved','2026-09-03T00:00:00Z','approved-provider-fact','same-approved-payload-hash'
  ])).v;

  assert.equal(result.duplicate,true);
  assert.equal(result.changed,true);
  assert.equal(result.status,'approved');
  await claims(db,C,SC);await scalar(db,'select public.tv_account() v');
  assert.equal((await scalar(db,"select tv_core.can_access('atlas') ok")).ok,true);
 }finally{await db.close();}
});
