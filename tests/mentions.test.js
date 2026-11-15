import test from 'node:test';
import assert from 'node:assert/strict';
import { insertMention,mentionQuery,mentionSuggestions,pendingMentionQuery,retainMentions } from '../src/lib/mentions.js';
import { notificationDestination } from '../src/lib/notifications-client.js';
const members=[{id:'junior',name:'Júnior',status:'ativo',access_type:'ministry',instrument:'Teclado / Vocal'},{id:'leader',name:'Líder Teste',status:'ativo',access_type:'ministry',is_admin:true},{id:'church',name:'Membro da igreja',status:'ativo',access_type:'church_member'},{id:'inactive',name:'Inativo',status:'inativo'}];
test('mention suggestions find accents and instruments, include ministry leaders, and exclude church-only and inactive profiles',()=>{
 assert.deepEqual(mentionSuggestions(members,'junior').map(person=>person.id),['junior']);assert.deepEqual(mentionSuggestions(members,'Teclado').map(person=>person.id),['junior']);assert.deepEqual(mentionSuggestions(members,'').map(person=>person.id),['junior','leader']);assert.deepEqual(mentionSuggestions(members,'',['junior']).map(person=>person.id),['leader']);
});
test('mention selection replaces only the current query and retains explicit member IDs until their token is removed',()=>{
 const text='Olá @ju, confira',range=mentionQuery(text,7);assert.deepEqual(range,{query:'ju',start:4,end:7});const next=insertMention(text,members[0],range);assert.equal(next.text,'Olá @Júnior , confira');assert.deepEqual(retainMentions(next.text,['junior'],members),['junior']);assert.deepEqual(retainMentions('Olá, confira',['junior'],members),[]);assert.equal(mentionQuery('email@example.org',17),null);
});
test('mention notifications preserve post and comment destinations and refuse external URLs',()=>{
 assert.deepEqual(notificationDestination({type:'mention',targetId:'post',url:'/?tab=mural&post=post&comment=comment'},'https://louvesync.vercel.app'),{tab:'mural',eventId:null,songId:null,postId:'post',commentId:'comment'});assert.equal(notificationDestination({url:'https://untrusted.example/?tab=mural'},'https://louvesync.vercel.app'),null);
});
test('typing after a chosen mention closes suggestions until a new query begins',()=>{
 assert.equal(pendingMentionQuery('@Júnior vamos ensaiar',20,['junior'],members),null);
 assert.equal(pendingMentionQuery('@Júnior @lid',12,['junior'],members)?.query,'lid');
});
