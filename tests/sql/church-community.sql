begin;
set role anon;
do $$ begin if exists(select 1 from events) then raise exception 'Visitor read internal events';end if;end; $$;
select set_config('request.headers','{"x-louvesync-member":"leader","x-louvesync-pin":"LEADER_FIXTURE_PIN"}',true);
update members set access_type='church_member',role='Membro',instrument='',schedule_enabled=false,is_admin=false where id='junior';
do $$ begin
 begin update members set is_admin=true where id='junior';raise exception 'Church member became admin';exception when check_violation then null;end;
 begin perform * from louvesync_church_events;raise exception 'Anonymous client read church drafts';exception when insufficient_privilege then null;end;
 begin perform * from louvesync_prayer_requests;raise exception 'Anonymous client read private prayers';exception when insufficient_privilege then null;end;
 begin perform public.louvesync_submit_prayer('{}',repeat('a',64),null);raise exception 'Direct anonymous intake bypassed server';exception when insufficient_privilege then null;end;
 begin perform public.louvesync_community_admin('{}');raise exception 'Direct anonymous admin API allowed';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.headers','{"x-louvesync-member":"junior","x-louvesync-pin":"JUNIOR_FIXTURE_PIN"}',true);
select set_config('louvesync.audit_actor','',true);
do $$ declare result jsonb; changed integer; begin
 result:=louvesync_login('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN"}');
 if result->>'ok'<>'true' or result->'member'->>'access_type'<>'church_member' then raise exception 'Church login classification lost';end if;
 if louvesync_private.request_actor() is not null then raise exception 'Church member retained ministry mutation identity';end if;
 if exists(select 1 from events) or exists(select 1 from songs) then raise exception 'Church member read ministry content';end if;
 update members set access_type='ministry',is_admin=true where id='junior';get diagnostics changed=row_count;if changed<>0 then raise exception 'Church member promoted self';end if;
 begin perform louvesync_changes('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN","action":"list"}');raise exception 'Church member entered ministry changes';exception when invalid_authorization_specification then null;end;
end; $$;
reset role;
set role service_role;
do $$ declare result jsonb; identifier uuid; begin
 result:=louvesync_submit_prayer('{"id":"10000000-0000-4000-8000-000000000001","name":"Visitante","message":"Pedido privado de teste para oração","anonymous":false,"visibility":"team","published":true}',repeat('a',64),null);
 if result->>'ok'<>'true' or result ? 'message' then raise exception 'Intake acknowledgement exposed body or failed';end if;
 result:=louvesync_submit_prayer('{"id":"10000000-0000-4000-8000-000000000001","name":"Visitante","message":"Pedido privado de teste para oração","anonymous":false,"visibility":"team"}',repeat('a',64),null);
 if (select count(*) from louvesync_prayer_requests)<>1 then raise exception 'Retry duplicated prayer';end if;
 begin perform louvesync_submit_prayer('{"id":"10000000-0000-4000-8000-000000000001","name":"Visitante","message":"Pedido privado de teste para oração","anonymous":false,"visibility":"community"}',repeat('a',64),null);raise exception 'Retry silently changed consent';exception when unique_violation then null;end;
 if exists(select 1 from louvesync_prayer_requests where published) then raise exception 'Author published without moderation';end if;
 for i in 2..5 loop
  identifier:=('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  perform louvesync_submit_prayer(jsonb_build_object('id',identifier,'message','Outro pedido de teste para oração','anonymous',true,'name','Nome que deve ser omitido','visibility','community'),repeat('a',64),null);
 end loop;
 if exists(select 1 from louvesync_prayer_requests where anonymous and display_name<>'') then raise exception 'Anonymous name persisted';end if;
 begin perform louvesync_submit_prayer('{"id":"10000000-0000-4000-8000-000000000006","message":"Sexto pedido de teste para oração","anonymous":false,"visibility":"team"}',repeat('a',64),null);raise exception 'Rate limit was bypassed';exception when program_limit_exceeded then null;end;
 begin perform louvesync_community_admin('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN","action":"admin_list","is_admin":true}');raise exception 'Church member viewed private inbox';exception when invalid_authorization_specification then null;end;
 begin perform louvesync_community_admin('{"memberId":"leader","pin":"WRONG","action":"admin_list"}');raise exception 'Wrong PIN entered private inbox';exception when invalid_authorization_specification then null;end;
 begin perform louvesync_community_admin('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN","action":"review_prayer","id":"10000000-0000-4000-8000-000000000001","status":"praying","published":true}');raise exception 'Leader overrode private consent';exception when insufficient_privilege then null;end;
 result:=louvesync_community_admin('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN","action":"review_prayer","id":"10000000-0000-4000-8000-000000000002","status":"praying","published":true}');
 if result->'prayer'->>'published'<>'true' or result->'prayer' ? 'ip_hash' then raise exception 'Moderation failed or leaked IP hash';end if;
 result:=louvesync_community_admin('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN","action":"save_event","event":{"id":"20000000-0000-4000-8000-000000000001","title":"Encontro da igreja","starts_at":"2026-12-01T21:00:00Z","category":"Encontro","published":true}}');
 if result->'event'->>'created_by'<>'leader' then raise exception 'Event lost author';end if;
 begin perform louvesync_community_admin('{"memberId":"leader","pin":"LEADER_FIXTURE_PIN","action":"save_event","event":{"id":"20000000-0000-4000-8000-000000000001","title":"Edição antiga","starts_at":"2026-12-01T21:00:00Z","category":"Encontro","published":false}}');raise exception 'Stale event overwrote newer version';exception when serialization_failure then null;end;
end; $$;
reset role;
do $$ begin
 if not exists(select 1 from louvesync_app_audit where entity_type='prayer_requests' and actor_id='leader') then raise exception 'Prayer review lost author';end if;
 if exists(select 1 from louvesync_app_audit where entity_type='prayer_requests' and (after_record::text like '%Pedido%' or after_record ? 'message' or before_record ? 'ip_hash')) then raise exception 'Private prayer leaked to ministry audit';end if;
end; $$;
rollback;
