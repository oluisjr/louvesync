begin;
insert into members(id,name,pin,role,instrument,status,is_admin,access_type,schedule_enabled) values('church','Membro da igreja','CHURCH_TEST_PIN','Membro','','ativo',false,'church_member',false),('inactive','Inativo','INACTIVE_TEST_PIN','Vocal','Vocal','inativo',false,'ministry',true);
set role anon;
select set_config('request.headers','{"x-louvesync-member":"leader","x-louvesync-pin":"LEADER_FIXTURE_PIN"}',true);
update events set notes='@Júnior e @Líder Teste, confiram o repertório.',mention_member_ids=array['junior','leader'] where id='event';
reset role;
do $$ begin
 if (select count(*) from louvesync_notifications where kind='mention' and target_id='event')<>2 then raise exception 'Mention did not include singer and leader';end if;
end; $$;
set role anon;
update events set notes='Mensagem revisada para @Júnior.',mention_member_ids=array['junior','leader'] where id='event';
select public.louvesync_notifications(jsonb_build_object('memberId','junior','pin','JUNIOR_FIXTURE_PIN','action','mark_read','ids',(select jsonb_agg(item->>'id') from jsonb_array_elements(public.louvesync_notifications('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN","action":"list"}')->'items') item where item->>'type'='mention')));
update events set mention_member_ids='{}' where id='event';
update events set mention_member_ids=array['junior','junior'] where id='event';
reset role;
do $$ begin
 if (select count(*) from louvesync_notifications where kind='mention' and target_id='event')<>2 then raise exception 'Repeated save or duplicate IDs duplicated notification';end if;
 if not exists(select 1 from louvesync_notifications where kind='mention' and member_id='junior' and read_at is null and url='/?tab=escala&event=event') then raise exception 'Retag did not reopen the existing inbox entry';end if;
end; $$;
set role anon;
do $$ begin
 begin update events set mention_member_ids=array['church'] where id='event';raise exception 'Church member was tagged as ministry';exception when check_violation then null;end;
 begin update events set mention_member_ids=array['inactive'] where id='event';raise exception 'Inactive member was tagged';exception when check_violation then null;end;
 begin update events set mention_member_ids=array['missing'] where id='event';raise exception 'Missing member was tagged';exception when check_violation then null;end;
end; $$;
insert into announcements(id,title,content,created_by,mention_member_ids) values('mention-post','Repertório da semana','@Júnior e @Líder Teste, acompanhem o aviso.','leader',array['junior','leader']);
select set_config('request.headers','{"x-louvesync-member":"junior","x-louvesync-pin":"JUNIOR_FIXTURE_PIN"}',true);
insert into announcement_comments(id,post_id,member_id,text,mention_member_ids) values('mention-comment','mention-post','junior','@Outra vocal, pode conferir?',array['other']);
do $$ declare inbox jsonb; begin
 inbox:=louvesync_notifications('{"memberId":"junior","pin":"JUNIOR_FIXTURE_PIN","action":"list"}');
 if not exists(select 1 from jsonb_array_elements(inbox->'items') item where item->>'type'='mention' and item->>'targetId'='mention-post') then raise exception 'Durable inbox omitted mural mention';end if;
 if exists(select 1 from jsonb_array_elements(inbox->'items') item where item->>'body' like '%JUNIOR_FIXTURE_PIN%') then raise exception 'Inbox exposed credentials';end if;
 begin perform louvesync_notifications('{"memberId":"other","pin":"JUNIOR_FIXTURE_PIN","action":"list"}');raise exception 'Inbox accepted another member PIN';exception when invalid_authorization_specification then null;end;
 begin insert into announcement_comments(id,post_id,member_id,text,mention_member_ids) values('orphan','missing-post','junior','Marcação inválida',array['other']);raise exception 'Missing post produced a mention';exception when foreign_key_violation then null;end;
end; $$;
select set_config('request.headers','{"x-louvesync-member":"other","x-louvesync-pin":"OTHER_FIXTURE_PIN"}',true);
do $$ declare inbox jsonb; begin
 inbox:=louvesync_notifications('{"memberId":"other","pin":"OTHER_FIXTURE_PIN","action":"list"}');
 if not exists(select 1 from jsonb_array_elements(inbox->'items') item where item->>'type'='mention' and item->>'url'='/?tab=mural&post=mention-post&comment=mention-comment') then raise exception 'Comment mention lost its exact destination';end if;
end; $$;
reset role;
do $$ begin
 if exists(select 1 from louvesync_notifications where kind='mention' and member_id in ('church','inactive','missing')) then raise exception 'Ineligible recipient received a mention';end if;
 if not exists(select 1 from louvesync_app_audit where entity_type='events' and 'mention_member_ids'=any(changed_fields) and actor_id='leader') then raise exception 'Mention edit lost audit author';end if;
end; $$;
rollback;
