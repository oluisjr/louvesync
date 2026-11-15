begin;
alter table public.members add column if not exists access_type text not null default 'ministry';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.members'::regclass and conname='members_access_type') then
    alter table public.members add constraint members_access_type check(access_type in ('ministry','church_member') and (access_type='ministry' or (not coalesce(is_admin,false) and not schedule_enabled and role='Membro' and coalesce(instrument,'')='')));
  end if;
end; $$;
grant select(access_type) on public.members to anon,authenticated;
create or replace function public.louvesync_notification_active(p_member jsonb) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(p_member->>'access_type','ministry')='ministry' and (p_member->>'status' is null or lower(p_member->>'status') in ('ativo','ativa','active'));
$$;
create or replace function louvesync_private.member_settings(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb:=louvesync_private.resolve_actor(p_payload->>'memberId',p_payload->>'pin'); rows jsonb;
begin
  if a is null then raise exception 'Sessão inválida.' using errcode='28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'permissions',m.permissions,'unavailable_days',m.unavailable_days,'schedule_enabled',m.schedule_enabled,'access_type',m.access_type) order by m.name),'[]') into rows
    from public.members m where louvesync_private.is_leader(a) or m.id::text=a->>'id';
  return jsonb_build_object('ok',true,'members',rows);
end; $$;
create or replace function louvesync_private.is_leader(p_actor jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select coalesce(p_actor->>'access_type','ministry')='ministry' and (coalesce((p_actor->>'is_admin')::boolean,false) or
 (translate(lower(coalesce(p_actor->>'role','')),'áàâãéêíóôõúüç','aaaaeeiooouuc') ~ '\mlider\M' and translate(lower(coalesce(p_actor->>'role','')),'áàâãéêíóôõúüç','aaaaeeiooouuc') ~ '\mlouvor\M'));
$$;
create or replace function louvesync_private.request_actor() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare h jsonb; a jsonb; begin
 begin h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; exception when invalid_text_representation then return null; end;
 a:=louvesync_private.resolve_actor(h->>'x-louvesync-member',h->>'x-louvesync-pin');
 return case when a->>'access_type'='church_member' then null else a end;
end; $$;
create or replace function louvesync_private.set_actor(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb; begin
 a:=louvesync_private.resolve_actor(p_payload->>'memberId',p_payload->>'pin');
 if a is null or a->>'access_type'='church_member' then raise exception 'Acesso restrito à equipe do ministério.' using errcode='28000'; end if;
 perform set_config('louvesync.audit_actor',a::text,true); return a;
end; $$;

-- Guests and church-only members never read ministry content through PostgREST.
-- The safe member roster remains readable for the existing member/PIN login.
do $$ declare t text; begin
 foreach t in array array['songs','events','event_songs','event_members','equipment','announcements','announcement_comments','announcement_reactions','announcement_saves','rehearsal_sessions','rehearsal_notes','rehearsal_takes'] loop
  if to_regclass('public.'||t) is null then continue; end if;
  execute format('drop policy if exists louve_read on public.%I',t);
  execute format('create policy louve_read on public.%I for select to anon,authenticated using((select louvesync_private.request_actor()) is not null)',t);
 end loop;
end; $$;
commit;
