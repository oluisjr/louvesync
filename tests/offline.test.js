import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, readJobs, updateJobs, acknowledge, migrateJobs, cacheWrite, cacheRead } from '../src/lib/offline-store.js';
import { rememberAttendance } from '../src/lib/attendance-cache.js';
import { offlineAction, apiScope } from '../src/lib/offline-actions.js';
import { connectionFailed, checkConnection } from '../src/lib/connectivity.js';
import { overlayWorkspace, overlayMural } from '../src/lib/offline-overlay.js';
import { rememberIdentity, unlockIdentity } from '../src/lib/offline-identity.js';
import { authenticatedFetch, setMutationActor } from '../src/lib/member-session.js';
import { assertUnchanged, songFingerprint } from '../src/lib/offline-conflicts.js';

class Storage {
  values=new Map();
  get length(){return this.values.size;}
  key(index){return [...this.values.keys()][index]??null;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){if(this.full)throw new Error('Quota exceeded');this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
function environment(t){
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
  globalThis.window={dispatchEvent(){},addEventListener(){},removeEventListener(){}};
  globalThis.localStorage=new Storage();
  t.after(()=>{Object.assign(globalThis,previous);setMutationActor(null);});
}
test('offline action is durable before acknowledgement and queue records contain no session PIN',async t=>{
  environment(t);connectionFailed();setMutationActor({memberId:'junior',pin:'private-session-pin'});
  let uploads=0;
  const result=await offlineAction('confirm',{eventId:'culto',memberId:'junior',confirmed:true},()=>uploads++,{pendingOffline:true});
  assert.equal(result.pendingOffline,true);assert.equal(uploads,0);
  assert.equal(readJobs()[0].actorId,'junior');assert.equal(readJobs()[0].data.confirmed,true);
  assert.equal([...localStorage.values.values()].join('').includes('private-session-pin'),false);
  assert.equal(JSON.parse(localStorage.getItem('ls_sync_queue')).length,0);
  // A fresh reader reconstructs jobs from the persisted per-record journal.
  assert.equal(readJobs().length,1);
});
test('a missing browser offline event still queues a failed network write, but permission errors never become offline successes',async t=>{
  environment(t);globalThis.fetch=async()=>Response.json({version:'test'});await checkConnection();
  const result=await offlineAction('save_song',{id:'one'},async()=>{throw new TypeError('Failed to fetch');},{pendingOffline:true},'a');
  assert.equal(result.pendingOffline,true);assert.equal(readJobs().length,1);
  acknowledge(readJobs()[0].id);await checkConnection();
  await assert.rejects(offlineAction('save_song',{id:'two'},async()=>{throw Object.assign(new Error('Forbidden'),{status:403});},{pendingOffline:true},'a'),/Forbidden/);
  assert.equal(readJobs().length,0);
});
test('storage failure is reported before accepting an offline edit',async t=>{
  environment(t);connectionFailed();localStorage.full=true;
  await assert.rejects(offlineAction('save_song',{title:'Texto ainda no formulário'},()=>{}, {},'a'),/espaço no aparelho/);
  assert.equal(readJobs().length,0);
});
test('a simultaneous append cannot be erased when another tab acknowledges its original snapshot',t=>{
  environment(t);const first=enqueue('save_song',{id:'a'},'leader');
  updateJobs(previous=>{enqueue('save_song',{id:'b'},'leader');return previous.filter(job=>job.id!==first.id);});
  assert.deepEqual(readJobs().map(job=>job.data.id),['b']);
});
test('legacy tasks are assigned only when their original author can be established',t=>{
  environment(t);localStorage.setItem('ls_sync_queue',JSON.stringify([{type:'create_post',data:{created_by:'a'}},{type:'create_event',data:[{id:'unknown'}]},{type:'confirm',data:{memberId:'b'}}]));
  migrateJobs('a');assert.equal(readJobs()[0].actorId,'a');assert.equal(readJobs()[1].actorId,undefined);assert.equal(readJobs()[2].actorId,undefined);
  migrateJobs('b');assert.equal(readJobs()[2].actorId,'b');assert.equal(readJobs()[1].actorId,undefined);
});
test('a remote refresh preserves queued songs, events and the latest response to a schedule',()=>{
  const jobs=[{type:'save_song',data:{id:'new',title:'Música local'}},{type:'create_event',data:[{id:'event',label:'Edição offline'}]},{type:'confirm',data:{eventId:'event',memberId:'a',confirmed:false}}];
  const result=overlayWorkspace([],[{id:'event',label:'Antigo',confirmations:{b:true}}],jobs);
  assert.equal(result.songs[0].title,'Música local');assert.equal(result.events[0].label,'Edição offline');assert.equal(result.events[0].confirmations.a,false);assert.equal(result.events[0].confirmations.b,true);
});
test('mural refresh overlays pending comments, reaction removals and saved notices',()=>{
  const row={post_id:'p',member_id:'a',emoji:'👍'};
  const result=overlayMural({posts:[],comments:[],reactions:[row],saves:[]},[{type:'create_comment',data:{id:'c',post_id:'p',text:'Local'}},{type:'toggle_reaction',data:{action:'delete',row}},{type:'toggle_save',data:{action:'insert',row:{post_id:'p',member_id:'a'}}}]);
  assert.equal(result.comments[0].text,'Local');assert.equal(result.reactions.length,0);assert.deepEqual(result.saves,['p']);
});
test('offline unlock requires a previous online identity and verifies a salted hash rather than a cached plaintext PIN',async t=>{
  environment(t);const member={id:'a',name:'Junior',pin:'should-be-stripped',is_admin:false};
  await rememberIdentity(member,'correct-secret-PIN');
  const stored=[...localStorage.values.values()].join('');assert.equal(stored.includes('correct-secret-PIN'),false);assert.equal(stored.includes('should-be-stripped'),false);
  assert.equal((await unlockIdentity('a','correct-secret-PIN')).id,'a');
  await assert.rejects(unlockIdentity('a','wrong'),/PIN incorreto/);await assert.rejects(unlockIdentity('b','correct-secret-PIN'),/primeiro acesso/);
});
test('a queued uploader pins its original credentials even after the visible account changes',async t=>{
  environment(t);const received=[];
  const send=authenticatedFetch('https://project.supabase.co',async(_url,options)=>{received.push(Object.fromEntries(options.headers));return Response.json({ok:true});},()=>({memberId:'a',pin:'pin-a'}));
  setMutationActor({memberId:'b',pin:'pin-b'});await send('https://project.supabase.co/rest/v1/songs',{method:'POST'});
  assert.equal(received[0]['x-louvesync-member'],'a');assert.equal(received[0]['x-louvesync-pin'],'pin-a');
});
test('conflicting offline edits are kept for review, while an already committed retry is accepted',()=>{
  const original={id:'s',title:'Original'},desired={id:'s',title:'Local'},other={id:'s',title:'Outro aparelho'};
  assert.throws(()=>assertUnchanged(other,original,desired,songFingerprint),error=>error.status===409);
  assert.doesNotThrow(()=>assertUnchanged(desired,original,desired,songFingerprint));
});
test('cached API scopes do not mix prayer or attendance records from different accounts',t=>{
  environment(t);cacheWrite('attendance:a',{private:'a'});cacheWrite('attendance:b',{private:'b'});
  const one=enqueue('attendance',{eventId:'e'},'a'),two=enqueue('community',{id:'prayer'},'b');acknowledge(one.id);
  assert.deepEqual(readJobs().map(job=>job.id),[two.id]);
});


test('saving attendance online updates the offline call and its cached report without touching another account',t=>{
  environment(t);const range={action:'list',from:'2026-11-01',to:'2026-11-30'};
  cacheWrite(apiScope('attendance','leader',range),{ok:true,sheets:[]});cacheWrite(apiScope('attendance','other',range),{ok:true,sheets:[]});
  const result={ok:true,today:'2026-11-16',serverTime:'2026-11-16T20:00:00Z',canRecord:true,sheet:{eventId:'culto',date:'2026-11-16',version:1,finalized:false,roster:[{memberId:'junior',status:'present',note:''}]}};
  rememberAttendance('leader',result);
  assert.deepEqual(cacheRead(apiScope('attendance','leader',{action:'get',eventId:'culto'})),result);
  assert.equal(cacheRead(apiScope('attendance','leader',range)).sheets[0].roster[0].status,'present');assert.deepEqual(cacheRead(apiScope('attendance','other',range)).sheets,[]);
  const stale=rememberAttendance('leader',{...result,sheet:{...result.sheet,version:0,roster:[]}});assert.equal(stale.sheet.version,1);assert.equal(stale.sheet.roster.length,1);
});

test('pending attendance remains readable until automatic upload replaces it with the confirmed version',t=>{
  environment(t);const scope=apiScope('attendance','leader',{action:'get',eventId:'culto'});
  enqueue('attendance',{eventId:'culto',entries:[{memberId:'junior',status:'present',note:''}]},'leader');
  const pending={ok:true,pendingOffline:true,sheet:{eventId:'culto',date:'2026-11-16',version:0,finalized:false,roster:[{memberId:'junior',status:'present',note:''}]}};rememberAttendance('leader',pending);
  const old={...pending,pendingOffline:undefined,sheet:{...pending.sheet,roster:[{memberId:'junior',status:null,note:''}]}};
  assert.equal(rememberAttendance('leader',old).sheet.roster[0].status,'present');
  rememberAttendance('leader',{...pending,pendingOffline:undefined,sheet:{...pending.sheet,version:1,finalized:true}});
  assert.equal(cacheRead(scope).sheet.finalized,true);assert.equal(cacheRead(scope).pendingOffline,undefined);
});
