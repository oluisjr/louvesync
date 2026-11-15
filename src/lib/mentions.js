export const mentionLimit=20;
export function mentionableMembers(members) {
 return members.filter(member=>member.access_type!=='church_member'&&['ativo','ativa','active'].includes(String(member.status||'ativo').trim().toLowerCase()));
}
const folded=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export function mentionQuery(text,caret) {
 const match=String(text||'').slice(0,caret).match(/(?:^|\s)@([^@\n]{0,60})$/);
 return match?{query:match[1],start:caret-match[1].length-1,end:caret}:null;
}
export function pendingMentionQuery(text,caret,ids,members) {
 const range=mentionQuery(text,caret);
 if(range&&ids.some(id=>{const name=members.find(member=>member.id===id)?.name;return name&&(range.query===name||range.query.startsWith(name+' '));}))return null;
 return range;
}
export function mentionSuggestions(members,query,selected=[]) {
 const needle=folded(query);return mentionableMembers(members).filter(member=>!selected.includes(member.id)&&folded(member.name+' '+(member.instrument||'')).includes(needle)).slice(0,8);
}
export function retainMentions(text,ids,members) {
 return [...new Set(ids)].filter(id=>{const member=members.find(person=>person.id===id);return !member||text.includes('@'+member.name);}).slice(0,mentionLimit);
}
export function insertMention(text,member,range) {
 const prefix=range?text.slice(0,range.start):text+(text&&!/\s$/.test(text)?' ':'');const suffix=range?text.slice(range.end):'';
 const token='@'+member.name+' ';return {text:prefix+token+suffix,caret:prefix.length+token.length};
}
