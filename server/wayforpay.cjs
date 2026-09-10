'use strict';
const crypto=require('node:crypto');
const API_URL='https://api.wayforpay.com/api';
const STATUS_FIELDS=['merchantAccount','orderReference','amount','currency','authCode','cardPan','transactionStatus','reasonCode'];

function hmacMd5(secret,parts){return crypto.createHmac('md5',String(secret||'')).update(parts.map(v=>v===undefined||v===null?'':String(v)).join(';'),'utf8').digest('hex');}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function parseAmountMinor(value){
 const s=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('invalid_amount');
 const [whole,frac='']=s.split('.');const cents=BigInt(whole)*100n+BigInt((frac+'00').slice(0,2));
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('amount_too_large');return Number(cents);
}
function transactionListRequest(config,{dateBegin,dateEnd}){
 const merchantAccount=String(config?.merchantAccount||''),secret=String(config?.secret||'');
 if(!merchantAccount||!secret||!Number.isInteger(dateBegin)||!Number.isInteger(dateEnd)||dateBegin<0||dateEnd<dateBegin)throw new Error('invalid_transaction_list_request');
 return{transactionType:'TRANSACTION_LIST',merchantAccount,merchantSignature:hmacMd5(secret,[merchantAccount,dateBegin,dateEnd]),apiVersion:1,dateBegin,dateEnd};
}
function checkStatusRequest(config,reference){
 const merchantAccount=String(config?.merchantAccount||''),secret=String(config?.secret||''),orderReference=String(reference||'');
 if(!merchantAccount||!secret||!orderReference)throw new Error('invalid_check_status_request');
 return{transactionType:'CHECK_STATUS',merchantAccount,orderReference,merchantSignature:hmacMd5(secret,[merchantAccount,orderReference]),apiVersion:1};
}
function verifyStatusResponse(config,payload){
 if(!payload||typeof payload!=='object'||String(payload.merchantAccount||'')!==String(config?.merchantAccount||''))return false;
 const expected=hmacMd5(config?.secret,STATUS_FIELDS.map(k=>payload[k]));return safeEqual(expected,payload.merchantSignature);
}
function providerStatus(payload){
 try{if(payload?.refundAmount!==undefined&&parseAmountMinor(payload.refundAmount)>0)return'refunded';}catch{}
 const s=String(payload?.transactionStatus||'').toLowerCase().replace(/[\s_-]/g,'');
 if(['refund','refunded'].includes(s))return'refunded';
 if(['chargeback','chargedback'].includes(s))return'chargeback';
 if(s==='approved')return'approved';
 if(['declined','expired','voided'].includes(s))return'declined';
 if(['pending','inprocessing','waitingauthcomplete','waitingauth','processing'].includes(s))return'pending';
 return'review';
}
function productFromReference(reference){
 const m=/^tv-(base|pro|upgrade|atlas)-\d+-[a-z0-9]+$/i.exec(String(reference||''));
 if(!m)return null;return{base:'mini-base',pro:'mini-pro',upgrade:'mini-upgrade',atlas:'atlas-28d'}[m[1].toLowerCase()]||null;
}
function validEmail(v){const s=String(v||'').trim().toLowerCase();return s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null;}
function toIso(v){
 if(v===undefined||v===null||v==='')return null;
 if(typeof v==='number'||/^\d+$/.test(String(v))){const n=Number(v),ms=n<1e12?n*1000:n;const d=new Date(ms);return Number.isNaN(d.getTime())?null:d.toISOString();}
 const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();
}
function ruleMatches(rule,{reference,amountMinor,currency}){
 if(!rule||typeof rule!=='object'||typeof rule.productId!=='string'||!Number.isInteger(rule.amountMinor)||typeof rule.currency!=='string')return false;
 if(rule.amountMinor!==amountMinor||rule.currency.toUpperCase()!==currency)return false;
 if(rule.referencePattern===undefined)return true;
 try{return new RegExp(rule.referencePattern).test(reference);}catch{return false;}
}
function normalizeHistoryTransaction(tx,rules=[]){
 const reference=String(tx?.orderReference||'').trim(),currency=String(tx?.currency||'').trim().toUpperCase();
 let amountMinor=null;try{amountMinor=parseAmountMinor(tx?.amount);}catch{}
 const status=providerStatus(tx),buyerEmail=validEmail(tx?.email||tx?.clientEmail),purchasedAt=toIso(tx?.createdDate??tx?.transactionDate??tx?.orderDate??tx?.processingDate);
 let productId=productFromReference(reference),classification=productId?'mapped':'review';
 if(!productId&&reference&&amountMinor!==null&&/^[A-Z]{3}$/.test(currency)){
  const matches=Array.isArray(rules)?rules.filter(r=>ruleMatches(r,{reference,amountMinor,currency})):[];
  if(matches.length===1){productId=matches[0].productId;classification='mapped';}
 }
 if(!reference||amountMinor===null||!/^[A-Z]{3}$/.test(currency)||!buyerEmail||!purchasedAt)classification='review';
 return{reference,productId,productHint:productId?null:String(tx?.productName||tx?.product||'').slice(0,160)||null,amountMinor,currency,status,buyerEmail,purchasedAt,classification};
}
async function postJson(body,fetchImpl=globalThis.fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetchImpl(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});if(!r.ok)throw new Error('wayforpay_http_'+r.status);const data=await r.json();if(!data||typeof data!=='object')throw new Error('wayforpay_invalid_json');return data;}finally{clearTimeout(timer);}
}
async function fetchTransactionList(config,range,fetchImpl=globalThis.fetch){return postJson(transactionListRequest(config,range),fetchImpl);}
async function fetchCheckStatus(config,reference,fetchImpl=globalThis.fetch){return postJson(checkStatusRequest(config,reference),fetchImpl);}
module.exports={API_URL,STATUS_FIELDS,hmacMd5,parseAmountMinor,transactionListRequest,checkStatusRequest,verifyStatusResponse,providerStatus,productFromReference,normalizeHistoryTransaction,fetchTransactionList,fetchCheckStatus};
