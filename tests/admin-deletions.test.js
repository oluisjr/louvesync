import test from 'node:test';
import assert from 'node:assert/strict';
import { adminDeletionPayload, createAdminDeleteHandler } from '../api/admin-delete.js';
import legacyDelete from '../api/delete-event.js';
import { deleteAdminContent } from '../src/lib/admin-delete-client.js';

const admin = { memberId:'admin-fixture', pin:'ADMIN_FIXTURE_PIN' };
const request = body => ({ method:'POST', headers:{host:'louvesync.vercel.app',origin:'https://louvesync.vercel.app'}, body });
const response = () => ({ code:200, body:null, headers:{}, setHeader(name,value){this.headers[name]=value;}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;} });
async function configured(run) {
  const previous = { url:process.env.SUPABASE_URL, key:process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_ANON_KEY='public-fixture-key';
  try { return await run(); }
  finally { for(const [name,value] of [['SUPABASE_URL',previous.url],['SUPABASE_ANON_KEY',previous.key]])if(value===undefined)delete process.env[name];else process.env[name]=value; }
}
function fixture() {
  const calls=[];
  let outcome;
  const factory=()=>({rpc(name,args){calls.push({name,args});return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);return Promise.resolve(outcome||{data:{ok:true,targetType:args.p_payload.targetType,targetId:args.p_payload.targetId},error:null});}};}});
  return {calls,handler:createAdminDeleteHandler(factory),set result(value){outcome=value;}};
}

test('deletion payload validates the target and strips client privilege flags',()=>{
  const input={...admin,targetType:'song',targetId:'song-1',is_admin:true,role:'admin',date:'2026-11-13'};
  assert.deepEqual(adminDeletionPayload(input),{targetType:'song',targetId:'song-1',...admin});
  for(const invalid of [{...input,targetType:'members'},{...input,targetId:''},{...input,pin:''},{...input,memberId:3},null])assert.equal(adminDeletionPayload(invalid),null);
});

test('admin deletion uses the database authorization RPC and never a direct table delete',async()=>configured(async()=>{
  const app=fixture(),res=response();
  await app.handler(request({...admin,targetType:'event',targetId:'event-1',is_admin:true}),res);
  assert.equal(res.code,200);assert.deepEqual(res.body,{ok:true,targetType:'event',targetId:'event-1'});
  assert.deepEqual(app.calls,[{name:'louvesync_admin_delete',args:{p_payload:{targetType:'event',targetId:'event-1',...admin}}}]);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
}));

test('ordinary members cannot gain deletion access by spoofing is_admin',async()=>configured(async()=>{
  const app=fixture();app.result={data:null,error:{code:'42501',message:'not admin'}};
  const res=response();await app.handler(request({memberId:'ordinary-member',pin:'MEMBER_PIN',targetType:'song',targetId:'song-1',is_admin:true}),res);
  assert.equal(res.code,403);assert.equal(app.calls[0].args.p_payload.is_admin,undefined);
}));

test('missing credentials, foreign origins and legacy bulk deletion cannot call the database',async()=>configured(async()=>{
  const app=fixture();
  for(const [req,status] of [
    [request({targetType:'event',targetId:'event-1'}),401],
    [{...request({...admin,targetType:'song',targetId:'song-1'}),method:'GET'},405],
    [{...request({...admin,targetType:'song',targetId:'song-1'}),headers:{host:'louvesync.vercel.app',origin:'https://other.test'}},403],
    [request({...admin,date:'2026-11-13'}),400],
  ]){const res=response();await app.handler(req,res);assert.equal(res.code,status);}
  assert.equal(app.calls.length,0);
  const legacy=response();await legacyDelete({method:'POST',headers:{},body:{date:'2026-11-13'},query:{date:'2026-11-13'}},legacy);assert.equal(legacy.code,401);
}));

test('uninstalled authorization, wrong PIN, missing content and unconfirmed writes fail closed',async()=>configured(async()=>{
  const app=fixture(),body={...admin,targetType:'event',targetId:'event-1'};
  for(const [code,status] of [['PGRST202',503],['28000',401],['P0002',404],['23503',409],['XX000',503]]){
    app.result={data:null,error:{code,message:admin.pin+' private database details'}};
    const res=response();await app.handler(request(body),res);assert.equal(res.code,status);assert.ok(!JSON.stringify(res.body).includes(admin.pin));
  }
  app.result={data:{ok:true,targetType:'event',targetId:'another-event'},error:null};
  const res=response();await app.handler(request(body),res);assert.equal(res.code,503);
}));

test('client sends credentials only in POST and waits for the matching confirmed target',async()=>{
  let observed;
  const result=await deleteAdminContent('song','song-1',{id:admin.memberId,pin:admin.pin,is_admin:true},async(url,options)=>{
    observed={url,options};return {ok:true,json:async()=>({ok:true,targetType:'song',targetId:'song-1'})};
  });
  assert.deepEqual(result,{ok:true,targetType:'song',targetId:'song-1'});
  assert.equal(observed.url,'/api/admin-delete');assert.equal(observed.options.method,'POST');assert.equal(observed.options.cache,'no-store');
  assert.deepEqual(JSON.parse(observed.options.body),{targetType:'song',targetId:'song-1',...admin});
  await assert.rejects(()=>deleteAdminContent('event','event-1',admin,async()=>({ok:false,json:async()=>({error:'Acesso exclusivo do administrador.'})})),/administrador/);
  await assert.rejects(()=>deleteAdminContent('event','event-1',admin,async()=>({ok:true,json:async()=>({ok:true,targetType:'event',targetId:'wrong-event'})})),/não foi confirmada/);
  let called=false;await assert.rejects(()=>deleteAdminContent('event','event-1',{id:admin.memberId},async()=>{called=true;}),/sessão/);assert.equal(called,false);
});
