-- Optional installation for admin activity monitoring. Run in Supabase SQL Editor.
-- Existing members, login/PINs, events and announcements are not modified.
begin;

create table if not exists public.louvesync_activity_sessions (
  session_id uuid primary key,
  member_id text not null,
  version bigint not null,
  active boolean not null default true,
  last_seen_at timestamptz not null default clock_timestamp()
);
create index if not exists louvesync_sessions_seen on public.louvesync_activity_sessions(last_seen_at);

create table if not exists public.louvesync_content_views (
  view_id uuid primary key,
  member_id text not null,
  member_name text not null,
  target_type text not null check (target_type in ('event', 'announcement')),
  target_id text not null,
  viewed_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp()
);
create index if not exists louvesync_views_target on public.louvesync_content_views(target_type, target_id, member_id, viewed_at desc);

alter table public.louvesync_activity_sessions enable row level security;
alter table public.louvesync_content_views enable row level security;
revoke all on public.louvesync_activity_sessions, public.louvesync_content_views from public, anon, authenticated;

-- Reuses the current member/PIN model, but never trusts a client-side admin flag.
-- Direct reads of the activity tables remain blocked for browser roles.
create or replace function public.louvesync_activity(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_member_id text := p_payload->>'memberId';
  v_name text;
  v_admin boolean;
  v_action text := p_payload->>'action';
  v_session uuid;
  v_version bigint;
  v_view uuid;
  v_type text := p_payload->>'targetType';
  v_target text := p_payload->>'targetId';
  v_seen timestamptz;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if coalesce(p_payload->>'pin', '') = '' then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;
  select m.name, coalesce(m.is_admin, false) into v_name, v_admin
    from public.members m where m.id::text = v_member_id and m.pin::text = p_payload->>'pin';
  if not found then raise exception 'Sessão inválida.' using errcode = '28000'; end if;

  if v_action in ('online', 'viewers') and not v_admin then
    raise exception 'Acesso exclusivo do administrador.' using errcode = '42501';
  end if;

  if v_action in ('heartbeat', 'leave') then
    v_session := (p_payload->>'sessionId')::uuid;
    v_version := (p_payload->>'version')::bigint;
    if v_session is null or v_version is null or v_version < 1 then raise exception 'Sessão ausente.' using errcode = '22023'; end if;
    if exists(select 1 from public.louvesync_activity_sessions where session_id = v_session and member_id <> v_member_id) then
      raise exception 'Sessão inválida.' using errcode = '28000';
    end if;
    insert into public.louvesync_activity_sessions as current_session(session_id, member_id, version, active, last_seen_at)
      values(v_session, v_member_id, v_version, v_action = 'heartbeat', v_now)
      on conflict(session_id) do update set active = excluded.active, last_seen_at = excluded.last_seen_at, version = excluded.version
      where current_session.member_id = excluded.member_id and current_session.version < excluded.version;
    if v_action = 'heartbeat' then
      delete from public.louvesync_activity_sessions where last_seen_at < v_now - interval '7 days';
    end if;
    return jsonb_build_object('ok', true, 'serverTime', v_now);
  end if;

  if v_action = 'online' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) into v_result
    from (
      select s.member_id as "memberId", m.name, max(s.last_seen_at) as "lastSeenAt"
      from public.louvesync_activity_sessions s join public.members m on m.id::text = s.member_id
      where s.active and s.last_seen_at >= v_now - interval '75 seconds'
      group by s.member_id, m.name
    ) t;
    return jsonb_build_object('members', v_result, 'serverTime', v_now);
  end if;

  if v_action in ('view', 'viewers') then
    if v_type not in ('event', 'announcement') or v_type is null or coalesce(length(v_target), 0) not between 1 and 128 then
      raise exception 'Conteúdo inválido.' using errcode = '22023';
    end if;
    if v_type = 'event' then
      if not exists(select 1 from public.events where id::text = v_target) then
        raise exception 'Conteúdo não encontrado.' using errcode = 'P0002';
      end if;
    else
      if not exists(select 1 from public.announcements where id::text = v_target) then
        raise exception 'Conteúdo não encontrado.' using errcode = 'P0002';
      end if;
    end if;
    if v_action = 'view' then
      v_view := (p_payload->>'viewId')::uuid;
      v_seen := (p_payload->>'viewedAt')::timestamptz;
      if v_view is null or v_seen is null or not isfinite(v_seen) then
        raise exception 'Visualização inválida.' using errcode = '22023';
      end if;
      -- Keep the device's observation time when a queued offline view arrives.
      insert into public.louvesync_content_views(view_id, member_id, member_name, target_type, target_id, viewed_at, received_at)
        values(v_view, v_member_id, v_name, v_type, v_target, v_seen, v_now)
        on conflict(view_id) do nothing;
      return jsonb_build_object('ok', true, 'serverTime', v_now);
    end if;
    select coalesce(jsonb_agg(to_jsonb(t) order by t."lastViewedAt" desc), '[]'::jsonb) into v_result
    from (
      select v.member_id as "memberId", coalesce(max(m.name), max(v.member_name)) as name,
        min(v.viewed_at) as "firstViewedAt", max(v.viewed_at) as "lastViewedAt", count(*) as "viewCount"
      from public.louvesync_content_views v left join public.members m on m.id::text = v.member_id
      where v.target_type = v_type and v.target_id = v_target group by v.member_id
    ) t;
    return jsonb_build_object('viewers', v_result, 'serverTime', v_now);
  end if;
  raise exception 'Ação inválida.' using errcode = '22023';
end;
$$;

revoke all on function public.louvesync_activity(jsonb) from public;
grant execute on function public.louvesync_activity(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
