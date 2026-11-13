import test from 'node:test';
import assert from 'node:assert/strict';
import webPush from 'web-push';
import { createNotificationsHandler, dispatchNotifications, notificationsPayload } from '../server/notifications.js';
import { notificationDestination, notificationRequest, pushSupport } from '../src/lib/notifications-client.js';

const keys=webPush.generateVAPIDKeys();
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'anon-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-only-fixture',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:'https://louvesync.vercel.app'};
const credentials={memberId:'member-fixture',pin:'PIN_FIXTURE'};
const client=result=>({rpc:()=>({abortSignal:async()=>result})});
async function request(handler,body,method='POST'){
 const result={statusCode:200,headers:{},body:null};
 const res={setHeader:(key,value)=>{result.headers[key]=value;},status:code=>{result.statusCode=code;return res;},json:value=>{result.body=value;return value;}};
 await handler({method,headers:{host:'app.test',origin:'https://app.test'},body,query:{}},res);
 return result;
}
test('notification payload strips recipient and privilege overrides and rejects invalid devices',()=>{
 assert.deepEqual(notificationsPayload({...credentials,action:'list',memberIds:['other'],is_admin:true}),{...credentials,action:'list'});
 assert.equal(notificationsPayload({...credentials,action:'subscribe',subscription:{endpoint:'https://127.0.0.1/private'}}),null);
 assert.equal(notificationsPayload({...credentials,action:'mark_read',ids:['not-an-id']}),null);
});
test('inbox API delegates identity to persisted PIN authorization and reports missing setup',async()=>{
 const accepted=createNotificationsHandler({env,clientFactory:()=>client({data:{ok:true,items:[]},error:null})});
 assert.equal((await request(accepted,{...credentials,action:'list'})).statusCode,200);
 const denied=createNotificationsHandler({env,clientFactory:()=>client({error:{code:'28000'}})});
 assert.equal((await request(denied,{...credentials,action:'list',is_admin:true})).statusCode,401);
 const missing=createNotificationsHandler({env,clientFactory:()=>client({error:{code:'PGRST202'}})});
 const response=await request(missing,{...credentials,action:'list'});
 assert.equal(response.statusCode,503);assert.equal(response.body.setupRequired,true);
});
test('notification inbox and push worker normalize a copied Data API URL before connecting',async()=>{
 const calls=[];
 const handler=createNotificationsHandler({env:{...env,SUPABASE_URL:env.SUPABASE_URL+'/rest/v1/'},wait:async()=>{},clientFactory:(url,key)=>{
  calls.push({url,key});return client({data:{ok:true,deliveries:[]},error:null});
 }});
 const result=await request(handler,{...credentials,action:'dispatch'});
 assert.equal(result.statusCode,200);
 assert.deepEqual(calls,[{url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY},{url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}]);
 assert.ok(!JSON.stringify(result.body).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test('push configuration returns only public material and never claims disabled delivery succeeded',async()=>{
 const handler=createNotificationsHandler({env,clientFactory:()=>client({data:{ok:true}})});
 const config=await request(handler,{...credentials,action:'config'});
 assert.equal(config.body.publicKey,keys.publicKey);assert.equal(config.body.pushConfigured,true);
 assert.ok(!JSON.stringify(config.body).includes(keys.privateKey));assert.ok(!JSON.stringify(config.body).includes(env.SUPABASE_SERVICE_ROLE_KEY));
 const disabled=createNotificationsHandler({env:{...env,VAPID_PRIVATE_KEY:''},clientFactory:()=>client({data:{ok:true}})});
 const response=await request(disabled,{...credentials,action:'dispatch'});
 assert.equal(response.body.pushed,0);assert.equal(response.body.pushConfigured,false);
});
test('push delivery records accepted sends, expired endpoints and retryable failures separately',async()=>{
 const point=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth=Buffer.alloc(16,2).toString('base64url');
 const rows=['sent','expired','retry'].map((name,index)=>({deliveryId:name,claimToken:'claim-'+index,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/'+name,keys:{p256dh:point,auth}},notification:{id:name,title:'Escala atualizada',body:'Confira sua escala',url:'/?tab=escala&event=event-1'}}));
 const recorded=[];
 const worker={rpc:(_name,{p_payload})=>({abortSignal:async()=>{recorded.push(p_payload);return p_payload.action==='drain'?{data:{deliveries:rows}}:{data:{ok:true}};}})};
 const sent=[];
 const result=await dispatchNotifications(worker,{...keys,subject:env.VAPID_SUBJECT,configured:true},async(subscription,message)=>{
  sent.push(JSON.parse(message));
  if(subscription.endpoint.endsWith('expired'))throw {statusCode:410};
  if(subscription.endpoint.endsWith('retry'))throw {statusCode:503};
 },async()=>{});
 assert.equal(result.pushed,1);assert.equal(result.processed,3);
 assert.deepEqual(recorded.filter(item=>item.action==='complete').map(item=>item.status).sort(),['expired','retry','sent']);
 assert.equal(sent[0].tag,'sent');assert.equal(sent[0].url,'/?tab=escala&event=event-1');
 assert.ok(recorded.filter(item=>item.action==='complete').every(item=>item.claimToken));
});
test('browser transport cannot override logged-in identity or put PINs in URLs',async()=>{
 let captured;
 await notificationRequest(credentials,{action:'list',memberId:'spoof',pin:'spoof'},{fetcher:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({ok:true,items:[]})};}});
 assert.equal(captured.url,'/api/notifications');assert.equal(captured.options.method,'POST');
 assert.equal(JSON.parse(captured.options.body).memberId,credentials.memberId);assert.equal(JSON.parse(captured.options.body).pin,credentials.pin);
 assert.equal(notificationDestination({url:'https://attacker.test/?tab=escala'},'https://app.test'),null);
 assert.deepEqual(notificationDestination({url:'/?tab=escala&event=event-2'},'https://app.test'),{tab:'escala',eventId:'event-2',songId:null});
});
test('iPhone push asks for installation and unsupported devices retain the inbox',()=>{
 const browser={navigator:{userAgent:'iPhone',serviceWorker:{}},isSecureContext:true,Notification:{},PushManager:{},matchMedia:()=>({matches:false})};
 assert.equal(pushSupport(browser).supported,false);
 assert.equal(pushSupport({...browser,navigator:{...browser.navigator,standalone:true}}).supported,true);
 assert.equal(pushSupport({navigator:{}}).supported,false);
});
