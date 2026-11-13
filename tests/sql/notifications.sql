-- Disposable PostgreSQL only. No connection to production.
create role anon;
create role authenticated;
create role service_role;
create table public.members(id text primary key,pin text,name text,role text,is_admin boolean,status text);
create table public.events(id text primary key,label text,date date,time time,type text,theme text);
create table public.songs(id text primary key,title text,created_by text);
create table public.event_songs(id bigint generated always as identity primary key,event_id text references public.events(id),song_id text references public.songs(id),order_index integer,item_type text default 'song',text text);
create table public.event_members(event_id text references public.events(id),member_id text references public.members(id),confirmed boolean,primary key(event_id,member_id));
insert into public.members values
 ('admin','ADMIN_TEST','Admin','Administrador',true,'ativo'),
 ('leader','LEADER_TEST','Líder','Líder de Louvor',false,'ativo'),
 ('vocal','VOCAL_TEST','Vocal','Vocal',false,'ativo'),
 ('other','OTHER_TEST','Outro','Músico',false,'ativo'),
 ('removed','REMOVED_TEST','Removido','Músico',false,'ativo'),
 ('inactive','INACTIVE_TEST','Inativo','Músico',false,'inativo');
insert into public.events values('event-1','Culto','2026-11-15','18:00','culto',null);
insert into public.songs values('old-song','Antiga','admin');
insert into public.event_songs(event_id,song_id,order_index) values('event-1','old-song',1);
insert into public.event_members values('event-1','vocal',null),('event-1','admin',null);
\i /app/migration.sql
\i /app/migration.sql
set role anon;
do $$ begin
 begin perform public.louvesync_notifications('{"action":"list","memberId":"admin","pin":"VOCAL_TEST"}');raise exception 'Wrong PIN accepted';exception when invalid_authorization_specification then null;end;
 begin perform public.louvesync_notification_worker('{"action":"drain"}');raise exception 'Worker exposed';exception when insufficient_privilege then null;end;
 begin perform * from public.louvesync_notifications;raise exception 'Inbox table exposed';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.louvesync_notifications('{"action":"list","memberId":"vocal","pin":"VOCAL_TEST"}')->'items')<>0 then raise exception 'Activation notified historical events';end if;
end $$;
reset role;
update public.events set time='19:30' where id='event-1';
update public.louvesync_notification_event_queue set ready_at=clock_timestamp()-interval '1 second';
set role anon;
do $$ declare result jsonb; begin
 result:=public.louvesync_notifications('{"action":"list","memberId":"vocal","pin":"VOCAL_TEST"}');
 if jsonb_array_length(result->'items')<>1 or result->'items'->0->>'type'<>'event_changed' then raise exception 'Assigned vocal did not receive event change: %',result;end if;
 if jsonb_array_length(public.louvesync_notifications('{"action":"list","memberId":"other","pin":"OTHER_TEST"}')->'items')<>0 then raise exception 'Unassigned person received schedule';end if;
 if jsonb_array_length(public.louvesync_notifications('{"action":"list","memberId":"admin","pin":"ADMIN_TEST"}')->'items')<>0 then raise exception 'Admin received general schedule';end if;
 if jsonb_array_length(public.louvesync_notifications('{"action":"list","memberId":"leader","pin":"LEADER_TEST"}')->'items')<>0 then raise exception 'Leader received general schedule';end if;
 perform public.louvesync_notifications(jsonb_build_object('action','mark_read','memberId','other','pin','OTHER_TEST','ids',jsonb_build_array(result->'items'->0->>'id')));
 if public.louvesync_notifications('{"action":"list","memberId":"vocal","pin":"VOCAL_TEST"}')->'items'->0->>'read_at' is not null then raise exception 'Another member marked recipient inbox';end if;
end $$;
reset role;
-- No-op writes and presence confirmations must not become schedule notices.
update public.events set time=time where id='event-1';
update public.event_members set confirmed=true where member_id='vocal';
update public.louvesync_notification_event_queue set ready_at=clock_timestamp()-interval '1 second';
set role anon;
do $$ begin
 if jsonb_array_length(public.louvesync_notifications('{"action":"list","memberId":"vocal","pin":"VOCAL_TEST"}')->'items')<>1 then raise exception 'No-op generated duplicates';end if;
end $$;
reset role;
update public.event_members set confirmed=false where member_id='vocal';
update public.event_members set confirmed=false where member_id='vocal';
do $$ begin
 if (select count(*) from public.louvesync_notifications where kind='attendance_declined')<>2 then raise exception 'Decline audience/deduplication incorrect';end if;
 if exists(select 1 from public.louvesync_notifications where kind='attendance_declined' and member_id not in ('admin','leader')) then raise exception 'Decline leaked to musicians';end if;
end $$;
-- A changed setlist notifies current and removed participants once.
delete from public.event_members where event_id='event-1' and member_id='vocal';
insert into public.event_members values('event-1','removed',null);
update public.louvesync_notification_event_queue set ready_at=clock_timestamp()-interval '1 second';
set role anon;
select public.louvesync_notifications('{"action":"list","memberId":"removed","pin":"REMOVED_TEST"}');
reset role;
do $$ begin
 if (select count(*) from public.louvesync_notifications where member_id='vocal' and kind='event_changed')<>2 then raise exception 'Removed member was not informed';end if;
 if (select count(*) from public.louvesync_notifications where member_id='removed' and kind='event_changed')<>1 then raise exception 'Newly assigned member was not informed';end if;
end $$;
set role anon;
select public.louvesync_notifications(jsonb_build_object('action','subscribe','memberId','vocal','pin','VOCAL_TEST','subscription',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/fixture','keys',jsonb_build_object('p256dh',translate(replace(encode(decode('04'||repeat('01',64),'hex'),'base64'),chr(10),''),'+/','-_'),'auth','AgICAgICAgICAgICAgICAg'))));
do $$ begin
 begin perform public.louvesync_notifications('{"action":"subscribe","memberId":"vocal","pin":"VOCAL_TEST","subscription":{"endpoint":"https://127.0.0.1/private","keys":{"p256dh":"x","auth":"x"}}}');raise exception 'Private push endpoint accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
insert into public.songs values('new-song','Nova música','other');
do $$ begin
 if (select count(*) from public.louvesync_notifications where kind='song_added')<>2 then raise exception 'New song audience incorrect';end if;
 if exists(select 1 from public.louvesync_notifications where kind='song_added' and member_id in ('admin','leader','inactive','other')) then raise exception 'New song ignored recipient exclusions';end if;
end $$;
set role service_role;
do $$ declare batch jsonb;delivery jsonb; begin
 batch:=public.louvesync_notification_worker('{"action":"drain"}');
 if jsonb_array_length(batch->'deliveries')<>1 then raise exception 'Expected only new subscriber delivery: %',batch;end if;
 delivery:=batch->'deliveries'->0;
 if jsonb_array_length(public.louvesync_notification_worker('{"action":"drain"}')->'deliveries')<>0 then raise exception 'Concurrent worker duplicated claimed delivery';end if;
 perform public.louvesync_notification_worker(jsonb_build_object('action','complete','deliveryId',delivery->>'deliveryId','claimToken',delivery->>'claimToken','status','sent'));
 if jsonb_array_length(public.louvesync_notification_worker('{"action":"drain"}')->'deliveries')<>0 then raise exception 'Delivered notification sent twice';end if;
end $$;
reset role;
select 'notifications authorization, audiences, coalescing, subscriptions and delivery leases passed' as result;
