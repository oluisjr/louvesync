// Exercises the same RLS and notification triggers as PostgREST, using synthetic records.
export function mentionsDatabase(community,state) {
 let queue=Promise.resolve();
 const run=(actor,work)=>{
  const pending=queue.then(async()=>{
   await community.query('begin');await community.query('set local role anon');
   try{
    await community.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-louvesync-member':actor?.memberId,'x-louvesync-pin':actor?.pin})]);
    const result=await work();await community.query('commit');return result;
   }catch(error){await community.query('rollback');throw error;}
  });queue=pending.catch(()=>{});return pending;
 };
 const write=async(table,row)=>{
  const keys=Object.keys(row),values=keys.map(key=>row[key]);
  // Table/column names below are restricted to the fixture's known schema.
  if(!['events','announcements','announcement_comments'].includes(table)||keys.some(key=>!/^[a-z_]+$/.test(key)))throw new Error('Unexpected mention fixture query');
  const columns=keys.join(','),placeholders=keys.map((_,index)=>'$'+(index+1)).join(',');
  const update=keys.filter(key=>key!=='id').map(key=>key+'=excluded.'+key).join(',');
  return community.query('insert into '+table+'('+columns+') values('+placeholders+') on conflict(id) do update set '+update+' returning *',values);
 };
 return {
  async event(row,actor){await run(actor,()=>write('events',row));},
  async mural(query,actor){
   try{
    const data=await run(actor,async()=>{
     if(query.op==='insert')return (await write(query.table,query.data)).rows;
     if(query.op!=='select')throw new Error('Unsupported mention fixture mutation');
     const params=[],filters=Object.entries(query.filters).map(([key,value])=>{if(!/^[a-z_]+$/.test(key))throw new Error('Unexpected filter');params.push(value);return key+'=$'+params.length;});
     return (await community.query('select * from '+query.table+(filters.length?' where '+filters.join(' and '):'')+' order by created_at',params)).rows;
    });
    if(query.op==='insert')state[query.table==='announcements'?'posts':'comments']=(await community.query('select * from '+query.table+' order by created_at')).rows;
    return {data:query.single?data[0]||null:data,error:null};
   }catch(error){return {data:null,error:{code:error.code,message:error.message}};}
  },
  async notifications(payload){return run(payload,async()=>{const result=await community.query('select public.louvesync_notifications($1::jsonb) result',[JSON.stringify(payload)]);return result.rows[0].result;});}
 };
}
