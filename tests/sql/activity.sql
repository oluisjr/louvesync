-- Disposable PostgreSQL fixture only. This never connects to production.
create role anon;
create role authenticated;
create table public.members(id uuid primary key, name text, pin text, is_admin boolean);
create table public.events(id uuid primary key);
create table public.announcements(id text primary key);
insert into public.members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Admin fixture', 'ADMIN_TEST_PIN', true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Member fixture', 'MEMBER_TEST_PIN', false);
insert into public.events values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.announcements values ('post_fixture');
\i /app/supabase/migrations/20261108_admin_activity.sql
\i /app/supabase/migrations/20261108_admin_activity.sql

set role anon;
do $$
declare
  admin_auth jsonb := '{"memberId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","pin":"ADMIN_TEST_PIN"}';
  member_auth jsonb := '{"memberId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","pin":"MEMBER_TEST_PIN"}';
  session1 jsonb := '{"sessionId":"11111111-1111-4111-8111-111111111111","version":1}';
  session2 jsonb := '{"sessionId":"22222222-2222-4222-8222-222222222222","version":1}';
  view1 jsonb := '{"action":"view","targetType":"event","targetId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","viewId":"33333333-3333-4333-8333-333333333333","viewedAt":"2026-11-08T12:00:00Z"}';
  result jsonb;
begin
  begin
    perform public.louvesync_activity(member_auth || '{"action":"online","is_admin":true}');
    raise exception 'Non-admin read was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.louvesync_activity_sessions(session_id, member_id, version) values(gen_random_uuid(), 'forged', 1);
    raise exception 'Direct write was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.louvesync_activity(admin_auth || '{"action":"online","pin":"WRONG"}');
    raise exception 'Wrong PIN was allowed';
  exception when invalid_authorization_specification then null; end;
  begin
    perform count(*) from public.louvesync_content_views;
    raise exception 'Direct read was allowed';
  exception when insufficient_privilege then null; end;
  perform public.louvesync_activity(member_auth || session1 || '{"action":"heartbeat"}');
  begin
    perform public.louvesync_activity(admin_auth || session1 || '{"action":"heartbeat","version":10}');
    raise exception 'Another member session was overwritten';
  exception when invalid_authorization_specification then null; end;
  perform public.louvesync_activity(member_auth || session2 || '{"action":"heartbeat"}');
  result := public.louvesync_activity(admin_auth || '{"action":"online"}');
  if jsonb_array_length(result->'members') <> 1 then raise exception 'Multi-device deduplication failed'; end if;
  perform public.louvesync_activity(member_auth || session1 || '{"action":"leave","version":2}');
  result := public.louvesync_activity(admin_auth || '{"action":"online"}');
  if jsonb_array_length(result->'members') <> 1 then raise exception 'Second device was lost'; end if;
  perform public.louvesync_activity(member_auth || session2 || '{"action":"leave","version":2}');
  -- A delayed heartbeat must not resurrect a closed session.
  perform public.louvesync_activity(member_auth || session2 || '{"action":"heartbeat"}');
  result := public.louvesync_activity(admin_auth || '{"action":"online"}');
  if jsonb_array_length(result->'members') <> 0 then raise exception 'Stale heartbeat resurrected session'; end if;
  perform public.louvesync_activity(member_auth || view1);
  perform public.louvesync_activity(member_auth || view1);
  perform public.louvesync_activity(member_auth || view1 || '{"viewId":"44444444-4444-4444-8444-444444444444","viewedAt":"2026-11-08T15:00:00Z"}');
  perform public.louvesync_activity(member_auth || view1 || '{"targetType":"announcement","targetId":"post_fixture","viewId":"55555555-5555-4555-8555-555555555555"}');
  result := public.louvesync_activity(admin_auth || '{"action":"viewers","targetType":"event","targetId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}');
  if jsonb_array_length(result->'viewers') <> 1 or (result->'viewers'->0->>'viewCount')::int <> 2 then raise exception 'Receipt deduplication/history failed'; end if;
  if (result->'viewers'->0->>'firstViewedAt')::timestamptz <> '2026-11-08T12:00:00Z'::timestamptz then raise exception 'Original offline time was lost'; end if;
  if (result->'viewers'->0->>'lastViewedAt')::timestamptz <> '2026-11-08T15:00:00Z'::timestamptz then raise exception 'Last view was lost'; end if;
  result := public.louvesync_activity(admin_auth || '{"action":"viewers","targetType":"announcement","targetId":"post_fixture"}');
  if (result->'viewers'->0->>'viewCount')::int <> 1 then raise exception 'Announcement receipt was lost'; end if;
end;
$$;
reset role;
-- Simulate a lost device without waiting 75 seconds.
update public.louvesync_activity_sessions set active = true, last_seen_at = clock_timestamp() - interval '76 seconds';
set role anon;
do $$
declare result jsonb;
begin
  result := public.louvesync_activity('{"memberId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","pin":"ADMIN_TEST_PIN","action":"online"}');
  if jsonb_array_length(result->'members') <> 0 then raise exception 'Dead device remained online'; end if;
end;
$$;
reset role;
select 'activity SQL assertions passed' as result;
\i /app/supabase/migrations/20261108_admin_activity.sql
set role authenticated;
do $$
declare result jsonb;
begin
  result := public.louvesync_activity('{"memberId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","pin":"ADMIN_TEST_PIN","action":"viewers","targetType":"event","targetId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}');
  if (result->'viewers'->0->>'viewCount')::int <> 2 then raise exception 'Reinstall erased history'; end if;
  begin
    perform count(*) from public.louvesync_content_views;
    raise exception 'Authenticated role bypassed privacy';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
