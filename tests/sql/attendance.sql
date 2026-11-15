set role anon;
do $$
declare
  auth jsonb := '{"memberId":"admin","pin":"ADMIN_TEST_PIN"}';
  lead jsonb := '{"memberId":"leader","pin":"LEADER_TEST_PIN"}';
  body jsonb;
  result jsonb;
  roster jsonb;
begin
  begin perform public.louvesync_attendance('{"action":"get","eventId":"event","memberId":"member","pin":"MEMBER_TEST_PIN","is_admin":true}'); raise exception 'Member escalation allowed'; exception when insufficient_privilege then null; end;
  begin perform public.louvesync_attendance(auth||'{"action":"get","eventId":"event","pin":"WRONG"}'); raise exception 'Wrong PIN allowed'; exception when invalid_authorization_specification then null; end;
  begin perform public.louvesync_attendance('{"action":"get","eventId":"event","memberId":"inactive","pin":"INACTIVE_TEST_PIN"}'); raise exception 'Inactive leader allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.louvesync_attendance_sheets; raise exception 'Direct read allowed'; exception when insufficient_privilege then null; end;
  begin update public.louvesync_attendance_sheets set finalized=true; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.louvesync_attendance_revisions; raise exception 'Direct audit read allowed'; exception when insufficient_privilege then null; end;
  result:=public.louvesync_attendance(lead||'{"action":"get","eventId":"event"}');
  if jsonb_array_length(result->'sheet'->'roster')<>2 or result->'sheet'->>'version'<>'0' or (result->'sheet'->'roster'->0->>'status') is not null then raise exception 'Advance RSVP leaked into actual presence'; end if;
  result:=public.louvesync_attendance(auth||'{"action":"get","eventId":"future"}');
  if (result->>'canRecord')::boolean then raise exception 'Future attendance enabled'; end if;
  begin perform public.louvesync_attendance(auth||'{"action":"save","eventId":"future","version":0,"finalize":true,"entries":[{"memberId":"admin","status":"present","note":""}]}'); raise exception 'Future attendance saved'; exception when invalid_parameter_value then null; end;
  begin perform public.louvesync_attendance(auth||'{"action":"get","eventId":"missing"}'); raise exception 'Missing event allowed'; exception when no_data_found then null; end;
  result:=public.louvesync_attendance(auth||'{"action":"get","eventId":"empty"}');
  if jsonb_array_length(result->'sheet'->'roster')<>0 then raise exception 'Empty roster fabricated'; end if;

  body:='{"action":"save","eventId":"event","version":0,"finalize":false,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"member","status":null,"note":""}]}';
  result:=public.louvesync_attendance(lead||body||'{"name":"Forged actor","date":"2099-01-01"}');
  if result->'sheet'->>'version'<>'1' or result->'sheet'->'recordedBy'->>'name'<>'Leader fixture' or (result->'sheet'->>'finalized')::boolean then raise exception 'Partial record or attribution incorrect'; end if;
  begin perform public.louvesync_attendance(auth||body); raise exception 'Stale first write accepted'; exception when serialization_failure then null; end;
  begin perform public.louvesync_attendance(auth||body||'{"version":1,"finalize":true}'); raise exception 'Pending member silently absent'; exception when invalid_parameter_value then null; end;
  begin perform public.louvesync_attendance(auth||body||'{"version":1,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"admin","status":"absent","note":""}]}'); raise exception 'Duplicate member accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.louvesync_attendance(auth||body||'{"version":1,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"intruder","status":"absent","note":""}]}'); raise exception 'Unassigned member accepted'; exception when serialization_failure then null; end;
  begin perform public.louvesync_attendance(auth||body||'{"version":1,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"member","status":"excused","note":" "}]}'); raise exception 'Unexplained justified absence accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.louvesync_attendance(auth||body||'{"version":1,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"member","status":"invented","note":""}]}'); raise exception 'Invalid status accepted'; exception when invalid_parameter_value then null; end;
  body:=body||'{"version":1,"finalize":true,"entries":[{"memberId":"admin","status":"present","note":"Chegou no horário"},{"memberId":"member","status":"excused","note":"Motivo informado ao líder"}]}';
  result:=public.louvesync_attendance(auth||body);
  if result->'sheet'->>'version'<>'2' or not (result->'sheet'->>'finalized')::boolean or result->'sheet'->'recordedBy'->>'name'<>'Admin fixture' then raise exception 'Finalization failed'; end if;
  result:=public.louvesync_attendance(auth||jsonb_build_object('action','list','from',((clock_timestamp() at time zone 'America/Sao_Paulo')::date-7)::text,'to',((clock_timestamp() at time zone 'America/Sao_Paulo')::date)::text));
  if jsonb_array_length(result->'sheets')<>1 then raise exception 'History has incomplete or duplicate calls'; end if;
  begin perform public.louvesync_attendance(auth||'{"action":"list","from":"2020-01-01","to":"2025-01-01"}'); raise exception 'Unbounded history accepted'; exception when invalid_parameter_value then null; end;
end;
$$;
reset role;
do $$ begin
  if (select confirmed from public.event_members where event_id='event' and member_id='admin') is not true or (select confirmed from public.event_members where event_id='event' and member_id='member') is not false then raise exception 'RSVP was modified'; end if;
  if (select count(*) from public.louvesync_attendance_revisions where event_id='event')<>2 then raise exception 'Revision history lost'; end if;
end; $$;
-- Later roster edits and deletion must not erase the evidence of who was called.
delete from public.event_members where event_id='event';
delete from public.events where id='event';
delete from public.members where id='member';
set role anon;
do $$ declare result jsonb; begin
  result:=public.louvesync_attendance('{"action":"get","eventId":"event","memberId":"leader","pin":"LEADER_TEST_PIN"}');
  if jsonb_array_length(result->'sheet'->'roster')<>2 or result->'sheet'->'roster'->1->>'name'<>'Member fixture' then raise exception 'Historical roster lost'; end if;
  result:=public.louvesync_attendance('{"action":"save","eventId":"event","memberId":"leader","pin":"LEADER_TEST_PIN","version":2,"finalize":true,"entries":[{"memberId":"admin","status":"present","note":""},{"memberId":"member","status":"absent","note":"Registro corrigido"}]}');
  if result->'sheet'->>'version'<>'3' then raise exception 'Correction failed'; end if;
end; $$;
reset role;
