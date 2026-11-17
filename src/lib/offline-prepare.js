import { supabase, publicSupabaseConfig } from './supabase.js';
import { attendanceRequest } from './attendance-client.js';
import { changesRequest, canManageMinistry } from './change-requests.js';
import { communityRequest } from './community-client.js';
import { activityRequest } from './activity-client.js';
import { offlineRead, apiScope } from './offline-actions.js';
import { localDate } from './domain.js';
import { cacheWrite } from './offline-store.js';
import { readOfflineBlob, saveOfflineBlob } from './offline-blobs.js';

export async function prepareOfflineWorkspace(actor, profile, events) {
  if(!supabase||!actor)return;
  const jobs=['equipment','announcements','announcement_comments','announcement_reactions','rehearsal_notes','rehearsal_takes','rehearsal_sessions'].map(async table=>{
    const result=await supabase.from(table).select('*');
    if(!result.error&&Array.isArray(result.data)){
      cacheWrite(table+':'+actor.memberId,result.data);
      if(table==='rehearsal_notes')for(const row of result.data)cacheWrite('note:'+actor.memberId+':'+row.song_id,row.note_text||'');
      if(table==='rehearsal_takes')for(const take of result.data){
        const key='remote:'+actor.memberId+':'+take.id;
        if(take.url?.startsWith(publicSupabaseConfig?.url+'/storage/v1/object/public/rehearsal-audio/'))try{if(!await readOfflineBlob(key)){const response=await fetch(take.url);if(response.ok)await saveOfflineBlob(key,await response.blob());}}catch{/* Existing recordings remain online when storage is full. */}
      }
    }
    return result;
  });
  jobs.push(supabase.from('announcements').select('*').order('created_at',{ascending:false}),supabase.from('announcement_comments').select('*').order('created_at',{ascending:true}),supabase.from('announcement_saves').select('post_id').eq('member_id',actor.memberId));
  const options={connection:publicSupabaseConfig};
  jobs.push(communityRequest({action:'public'}));
  const nearby=events.filter(event=>Math.abs(Date.parse(event.date+'T12:00:00')-Date.now())<8*86400000);
  for(const status of ['all','pending'])jobs.push(changesRequest(actor,{action:'list',status},options));
  for(const event of nearby)for(const status of ['all','pending'])jobs.push(changesRequest(actor,{action:'list',eventId:event.id,status},options));
  if(canManageMinistry(profile)){
    const range={action:'list',from:localDate().slice(0,8)+'01',to:localDate()};
    jobs.push(attendanceRequest(actor,range,options),changesRequest(actor,{action:'audit'},options));
    for(const event of nearby)jobs.push(attendanceRequest(actor,{action:'get',eventId:event.id},options));
    for(const payload of [{action:'online'},{action:'summary'}])jobs.push(offlineRead(apiScope('activity',actor.memberId,payload),()=>activityRequest(actor,payload,options)));
  }
  if(profile.is_admin)jobs.push(communityRequest({action:'admin_list'},{credentials:actor}));
  await Promise.allSettled(jobs);
  if(globalThis.navigator?.storage?.persist)void navigator.storage.persist().catch(()=>{});
}
