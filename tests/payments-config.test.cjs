const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPayments}=require('../server/payments.cjs');

test('admin registry does not require WayForPay credentials',async()=>{
 const oldAccount=process.env.WAYFORPAY_MERCHANT_ACCOUNT,oldSecret=process.env.WAYFORPAY_SECRET_KEY;
 delete process.env.WAYFORPAY_MERCHANT_ACCOUNT;delete process.env.WAYFORPAY_SECRET_KEY;
 const client={rpc:async(name,args)=>name==='tv_admin_registry'?{data:{orders:[],actor:args.p_actor},error:null}:{data:null,error:{code:'unexpected'}}};
 try{
  const payments=createPayments({client});
  const result=await payments.registry('10000000-0000-4000-8000-000000000001');
  assert.deepEqual(result.orders,[]);
  assert.equal(payments.config,undefined);
 }finally{
  if(oldAccount===undefined)delete process.env.WAYFORPAY_MERCHANT_ACCOUNT;else process.env.WAYFORPAY_MERCHANT_ACCOUNT=oldAccount;
  if(oldSecret===undefined)delete process.env.WAYFORPAY_SECRET_KEY;else process.env.WAYFORPAY_SECRET_KEY=oldSecret;
 }
});

test('provider verification still fails closed without WayForPay credentials',async()=>{
 const oldAccount=process.env.WAYFORPAY_MERCHANT_ACCOUNT,oldSecret=process.env.WAYFORPAY_SECRET_KEY;
 delete process.env.WAYFORPAY_MERCHANT_ACCOUNT;delete process.env.WAYFORPAY_SECRET_KEY;
 const client={rpc:async name=>name==='tv_payment_order'?{data:{reference:'r',amountMinor:1500,currency:'USD'},error:null}:{data:null,error:{code:'unexpected'}}};
 try{
  const payments=createPayments({client});
  await assert.rejects(payments.verifyAndApplyReference('r'),e=>e.code==='wayforpay_not_configured'&&e.status===503);
 }finally{
  if(oldAccount===undefined)delete process.env.WAYFORPAY_MERCHANT_ACCOUNT;else process.env.WAYFORPAY_MERCHANT_ACCOUNT=oldAccount;
  if(oldSecret===undefined)delete process.env.WAYFORPAY_SECRET_KEY;else process.env.WAYFORPAY_SECRET_KEY=oldSecret;
 }
});
