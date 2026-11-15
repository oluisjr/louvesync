begin;
alter table public.members add column if not exists permissions text[];
alter table public.members add column if not exists unavailable_days smallint[] not null default '{}';
alter table public.members add column if not exists schedule_enabled boolean not null default true;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.members'::regclass and conname='members_valid_screens') then
    alter table public.members add constraint members_valid_screens check(permissions is null or (permissions <@ array['home','escala','mural','biblia','repertorio','ensaio','patrimonio','devocional','treinamento','ia','solicitacoes','presencas','membros','admin']::text[] and array_position(permissions,null) is null));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.members'::regclass and conname='members_valid_unavailable_days') then
    alter table public.members add constraint members_valid_unavailable_days check(unavailable_days <@ array[0,1,2,3,4,5,6]::smallint[] and array_position(unavailable_days,null) is null);
  end if;
end; $$;
-- The public login roster does not expose individual availability/preferences.
revoke select(permissions,unavailable_days,schedule_enabled) on public.members from public,anon,authenticated;
create or replace function louvesync_private.member_settings(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb:=louvesync_private.resolve_actor(p_payload->>'memberId',p_payload->>'pin'); rows jsonb;
begin
  if a is null then raise exception 'Sessão inválida.' using errcode='28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'permissions',m.permissions,'unavailable_days',m.unavailable_days,'schedule_enabled',m.schedule_enabled) order by m.name),'[]') into rows
    from public.members m where louvesync_private.is_leader(a) or m.id::text=a->>'id';
  return jsonb_build_object('ok',true,'members',rows);
end; $$;
revoke all on function louvesync_private.member_settings(jsonb) from public;
grant execute on function louvesync_private.member_settings(jsonb) to anon,authenticated;
create or replace function public.louvesync_member_settings(p_payload jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select louvesync_private.member_settings(p_payload); $$;
revoke all on function public.louvesync_member_settings(jsonb) from public;
grant execute on function public.louvesync_member_settings(jsonb) to anon,authenticated;

-- Keep historical assignments and RSVP working. Only a new/changed link is
-- checked against the current account, participation and weekday settings.
create or replace function louvesync_private.check_assignment_availability() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare person public.members%rowtype; event_date text; weekday integer;
begin
  if tg_op='UPDATE' and old.event_id is not distinct from new.event_id and old.member_id is not distinct from new.member_id then return new; end if;
  if tg_op='INSERT' and exists(select 1 from public.event_members where event_id=new.event_id and member_id=new.member_id) then return new; end if;
  select * into person from public.members where id=new.member_id;
  if not found then raise exception 'Membro não encontrado.' using errcode='23503'; end if;
  select date into event_date from public.events where id=new.event_id;
  if event_date is null then raise exception 'Evento não encontrado.' using errcode='23503'; end if;
  weekday:=extract(dow from event_date::date)::integer;
  if lower(coalesce(nullif(btrim(person.status),''),'ativo')) not in ('ativo','ativa','active') or not person.schedule_enabled or weekday=any(person.unavailable_days) then
    raise exception '% não está disponível para a escala em %.',person.name,to_char(event_date::date,'DD/MM/YYYY') using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function louvesync_private.check_assignment_availability() from public,anon,authenticated;
drop trigger if exists louve_member_availability on public.event_members;
create trigger louve_member_availability before insert or update on public.event_members for each row execute function louvesync_private.check_assignment_availability();
commit;
