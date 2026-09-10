'use strict';
const DEMO_ID='90000000-0000-4000-8000-000000000001';
const lessonKey=i=>`${Math.floor(i/7)+1}-${i%7+1}`;
function demoLessons(){return Array.from({length:28},(_,i)=>({lesson_key:lessonKey(i),completed:i<8,steps:i<8?[0]:[],notes:i===3?'Тут відчуваю більше простору в ребрах і спокійніший вдих.':i===6?'Резонанс став відчутнішим у масці — без тиску.':'',bookmarked:i===3||i===6,version:i<8?2:0}));}
function demoAccount(now=Date.now()){
 const purchased=new Date(now-30*86400000).toISOString(),expires=new Date(now+180*86400000).toISOString();
 return{demo:true,user:{id:DEMO_ID,email:'demo@truevoice.academy',name:'Roman',role:'admin',lastLesson:'2-2'},access:{atlas:true},purchases:[
  {id:'demo-atlas',title:'TrueVoice Atlas 28D',productId:'atlas-28d',status:'approved',active:true,lifetime:true,expiresAt:null,test:true,purchasedAt:purchased},
  {id:'demo-mini',title:'TrueVoice 7D',productId:'mini-base',status:'approved',active:true,lifetime:false,expiresAt:expires,test:true,purchasedAt:purchased}
 ],lessons:demoLessons()};
}
function demoRegistry(now=Date.now()){
 const d=n=>new Date(now-n*86400000).toISOString(),future=n=>new Date(now+n*86400000).toISOString();
 return{orders:[
  {orderId:'demo-order-atlas',provider:'test',reference:'demo-atlas-lifetime',buyerEmail:'demo@truevoice.academy',productId:'atlas-28d',productTitle:'TrueVoice Atlas 28D',status:'approved',purchasedAt:d(30),resourceKey:'atlas',validUntil:null,revokedAt:null,test:true},
  {orderId:'demo-order-mini',provider:'test',reference:'demo-mini-active',buyerEmail:'student@example.test',productId:'mini-base',productTitle:'TrueVoice 7D',status:'approved',purchasedAt:d(20),resourceKey:'atlas',validUntil:future(190),revokedAt:null,test:true},
  {orderId:'demo-order-refund',provider:'test',reference:'demo-refunded',buyerEmail:'refund@example.test',productId:'mini-pro',productTitle:'TrueVoice 7D max',status:'refunded',purchasedAt:d(45),resourceKey:'atlas',validUntil:future(165),revokedAt:d(2),test:true},
  {orderId:'demo-order-review',provider:'test',reference:'demo-review',buyerEmail:'review@example.test',productId:null,productTitle:null,productHint:'Needs review',status:'review',purchasedAt:d(5),resourceKey:null,validUntil:null,revokedAt:null,test:true}
 ]};
}
module.exports={DEMO_ID,demoAccount,demoRegistry};
