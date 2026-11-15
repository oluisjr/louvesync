import { memberColumns } from './member-session.js';

// ON CONFLICT would require SELECT on excluded.pin. Keep PIN writes separate
// from reads so account administration cannot reveal existing credentials.
export async function saveMemberRecord(client, member) {
  const { data: existing, error: readError } = await client.from('members').select('id').eq('id', member.id).maybeSingle();
  if (readError) throw readError;
  const mutation = existing ? client.from('members').update(member).eq('id', member.id) : client.from('members').insert(member);
  const { data, error } = await mutation.select(memberColumns).single();
  if (error) throw error;
  if (!data?.id) throw new Error('O servidor não confirmou o cadastro.');
  return data;
}
