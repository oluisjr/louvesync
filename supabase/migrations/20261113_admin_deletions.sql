-- Run in Supabase SQL Editor. Retains the current member/PIN login.
-- This migration authorizes deletion at the database, not via browser flags.
begin;

create or replace function public.louvesync_admin_delete(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_member_id text := p_payload->>'memberId';
  v_pin text := p_payload->>'pin';
  v_admin boolean;
  v_type text := p_payload->>'targetType';
  v_target text := p_payload->>'targetId';
begin
  if coalesce(length(v_member_id),0) not between 1 and 128
     or coalesce(length(v_pin),0) not between 1 and 256 then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;
  select coalesce(m.is_admin,false) into v_admin from public.members m
    where m.id::text = v_member_id and m.pin::text = v_pin;
  if not found then raise exception 'Sessão inválida.' using errcode = '28000'; end if;
  if not v_admin then raise exception 'Acesso exclusivo do administrador.' using errcode = '42501'; end if;
  if v_type is null or v_type not in ('song','event')
     or coalesce(length(v_target),0) not between 1 and 128 then
    raise exception 'Conteúdo inválido.' using errcode = '22023';
  end if;

  if v_type = 'event' then
    perform 1 from public.events where id::text = v_target for update;
    if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
    delete from public.event_songs where event_id::text = v_target;
    delete from public.event_members where event_id::text = v_target;
    delete from public.events where id::text = v_target;
  else
    perform 1 from public.songs where id::text = v_target for update;
    if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
    delete from public.event_songs where song_id::text = v_target;
    delete from public.songs where id::text = v_target;
  end if;

  return jsonb_build_object('ok',true,'targetType',v_type,'targetId',v_target);
end;
$$;

revoke all on function public.louvesync_admin_delete(jsonb) from public;
grant execute on function public.louvesync_admin_delete(jsonb) to anon, authenticated;

-- Keep existing RLS/read/edit policies intact. Only direct parent-table DELETE
-- is revoked: setEventItems can still edit event_songs and event_members.
revoke delete on table public.songs, public.events from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
