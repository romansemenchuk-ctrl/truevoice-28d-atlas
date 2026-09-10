'use strict';
const {createClient}=require('@supabase/supabase-js');
function serviceConfig(env=process.env){return{url:String(env.SUPABASE_URL||''),key:String(env.SUPABASE_SERVICE_ROLE_KEY||'')};}
function serviceClient(config=serviceConfig()){
 if(!config.url||!config.key){const e=new Error('service_supabase_not_configured');e.code='service_supabase_not_configured';throw e;}
 return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});
}
module.exports={serviceConfig,serviceClient};
