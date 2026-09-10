'use strict';
const crypto=require('node:crypto');
const {serviceClient}=require('./service-supabase.cjs');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function rpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error){const e=new Error(error.code==='22023'?'invalid_qa_data':'qa_database_unavailable');e.code=e.message;e.status=error.code==='22023'?400:503;throw e;}return data;}
async function maybeOrder(client,reference){const {data,error}=await client.rpc('tv_payment_order',{p_provider:'test',p_reference:reference});if(!error)return data;if(error.code==='22023')return null;throw Object.assign(new Error('qa_database_unavailable'),{code:'qa_database_unavailable',status:503});}
const day=(anchor,offset)=>new Date(anchor.getTime()+offset*86400000).toISOString();
function createQaRegistry({client,now=()=>new Date()}={}){const c=client||serviceClient();async function seed(actorId){const anchor=new Date(now());anchor.setUTCHours(0,0,0,0);const scenarios=[
 {ref:'qa-active-mini-base',email:'qa+active-base@example.test',product:'mini-base',amount:1500,purchased:day(anchor,-30),status:'approved'},
 {ref:'qa-active-mini-pro',email:'qa+active-pro@example.test',product:'mini-pro',amount:2500,purchased:day(anchor,-60),status:'approved'},
 {ref:'qa-expired-mini-base',email:'qa+expired@example.test',product:'mini-base',amount:1500,purchased:day(anchor,-211),status:'approved'},
 {ref:'qa-lifetime-atlas',email:'qa+lifetime@example.test',product:'atlas-28d',amount:3000,purchased:day(anchor,-10),status:'approved'},
 {ref:'qa-refunded',email:'qa+refunded@example.test',product:'mini-base',amount:1500,purchased:day(anchor,-20),status:'refunded'},
 {ref:'qa-chargeback',email:'qa+chargeback@example.test',product:'mini-pro',amount:2500,purchased:day(anchor,-20),status:'chargeback'},
 {ref:'qa-review',email:'qa+review@example.test',product:null,amount:1900,purchased:day(anchor,-5),status:'review'}
 ];const out=[];for(const s of scenarios){let existing=await maybeOrder(c,s.ref);if(existing){out.push({reference:s.ref,status:existing.status,existing:true});continue;}const reg={provider:'test',reference:s.ref,email:s.email,product:s.product,amount:s.amount,currency:'USD',purchased:s.purchased};await rpc(c,'tv_register_order',{p_provider:'test',p_reference:s.ref,p_buyer_email:s.email,p_product_id:s.product,p_product_hint:s.product?null:'Synthetic QA review',p_amount_minor:s.amount,p_currency:'USD',p_purchased_at:s.purchased,p_event_key:'qa-register:'+s.ref,p_payload_hash:hash(reg)});if(['refunded','chargeback'].includes(s.status)){const approvedAt=new Date(new Date(s.purchased).getTime()+60000).toISOString();await rpc(c,'tv_apply_payment_status',{p_provider:'test',p_reference:s.ref,p_status:'approved',p_observed_at:approvedAt,p_event_key:'qa-approved:'+s.ref,p_payload_hash:hash({ref:s.ref,status:'approved'})});}await rpc(c,'tv_apply_payment_status',{p_provider:'test',p_reference:s.ref,p_status:s.status,p_observed_at:day(anchor,-1),p_event_key:'qa-status:'+s.ref+':'+s.status,p_payload_hash:hash({ref:s.ref,status:s.status})});out.push({reference:s.ref,status:s.status,existing:false});}await rpc(c,'tv_admin_audit',{p_actor:actorId,p_action:'qa_seed',p_detail:{count:out.length,references:out.map(x=>x.reference)}});return{count:out.length,scenarios:out};}
 async function cleanup(actorId){return rpc(c,'tv_admin_cleanup_qa',{p_actor:actorId});}
 return{seed,cleanup};}
module.exports={createQaRegistry};
