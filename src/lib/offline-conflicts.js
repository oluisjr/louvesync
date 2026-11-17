import { eventPayload } from './domain.js';
const fields=['id','title','artist','cat','key','bpm','time_signature','tags','yturl','media_url','lyrics','vocal_keys'];
export const songFingerprint=song=>JSON.stringify(fields.map(field=>song?.[field]??null));
export function eventFingerprint(event){
  if(!event)return null;
  const base=eventPayload(event);
  return JSON.stringify([['id','date','time','type','label','theme','notes','mention_member_ids'].map(key=>base[key]??null),(event.members||[]).slice().sort(),(event.items||[]).map(item=>[item.type||'song',item.song_id||null,item.text||'',item.singer_id||null]),event.sequenceBySong||{},event.keyBySong||{},event.requested_songs||null,event.santa_ceia_song||null]);
}
export function assertUnchanged(current,original,desired,fingerprint){
  if(fingerprint(current)!==fingerprint(original)&&fingerprint(current)!==fingerprint(desired))throw Object.assign(new Error('Este registro mudou em outro aparelho. A alteração local foi preservada para revisão.'),{status:409});
}
export const cleanSong=song=>Object.fromEntries(Object.entries(song).filter(([key])=>!key.startsWith('_')));
