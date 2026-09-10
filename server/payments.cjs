'use strict';
const crypto=require('node:crypto');
const wfp=require('./wayforpay.cjs');
const {serviceClient}=require('./service-supabase.cjs');
const PRODUCTS=new Set(['mini-base','mini-pro','mini-upgrade','atlas-28d']);
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value),'utf8').digest('hex');
const error=(code,status=500)=>{const e=new Error(code);e.code=code;e.status=status;return e;};
function email(v){const s=String(v||'').trim().toLowerCase();if(s.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw error('invalid_email',400);return s;}
function iso(v){const d=typeof v==='number'?new Date(v<1e12?v*1000:v):new Date(v);if(Number.isNaN(d.getTime()))throw error('invalid_timestamp',400);return d.toISOString();}
function paymentConfig(env=process.env){
 let legacyRules=[];try{legacyRules=JSON.parse(env.WAYFORPAY_LEGACY_RULES_JSON||'[]');if(!Array.isArray(legacyRules))legacyRules=[];}catch{throw error('invalid_legacy_rules',500);}
 const merchantAccount=String(env.WAYFORPAY_MERCHANT_ACCOUNT||''),secret=String(env.WAYFORPAY_SECRET_KEY||'');
 if(!merchantAccount||!secret)throw error('wayforpay_not_configured',503);
 return{merchantAccount,secret,legacyRules};
}
async function rpc(client,name,args){const {data,error:dbError}=await client.rpc(name,args);if(dbError){const e=error(dbError.code==='22023'?'invalid_payment_data':'payment_database_unavailable',dbError.code==='22023'?400:503);e.cause=dbError;throw e;}return data;}
function eventTime(payload){const v=payload?.processingDate??payload?.createdDate??payload?.transactionDate??Date.now();return iso(v);}
function createPayments({client,provider=wfp,providerConfig,fetchImpl=globalThis.fetch}={}){
 const c=client||serviceClient(),cfg=providerConfig||paymentConfig();
 async function registerTrustedOrder(input){
  const reference=String(input?.reference||'').trim(),buyerEmail=email(input?.email),productId=String(input?.productId||'');
  if(!reference||reference.length>180||!PRODUCTS.has(productId)||!Number.isInteger(input?.amountMinor)||input.amountMinor<=0)throw error('invalid_order',400);
  const currency=String(input.currency||'').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw error('invalid_currency',400);
  const purchasedAt=iso(input.purchasedAt),identity={reference,email:buyerEmail,productId,amountMinor:input.amountMinor,currency,purchasedAt};
  return rpc(c,'tv_register_order',{p_provider:'wayforpay',p_reference:reference,p_buyer_email:buyerEmail,p_product_id:productId,p_product_hint:null,p_amount_minor:input.amountMinor,p_currency:currency,p_purchased_at:purchasedAt,p_event_key:'checkout:'+sha(reference).slice(0,48),p_payload_hash:sha(identity)});
 }
 async function registeredOrder(reference){return rpc(c,'tv_payment_order',{p_provider:'wayforpay',p_reference:String(reference||'')});}
 async function verifyAndApplyReference(reference){
  reference=String(reference||'').trim();if(!reference)throw error('invalid_reference',400);
  const expected=await registeredOrder(reference),payload=await provider.fetchCheckStatus(cfg,reference,fetchImpl);
  if(!provider.verifyStatusResponse(cfg,payload))throw error('provider_signature_invalid',502);
  if(String(payload.orderReference||'')!==reference)throw error('provider_reference_mismatch',502);
  let amountMinor=null;try{amountMinor=provider.parseAmountMinor(payload.amount);}catch{}
  const currency=String(payload.currency||'').toUpperCase(),providerState=provider.providerStatus(payload);
  const mismatch=amountMinor===null||amountMinor!==Number(expected.amountMinor)||currency!==String(expected.currency||'').toUpperCase();
  const finalState=mismatch?'review':providerState,observedAt=eventTime(payload);
  const fingerprint={merchantAccount:payload.merchantAccount,orderReference:payload.orderReference,amount:payload.amount,currency:payload.currency,authCode:payload.authCode,cardPan:payload.cardPan,transactionStatus:payload.transactionStatus,reasonCode:payload.reasonCode,refundAmount:payload.refundAmount??null,merchantSignature:payload.merchantSignature};
  const result=await rpc(c,'tv_apply_payment_status',{p_provider:'wayforpay',p_reference:reference,p_status:finalState,p_observed_at:observedAt,p_event_key:'status:'+sha(fingerprint).slice(0,48),p_payload_hash:sha(fingerprint)});
  return{reference,status:result.status,providerStatus:providerState,mismatch,duplicate:result.duplicate===true};
 }
 async function applyProviderEvent(callbackPayload){
  if(!provider.verifyStatusResponse(cfg,callbackPayload))throw error('bad_signature',400);
  const reference=String(callbackPayload?.orderReference||'').trim();if(!reference)throw error('invalid_reference',400);
  return verifyAndApplyReference(reference);
 }
 return{registerTrustedOrder,registeredOrder,verifyAndApplyReference,applyProviderEvent,config:cfg};
}
let singleton;
const defaults=()=>singleton||(singleton=createPayments());
module.exports={paymentConfig,createPayments,registerTrustedOrder:input=>defaults().registerTrustedOrder(input),verifyAndApplyReference:reference=>defaults().verifyAndApplyReference(reference),applyProviderEvent:payload=>defaults().applyProviderEvent(payload),sha};
