-- Disposable database only. This script never connects to production.
create role anon;
create role authenticated;
create table public.members(id uuid primary key, pin text, is_admin boolean);
create table public.songs(id uuid primary key);
create table public.events(id uuid primary key);
create table public.event_songs(id bigint primary key,event_id uuid references public.events(id),song_id uuid references public.songs(id));
create table public.event_members(event_id uuid references public.events(id),member_id uuid references public.members(id));
create table public.event_audit_reference(event_id uuid references public.events(id));
grant all on public.songs,public.events,public.event_songs,public.event_members to anon,authenticated;
grant select on public.members to anon,authenticated;
insert into public.members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ADMIN_FIXTURE_PIN',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','MEMBER_FIXTURE_PIN',false);
insert into public.songs values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.events values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),('ffffffff-ffff-4fff-8fff-ffffffffffff');
insert into public.event_songs values
 (1,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111'),
 (2,'ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111'),
 (3,'ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222'),
 (99,'ffffffff-ffff-4fff-8fff-ffffffffffff',null);
insert into public.event_members values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.event_audit_reference values ('ffffffff-ffff-4fff-8fff-ffffffffffff');
\i /app/migration.sql
\i /app/migration.sql

set role anon;
do $$
declare
 admin_auth jsonb := '{"memberId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","pin":"ADMIN_FIXTURE_PIN"}';
 member_auth jsonb := '{"memberId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","pin":"MEMBER_FIXTURE_PIN"}';
 event_target jsonb := '{"targetType":"event","targetId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
 song_target jsonb := '{"targetType":"song","targetId":"11111111-1111-4111-8111-111111111111"}';
 result jsonb;
begin
 begin
  delete from public.events;
  raise exception 'Direct event deletion was allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.songs;
  raise exception 'Direct song deletion was allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.louvesync_admin_delete(member_auth || event_target || '{"is_admin":true}');
  raise exception 'Spoofed member event deletion was allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.louvesync_admin_delete(member_auth || song_target || '{"is_admin":true}');
  raise exception 'Spoofed member song deletion was allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.louvesync_admin_delete(admin_auth || event_target || '{"pin":"MEMBER_FIXTURE_PIN"}');
  raise exception 'Wrong PIN was accepted';
 exception when invalid_authorization_specification then null; end;
 if (select count(*) from public.events)<>2 or (select count(*) from public.event_songs)<>4 then raise exception 'Unauthorized operation changed rows'; end if;
 delete from public.event_songs where id=99;
 if found is false then raise exception 'setEventItems child deletion was blocked'; end if;
 begin
  perform public.louvesync_admin_delete(admin_auth || '{"targetType":"event","targetId":"ffffffff-ffff-4fff-8fff-ffffffffffff"}');
  raise exception 'Expected dependent FK to reject event deletion';
 exception when foreign_key_violation then null; end;
 if not exists(select 1 from public.events where id='ffffffff-ffff-4fff-8fff-ffffffffffff')
  or (select count(*) from public.event_songs where event_id='ffffffff-ffff-4fff-8fff-ffffffffffff')<>2
  or not exists(select 1 from public.event_members where event_id='ffffffff-ffff-4fff-8fff-ffffffffffff')
 then raise exception 'Failed event deletion was not rolled back'; end if;
 result := public.louvesync_admin_delete(admin_auth || event_target || '{"is_admin":false}');
 if result->>'ok'<>'true' or exists(select 1 from public.events where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  or exists(select 1 from public.event_songs where event_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  or exists(select 1 from public.event_members where event_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
 then raise exception 'Authorized event deletion failed'; end if;
 result := public.louvesync_admin_delete(admin_auth || song_target);
 if result->>'ok'<>'true' or exists(select 1 from public.songs where id='11111111-1111-4111-8111-111111111111')
  or exists(select 1 from public.event_songs where song_id='11111111-1111-4111-8111-111111111111')
 then raise exception 'Authorized song deletion failed'; end if;
 if not exists(select 1 from public.songs where id='22222222-2222-4222-8222-222222222222') then raise exception 'Another song was deleted'; end if;
 begin
  perform public.louvesync_admin_delete(admin_auth || event_target);
  raise exception 'Missing event did not fail';
 exception when no_data_found then null; end;
 begin
  perform public.louvesync_admin_delete(admin_auth || '{"targetType":"members","targetId":"anything"}');
  raise exception 'Invalid target type was accepted';
 exception when invalid_parameter_value then null; end;
end;
$$;
reset role;
set role authenticated;
do $$ begin
 begin delete from public.events;raise exception 'Authenticated direct deletion allowed';exception when insufficient_privilege then null;end;
 begin perform public.louvesync_admin_delete('{"memberId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","pin":"MEMBER_FIXTURE_PIN","targetType":"event","targetId":"ffffffff-ffff-4fff-8fff-ffffffffffff","is_admin":true}');raise exception 'Authenticated member deletion allowed';exception when insufficient_privilege then null;end;
end; $$;
reset role;
select 'admin deletion SQL assertions passed' as result;
