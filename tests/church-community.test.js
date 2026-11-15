import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPayload, createCommunityHandler } from '../server/community.js';
import { communityEvents } from '../src/lib/community.js';
import { availableMembers, canSeeScreen, memberPayload } from '../src/lib/member-settings.js';
const id='10000000-0000-4000-8000-000000000001';
const prayer={action:'submit_prayer',id,name:'Visitante',message:'Precisamos de oração pela família.',anonymous:false,visibility:'team'};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
const request=body=>({method:'POST',headers:{host:'louvesync.vercel.app',origin:'https://louvesync.vercel.app','x-real-ip':'192.0.2.10'},body});
const rpc=result=>({abortSignal:async()=>result});

test('a church member has community access without ministry routes, admin rights or automatic assignment',()=>{
 const member={id:'church',access_type:'church_member',name:'Membro',role:'Líder de Louvor',is_admin:true,status:'ativo',scheduleEnabled:true,permissions:['ia','admin','escala']};
 assert.equal(canSeeScreen(member,'admin'),false);assert.equal(canSeeScreen(member,'ia'),false);assert.deepEqual(availableMembers([member],'2026-11-22'),[]);
 const saved=memberPayload(member);assert.equal(saved.is_admin,false);assert.equal(saved.schedule_enabled,false);assert.equal(saved.role,'Membro');assert.equal(saved.instrument,'');
});
test('public calendar excludes drafts, expired meetings and events outside the selected week',()=>{
 const now=Date.parse('2026-11-15T15:00:00-03:00'),event={id,published:true,starts_at:'2026-11-15T18:00:00-03:00'};
 assert.deepEqual(communityEvents([event,{...event,id:'draft',published:false},{...event,id:'expired',starts_at:'2026-11-14T18:00:00-03:00'},{...event,id:'future',starts_at:'2026-12-20T18:00:00-03:00'}],{now,filter:'week'}).map(row=>row.id),[id]);
});
test('today meetings without an end time remain findable and explicit ended meetings are removed',()=>{
 const now=Date.parse('2026-11-15T19:00:00-03:00'),event={id,published:true,starts_at:'2026-11-15T18:00:00-03:00'};
 assert.deepEqual(communityEvents([event,{...event,id:'ended',ends_at:'2026-11-15T18:30:00-03:00'}],{now}).map(row=>row.id),[id]);
});
test('prayer intake validates consent, ignores client moderation and strips the name from anonymous payloads',()=>{
 assert.equal(communityPayload({...prayer,message:'curto'}),null);assert.equal(communityPayload({...prayer,website:'spam.example'}),null);
 assert.equal(communityPayload({...prayer,visibility:'public-forced'}),null);
 const safe=communityPayload({...prayer,anonymous:true,published:true,status:'answered',is_admin:true});assert.equal(safe.name,'');assert.equal(safe.published,undefined);assert.equal(safe.status,undefined);
 assert.equal(communityPayload({action:'admin_list',is_admin:true}),null);
});
test('anonymous intake does not link the member identity and never sends the raw IP to storage',async()=>{
 let call;
 const db={rpc(name,payload){call={name,payload};return rpc({data:{ok:true,id}});}},auth={rpc(){return rpc({data:{ok:true,member:{id:'member'}}});}};
 const handler=createCommunityHandler({connect:()=>({db,auth,salt:'SYNTHETIC_SERVER_SECRET'})});const res=response();await handler(request({...prayer,anonymous:true,memberId:'member',pin:'SYNTHETIC_PIN'}),res);
 assert.equal(res.code,200);assert.equal(call.payload.p_member_id,null);assert.equal(call.payload.p_payload.name,'');assert.match(call.payload.p_ip_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(call).includes('192.0.2.10'));assert.ok(!JSON.stringify(res.body).includes('SYNTHETIC'));
});
test('server returns a durable intake acknowledgement and a useful retry error without leaking backend details',async()=>{
 for(const [code,status] of [['54000',429],['42501',403],['40001',409],['XX000',503]]){
  const handler=createCommunityHandler({connect:()=>({db:{rpc:()=>rpc({error:{code,message:'PRIVATE_DATABASE_DETAILS'}})},salt:'SYNTHETIC_SECRET'})});const res=response();await handler(request(prayer),res);assert.equal(res.code,status);assert.ok(!JSON.stringify(res.body).includes('PRIVATE_DATABASE_DETAILS'));
 }
});
