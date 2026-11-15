begin;
create table if not exists public.louvesync_church_events(
 id uuid primary key default gen_random_uuid(), title text not null check(length(btrim(title)) between 3 and 120),
 description text not null default '' check(length(description)<=4000), starts_at timestamptz not null, ends_at timestamptz,
 location text not null default '' check(length(location)<=240), category text not null default 'Culto' check(category in ('Culto','Encontro','Estudo bíblico','Ação solidária','Outro')),
 published boolean not null default false, created_by text references public.members(id) on delete set null,
 updated_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(),
 check(ends_at is null or ends_at>=starts_at)
);
create index if not exists louve_church_events_published_date on public.louvesync_church_events(starts_at) where published;
create index if not exists louve_church_events_published_end on public.louvesync_church_events(ends_at) where published and ends_at is not null;
create table if not exists public.louvesync_prayer_requests(
 id uuid primary key, member_id text references public.members(id) on delete set null,
 display_name text not null default '' check(length(display_name)<=100), anonymous boolean not null default false,
 message text not null check(length(btrim(message)) between 10 and 2000),
 visibility text not null default 'team' check(visibility in ('team','community')),
 status text not null default 'pending' check(status in ('pending','praying','answered','archived')),
 published boolean not null default false, ip_hash text not null check(length(ip_hash)=64),
 reviewed_by text references public.members(id) on delete set null, reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), check(not published or (visibility='community' and reviewed_by is not null))
);
create index if not exists louve_prayers_rate on public.louvesync_prayer_requests(ip_hash,created_at);
create index if not exists louve_prayers_member on public.louvesync_prayer_requests(member_id) where member_id is not null;
create index if not exists louve_prayers_reviewed_by on public.louvesync_prayer_requests(reviewed_by) where reviewed_by is not null;
create index if not exists louve_church_events_created_by on public.louvesync_church_events(created_by) where created_by is not null;
create index if not exists louve_prayers_inbox on public.louvesync_prayer_requests(created_at desc);
alter table public.louvesync_church_events enable row level security;
alter table public.louvesync_prayer_requests enable row level security;
drop policy if exists louve_church_server on public.louvesync_church_events;
create policy louve_church_server on public.louvesync_church_events for all to service_role using(true) with check(true);
drop policy if exists louve_prayer_server on public.louvesync_prayer_requests;
create policy louve_prayer_server on public.louvesync_prayer_requests for all to service_role using(true) with check(true);
revoke all on public.louvesync_church_events,public.louvesync_prayer_requests from public,anon,authenticated;
grant select,insert,update,delete on public.louvesync_church_events,public.louvesync_prayer_requests to service_role;

-- Server-only atomic intake. A retry of the same request never creates duplicates.
create or replace function public.louvesync_submit_prayer(p_payload jsonb,p_ip_hash text,p_member_id text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare existing public.louvesync_prayer_requests%rowtype; result public.louvesync_prayer_requests%rowtype; submitted_name text:=case when coalesce((p_payload->>'anonymous')::boolean,false) then '' else btrim(coalesce(p_payload->>'name','')) end; begin
 if length(p_ip_hash)<>64 then raise exception 'Requisição inválida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash,0));
 select * into existing from public.louvesync_prayer_requests where id=(p_payload->>'id')::uuid;
 if found then
  if existing.ip_hash<>p_ip_hash or existing.message<>btrim(p_payload->>'message') or existing.visibility is distinct from coalesce(p_payload->>'visibility','team') or existing.anonymous is distinct from coalesce((p_payload->>'anonymous')::boolean,false) or existing.member_id is distinct from p_member_id or existing.display_name is distinct from submitted_name then raise exception 'Requisição duplicada com outros dados.' using errcode='23505'; end if;
  return jsonb_build_object('ok',true,'id',existing.id,'created_at',existing.created_at);
 end if;
 if (select count(*) from public.louvesync_prayer_requests where ip_hash=p_ip_hash and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'Aguarde antes de enviar outro pedido.' using errcode='54000'; end if;
 insert into public.louvesync_prayer_requests(id,member_id,display_name,anonymous,message,visibility,ip_hash)
 values((p_payload->>'id')::uuid,p_member_id,case when coalesce((p_payload->>'anonymous')::boolean,false) then '' else btrim(coalesce(p_payload->>'name','')) end,coalesce((p_payload->>'anonymous')::boolean,false),btrim(p_payload->>'message'),coalesce(p_payload->>'visibility','team'),p_ip_hash) returning * into result;
 return jsonb_build_object('ok',true,'id',result.id,'created_at',result.created_at);
end; $$;
revoke all on function public.louvesync_submit_prayer(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.louvesync_submit_prayer(jsonb,text,text) to service_role;
comment on table public.louvesync_prayer_requests is 'Private intake via server API. No anonymous or authenticated Data API grants; public sharing requires consent and administrator review.';
commit;
