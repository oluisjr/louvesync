begin;
insert into events(id,date,time,type,label) values('sunday','2026-11-22','18:00','culto','Domingo'),('monday','2026-11-23','19:00','ensaio','Segunda');
set role anon;
select set_config('request.headers','{"x-louvesync-member":"leader","x-louvesync-pin":"LEADER_FIXTURE_PIN"}',true);
update members set permissions=array['home','escala','repertorio'],unavailable_days=array[0,6]::smallint[] where id='junior';
update members set schedule_enabled=false where id='other';
do $$ declare result jsonb; begin
  result:=public.louvesync_member_settings('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN"}');
  if jsonb_array_length(result->'members')<>3 then raise exception 'Leader cannot read all settings'; end if;
  if not exists(select 1 from jsonb_array_elements(result->'members') m where m->>'id'='junior' and m->'permissions'='["home","escala","repertorio"]' and m->'unavailable_days'='[0,6]') then raise exception 'Member settings did not persist'; end if;
  begin perform permissions from members limit 1; raise exception 'Settings exposed in public member list'; exception when insufficient_privilege then null; end;
  begin update members set unavailable_days=array[7]::smallint[] where id='junior'; raise exception 'Invalid weekday stored'; exception when check_violation then null; end;
  begin update members set permissions=array['root'] where id='junior'; raise exception 'Invalid screen stored'; exception when check_violation then null; end;
end; $$;
select set_config('louvesync.audit_actor','',true);
select set_config('request.headers','{"x-louvesync-member":"junior","x-louvesync-pin":"JUNIOR_FIXTURE_PIN"}',true);
do $$ declare result jsonb; changed integer; begin
  result:=public.louvesync_member_settings('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN","is_admin":true}');
  if jsonb_array_length(result->'members')<>1 or result->'members'->0->>'id'<>'junior' then raise exception 'Member read another member settings'; end if;
  if result::text like '%FIXTURE_PIN%' then raise exception 'Settings exposed a PIN'; end if;
  update members set permissions=null,unavailable_days='{}',is_admin=true where id='junior';get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Member changed own access or availability'; end if;
  begin perform public.louvesync_member_settings('{"memberId":"leader","pin":"WRONG"}');raise exception 'Invalid actor accepted';exception when invalid_authorization_specification then null;end;
end; $$;
select set_config('louvesync.audit_actor','',true);
select set_config('request.headers','{"x-louvesync-member":"leader","x-louvesync-pin":"LEADER_FIXTURE_PIN"}',true);
do $$ begin
  begin insert into event_members(event_id,member_id) values('sunday','junior');raise exception 'Unavailable vocalist assigned on Sunday';exception when check_violation then null;end;
  begin insert into event_members(event_id,member_id) values('monday','other');raise exception 'Schedule-disabled member assigned';exception when check_violation then null;end;
end; $$;
insert into event_members(event_id,member_id) values('monday','junior');
-- Instruments are checked by the same rule as vocals.
update members set instrument='Baixo' where id='junior';
do $$ begin
  begin insert into event_members(event_id,member_id) values('sunday','junior');raise exception 'Unavailable instrumentalist assigned';exception when check_violation then null;end;
end; $$;
select set_config('louvesync.audit_actor','',true);
select set_config('request.headers','{"x-louvesync-member":"junior","x-louvesync-pin":"JUNIOR_FIXTURE_PIN"}',true);
update event_members set confirmed=true where event_id='event' and member_id='junior';
do $$ declare result jsonb; begin
  if not exists(select 1 from event_members where event_id='event' and member_id='junior' and confirmed=true) then raise exception 'Old assignment or RSVP was erased'; end if;
  result:=public.louvesync_login('{"memberId":"other","pin":"OTHER_FIXTURE_PIN"}');
  if result->>'ok'<>'true' then raise exception 'Disabling scheduling disabled app login'; end if;
  result:=public.louvesync_changes('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN","action":"audit"}');
  if not exists(select 1 from jsonb_array_elements(result->'entries') e where e->>'entity_type'='members' and e->>'actor_id'='leader' and e->'changed_fields' ? 'unavailable_days') then raise exception 'Settings changes lost audit author'; end if;
end; $$;
reset role;
rollback;
