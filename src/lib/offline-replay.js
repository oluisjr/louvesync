import { updateEventItems, updateSetlistConfirmation, upsertEventRecord } from './event-storage.js';
import { saveSongRecord } from './song-storage.js';
import { saveMemberRecord } from './member-storage.js';
import { publishAnnouncement } from './announcement-storage.js';
import { remapAnnouncementTask } from './announcement-queue.js';
import { encodeSequence, decodeSequence, eventPayload, normalizeEvent } from './domain.js';
import { withoutRehearsalSongs } from './rehearsal-events.js';
import { communityRequest } from './community-client.js';
import { attendanceRequest } from './attendance-client.js';
import { changesRequest } from './change-requests.js';
import { deleteAdminContent } from './admin-delete-client.js';
import { notificationRequest } from './notifications-client.js';
import { updateJobs, cacheWrite, cacheRead } from './offline-store.js';
import { forgetIdentity } from './offline-identity.js';
import { maestroRequest } from './maestro-client.js';
import { readOfflineBlob, removeOfflineBlob } from './offline-blobs.js';
import { assertUnchanged, eventFingerprint, songFingerprint, cleanSong } from './offline-conflicts.js';
import { searchSongCandidates, fetchCifraClubContent } from './scraper.js';
import { rememberAttendance } from './attendance-cache.js';

async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data; }
async function uniqueInsert(client, table, row, identity) {
  try { return await checked(client.from(table).insert(row)); }
  catch (error) {
    if (error.code !== '23505') throw error;
    const saved = await checked(client.from(table).select('*').match(identity).maybeSingle());
    if (!saved || Object.entries(row).some(([key, value]) => key !== 'created_at' && JSON.stringify(saved[key]) !== JSON.stringify(value))) throw error;
    return saved;
  }
}
export async function replayJob(job, { client, actor, connection, profile, active = () => true }) {
  const data = job.data;
  if (job.actorId !== (actor?.memberId || 'visitor')) throw new Error('Esta alteração pertence a outra conta.');
  if (!active()) throw new Error('A sessão mudou. A alteração continua guardada.');
  if (job.type === 'community') return communityRequest(data, { credentials: actor, offlineBypass: true });
  if (!actor) throw new Error('Entre na conta que criou esta alteração para sincronizar.');
  if(job.type==='song_search')return searchSongCandidates(data.title,data.artist,{offlineBypass:true});
  if(job.type==='song_lookup')return fetchCifraClubContent(data.url,{offlineBypass:true});
  if(job.type==='audio'){
    const existing=await checked(client.from('rehearsal_takes').select('*').eq('id',data.take.id).maybeSingle());
    if(existing){
      if(existing.event_id!==data.take.event_id||existing.name!==data.take.name||!existing.url?.endsWith(data.filename))throw Object.assign(new Error('A gravação existente é diferente do áudio local. Revise o envio.'),{status:409});
      await removeOfflineBlob(data.blobKey);return existing;
    }
    const blob=await readOfflineBlob(data.blobKey);
    if(!blob)throw new Error('O áudio local não foi encontrado. O envio foi mantido para recuperação.');
    const {error}=await client.storage.from('rehearsal-audio').upload(data.filename,blob,{upsert:false});
    if(error&&String(error.statusCode)!=='409')throw error;
    const {data:{publicUrl}}=client.storage.from('rehearsal-audio').getPublicUrl(data.filename);
    await uniqueInsert(client,'rehearsal_takes',{...data.take,url:publicUrl},{id:data.take.id});
    await removeOfflineBlob(data.blobKey);return;
  }
  if (job.type === 'maestro') {
    const reply=await maestroRequest(actor,data.messages,{purpose:data.purpose,maxTokens:data.maxTokens,offlineBypass:true});
    cacheWrite(`maestro-result:${actor.memberId}:${data.requestId}`,{reply,purpose:data.purpose,requestId:data.requestId});
    cacheWrite(`maestro-reply:${actor.memberId}:${JSON.stringify({messages:data.messages,purpose:data.purpose,maxTokens:data.maxTokens})}`,{reply});
    return reply;
  }
  if (job.type === 'changes') return changesRequest(actor, data, { connection, offlineBypass: true });
  if (job.type === 'notification') return notificationRequest(actor, data, { offlineBypass: true });
  if (job.type === 'delete_content') return deleteAdminContent(data.targetType, data.targetId, actor, fetch, true);
  if (job.type === 'attendance') {
    const current = await attendanceRequest(actor, { action: 'get', eventId: data.eventId }, { connection, offlineBypass: true });
    const chainKey='attendance-chain:'+actor.memberId+':'+data.eventId,chain=cacheRead(chainKey);
    const ownPrevious=chain&&chain.from===data.version&&chain.to===current.sheet.version&&Date.parse(job.createdAt)<=chain.through;
    if (current.sheet.version !== data.version&&!ownPrevious) {
      const same = data.entries.every(entry => current.sheet.roster.some(person => person.memberId === entry.memberId && person.status === entry.status && (person.note || '') === (entry.note || '')));
      if (same && (!data.finalize || current.sheet.finalized)){cacheWrite(chainKey,{from:data.version,to:current.sheet.version,through:Date.now()});return rememberAttendance(actor.memberId,current);}
      const error = new Error('A chamada mudou no banco. Suas marcações locais foram preservadas; revise antes de reenviar.'); error.status = 409; throw error;
    }
    const result = await attendanceRequest(actor, {...data,version:current.sheet.version}, { connection, offlineBypass: true });
    cacheWrite(chainKey,{from:data.version,to:result.sheet.version,through:Date.now()});
    return rememberAttendance(actor.memberId,result);
  }
  if (job.type === 'confirm') {
    if (data.memberId !== actor.memberId) throw new Error('A resposta à escala pertence a outro integrante.');
    const rows = await checked(client.from('event_members').update({ confirmed: data.confirmed }).eq('event_id', data.eventId).eq('member_id', actor.memberId).select('member_id'));
    if (!rows?.length) throw Object.assign(new Error('Você não está mais escalado neste evento.'), { status: 409 });
  } else if (job.type === 'create_event') {
    if (!profile?.is_admin) throw Object.assign(new Error('Seu acesso de administrador mudou. Revise os eventos pendentes.'), { status: 403 });
    for (const value of Array.isArray(data) ? data : [data]) {
      if (!active()) throw new Error('A sessão mudou.');
      const event = withoutRehearsalSongs(value);
      if(job.base){const row=await checked(client.from('events').select('*,event_songs(*),event_members(*)').eq('id',event.id).maybeSingle());assertUnchanged(row?normalizeEvent(row):null,job.base[event.id]||null,event,eventFingerprint);}
      await upsertEventRecord(client, eventPayload(event));
      await updateEventItems(client, event.id, event.items || [], event.members || [], event);
    }
  } else if (job.type === 'save_song') {
    if(Object.hasOwn(job,'base')){const row=await checked(client.from('songs').select('*').eq('id',data.id).maybeSingle());assertUnchanged(row,job.base,data,songFingerprint);}
    return saveSongRecord(client, { ...cleanSong(data), created_by: actor.memberId });
  }
  else if (job.type === 'save_member') { const saved = await saveMemberRecord(client, data); if (data.pin) forgetIdentity(data.id); return saved; }
  else if (job.type === 'delete_member') { await checked(client.from('members').delete().eq('id', data.id)); forgetIdentity(data.id); }
  else if (job.type === 'create_post') {
    const saved = await publishAnnouncement(client, data);
    if (String(saved.id) !== String(data.id)) updateJobs(jobs => jobs.map(task => task.actorId === job.actorId ? remapAnnouncementTask(task, data.id, saved.id) : task));
    return saved;
  } else if (job.type === 'create_comment') return uniqueInsert(client, 'announcement_comments', data, { id: data.id });
  else if (job.type === 'toggle_reaction' || job.type === 'toggle_save') {
    const table = job.type === 'toggle_save' ? 'announcement_saves' : 'announcement_reactions';
    if (data.action === 'delete') await checked(client.from(table).delete().match(data.row));
    else {
      const existing = await checked(client.from(table).select('*').match(data.row).maybeSingle());
      if (!existing) await uniqueInsert(client, table, data.row, data.row);
    }
  } else if (job.type === 'save_rehearsal_note') await checked(client.from('rehearsal_notes').upsert(data));
  else if (job.type === 'rehearsal_session') await checked(client.from('rehearsal_sessions').upsert(data));
  else if (job.type === 'equipment') await checked(client.from('equipment').upsert(data));
  else if (job.type === 'delete_equipment' || job.type === 'delete_take') await checked(client.from(job.type === 'delete_take' ? 'rehearsal_takes' : 'equipment').delete().eq('id', data.id));
  else if (job.type === 'singer') await checked(client.from('event_songs').update({ singer_member_id: data.memberId }).eq('event_id', data.eventId).eq('song_id', data.songId));
  else if (job.type === 'vocal_key') {
    const saved = await checked(client.from('songs').select('vocal_keys').eq('id', data.songId).single());
    await checked(client.from('songs').update({ vocal_keys: { ...saved.vocal_keys, [data.singerId]: data.key } }).eq('id', data.songId));
  } else if (job.type === 'sequence' || job.type === 'song_options') {
    const previous = await checked(client.from('event_songs').select('sequence').eq('event_id', data.eventId).eq('song_id', data.songId).maybeSingle());
    const sequence = decodeSequence(previous?.sequence);
    await checked(client.from('event_songs').update({ sequence: encodeSequence(data.text ?? sequence.text, data.key === undefined ? sequence.key : data.key) }).eq('event_id', data.eventId).eq('song_id', data.songId));
    if (data.bpm || data.time_signature) await checked(client.from('songs').update({ ...(data.bpm ? { bpm: Number(data.bpm) } : {}), ...(data.time_signature ? { time_signature: data.time_signature } : {}) }).eq('id', data.songId));
    if (data.updateOfficial && data.singerId) await replayJob({ ...job, type: 'vocal_key', data }, { client, actor, connection, profile, active });
  } else if (job.type === 'setlist') return updateSetlistConfirmation(client, data.eventId, data.snapshot, actor.memberId, data.confirmed);
  else if(job.type==='featured_song'){
    await checked(client.from('songs').update({featured_week:false,featured_note:null}).eq('featured_week',true));
    if(data.id)await checked(client.from('songs').update({featured_week:true,featured_note:data.note}).eq('id',data.id));
  }
  else if(job.type==='reject_delete'&&['songs','events'].includes(data.table))await checked(client.from(data.table).update({delete_requested_by:null}).eq('id',data.id));
  else throw new Error('Operação pendente não reconhecida. O registro foi preservado para recuperação.');
}
