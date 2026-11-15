import fs from 'node:fs';
import { createCommunityHandler } from '../../server/community.js';

export function communityDatabase(state,getBaseDb) {
  let ready;
  const database=()=>ready||=(async()=>{
    const db=await getBaseDb();await db.exec('create role service_role bypassrls;grant usage on schema public to service_role;');
    for(const suffix of ['_member_access_and_availability.sql','_church_member_classification.sql','_church_public_intake.sql','_church_administration.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(name=>name.endsWith(suffix)),'utf8'));
    for(const event of state.churchEvents||[])await db.query('insert into louvesync_church_events(id,title,description,starts_at,ends_at,location,category,published) values($1,$2,$3,$4,$5,$6,$7,$8)',[event.id,event.title,event.description||'',event.starts_at,event.ends_at||null,event.location||'',event.category||'Culto',!!event.published]);
    return db;
  })();
  const result=work=>({abortSignal:async()=>{try{return {data:await work(),error:null};}catch(error){return {data:null,error:{code:error.code||'XX000',message:error.message}};}}});
  const sdk={
    rpc(name,args){return result(async()=>{
      const db=await database();let row;
      if(name==='louvesync_submit_prayer'){
        if(state.prayerFailure)throw new Error('Simulated unavailable service');
        row=await db.query('select public.louvesync_submit_prayer($1::jsonb,$2,$3) as result',[JSON.stringify(args.p_payload),args.p_ip_hash,args.p_member_id]);
      }else if(name==='louvesync_community_admin'||name==='louvesync_login')row=await db.query('select public.'+name+'($1::jsonb) as result',[JSON.stringify(args.p_payload)]);
      else throw new Error('Unexpected community RPC');
      return row.rows[0].result;
    });},
    from(table){
      if(!['louvesync_church_events','louvesync_prayer_requests'].includes(table))throw new Error('Unexpected community table');
      const filters=[],values=[];let columns,order='created_at',ascending=true,limit=100;
      const bind=value=>{values.push(value);return '$'+values.length;};
      const chain={select(value){columns=value;return chain;},eq(key,value){filters.push(key+'='+bind(value));return chain;},in(key,list){filters.push(key+' in('+list.map(bind).join(',')+')');return chain;},or(){const value=bind(new Date(state.activityNow).toISOString());filters.push('(starts_at>='+value+' or ends_at>='+value+')');return chain;},order(key,options={}){order=key;ascending=options.ascending!==false;return chain;},limit(value){limit=value;return chain;},abortSignal:async()=>{try{const db=await database();return {data:(await db.query('select '+columns+' from '+table+' where '+filters.join(' and ')+' order by '+order+(ascending?' asc':' desc')+' limit '+limit,values)).rows,error:null};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}}};
      return chain;
    }
  };
  return {ready:database,handler:createCommunityHandler({connect:()=>({db:sdk,auth:sdk,salt:'SYNTHETIC_COMMUNITY_SERVER_SECRET'}),now:()=>state.activityNow}),
    async syncMember(member){if(!ready)return;const db=await database();const row={...member,pin:member.pin||'TEST_PIN_'+member.id,access_type:member.access_type||'ministry',schedule_enabled:member.schedule_enabled!==false,unavailable_days:member.unavailable_days||[]};await db.query('insert into members(id,name,pin,role,instrument,status,is_admin,access_type,schedule_enabled,permissions,unavailable_days) select id,name,pin,role,instrument,status,is_admin,access_type,schedule_enabled,permissions,unavailable_days from jsonb_populate_record(null::members,$1::jsonb) on conflict(id) do update set name=excluded.name,pin=excluded.pin,role=excluded.role,instrument=excluded.instrument,status=excluded.status,is_admin=excluded.is_admin,access_type=excluded.access_type,schedule_enabled=excluded.schedule_enabled,permissions=excluded.permissions,unavailable_days=excluded.unavailable_days',[JSON.stringify(row)]);},
    async query(sql,params=[]){return (await database()).query(sql,params);}
  };
}
