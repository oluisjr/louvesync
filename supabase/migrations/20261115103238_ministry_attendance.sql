-- Actual attendance is separate from event_members.confirmed (advance RSVP).
-- The app uses member/PIN authentication. Check the persisted leader on every
-- call; no browser role, name, roster, date or recorder claim is authoritative.
begin;

create schema if not exists louvesync_private;
revoke all on schema louvesync_private from public;

create table if not exists public.louvesync_attendance_sheets (
  event_id text primary key,
  event_label text not null,
  event_date date not null,
  event_time text not null default '',
  event_type text not null default 'outro',
  roster jsonb not null check (jsonb_typeof(roster) = 'array' and jsonb_array_length(roster) between 1 and 300),
  version integer not null check (version > 0),
  finalized boolean not null default false,
  recorded_by text not null,
  recorded_name text not null,
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists louvesync_attendance_date on public.louvesync_attendance_sheets(event_date desc, event_id);

-- Preserve corrections and the original roster even if an event/member is
-- subsequently removed. These snapshots intentionally have no legacy-table FK.
create table if not exists public.louvesync_attendance_revisions (
  event_id text not null references public.louvesync_attendance_sheets(event_id),
  version integer not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (event_id, version)
);
alter table public.louvesync_attendance_sheets enable row level security;
alter table public.louvesync_attendance_revisions enable row level security;
revoke all on public.louvesync_attendance_sheets, public.louvesync_attendance_revisions from public, anon, authenticated;

create or replace function louvesync_private.attendance_sheet(p_sheet public.louvesync_attendance_sheets)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('eventId',p_sheet.event_id,'label',p_sheet.event_label,
    'date',p_sheet.event_date::text,'time',p_sheet.event_time,'type',p_sheet.event_type,
    'roster',p_sheet.roster,'version',p_sheet.version,'finalized',p_sheet.finalized,
    'recordedBy',jsonb_build_object('memberId',p_sheet.recorded_by,'name',p_sheet.recorded_name),
    'updatedAt',p_sheet.updated_at);
$$;
revoke all on function louvesync_private.attendance_sheet(public.louvesync_attendance_sheets) from public, anon, authenticated;

create or replace function louvesync_private.attendance(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor text := p_payload->>'memberId';
  v_name text;
  v_role text;
  v_status text;
  v_admin boolean;
  v_action text := p_payload->>'action';
  v_id text := p_payload->>'eventId';
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_from date;
  v_to date;
  v_saved public.louvesync_attendance_sheets%rowtype;
  v_exists boolean;
  v_event jsonb;
  v_roster jsonb;
  v_entries jsonb := p_payload->'entries';
  v_result jsonb;
  v_version integer;
  v_final boolean;
begin
  if coalesce(length(v_actor),0) not between 1 and 128 or coalesce(length(p_payload->>'pin'),0) not between 1 and 256 then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;
  select m.name, coalesce(m.is_admin,false), lower(coalesce(m.role,'')), lower(coalesce(nullif(btrim(m.status),''),'ativo'))
    into v_name,v_admin,v_role,v_status from public.members m
    where m.id::text=v_actor and m.pin::text=p_payload->>'pin';
  if not found then raise exception 'Sessão inválida.' using errcode = '28000'; end if;
  v_role := translate(v_role,'áàâãéêíóôõúüç','aaaaeeiooouuc');
  if v_status not in ('ativo','ativa','active') or not (v_admin or (v_role ~ '\mlider\M' and v_role ~ '\mlouvor\M')) then
    raise exception 'Acesso exclusivo da liderança.' using errcode = '42501';
  end if;

  if v_action='list' then
    if coalesce(p_payload->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'to','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Período inválido.' using errcode='22023'; end if;
    v_from := (p_payload->>'from')::date; v_to := (p_payload->>'to')::date;
    if v_from>v_to or v_to-v_from>366 then raise exception 'Selecione um período de até um ano.' using errcode='22023'; end if;
    if (select count(*) from public.louvesync_attendance_sheets where event_date between v_from and v_to)>500 then raise exception 'Reduza o período para consultar todas as chamadas.' using errcode='22023'; end if;
    select coalesce(jsonb_agg(louvesync_private.attendance_sheet(s) order by s.event_date desc,s.event_time desc,s.event_id),'[]'::jsonb)
      into v_result from public.louvesync_attendance_sheets s where s.event_date between v_from and v_to;
    return jsonb_build_object('ok',true,'sheets',v_result,'today',v_today::text,'serverTime',v_now);
  end if;
  if v_action is null or v_action not in ('get','save') or coalesce(length(v_id),0) not between 1 and 128 then raise exception 'Solicitação inválida.' using errcode='22023'; end if;

  select * into v_saved from public.louvesync_attendance_sheets where event_id=v_id for update;
  v_exists := found;
  if not v_exists then
    select to_jsonb(e) into v_event from public.events e where e.id::text=v_id for share;
    if not found then raise exception 'Evento não encontrado.' using errcode='P0002'; end if;
    if coalesce(v_event->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'O evento precisa ter uma data válida.' using errcode='22023'; end if;
    perform 1 from public.event_members em where em.event_id::text=v_id for share;
    select coalesce(jsonb_agg(jsonb_build_object('memberId',a.member_id,'name',coalesce(m.name,'Integrante removido'),
      'instrument',coalesce(m.instrument,m.role,''),'status',null,'note','') order by coalesce(m.name,''),a.member_id),'[]'::jsonb)
      into v_roster from (select distinct em.member_id::text as member_id from public.event_members em where em.event_id::text=v_id) a
      left join public.members m on m.id::text=a.member_id;
    v_saved.event_id:=v_id; v_saved.event_label:=coalesce(v_event->>'label','Evento'); v_saved.event_date:=(v_event->>'date')::date;
    v_saved.event_time:=coalesce(v_event->>'time',''); v_saved.event_type:=coalesce(v_event->>'type','outro');
    v_saved.roster:=v_roster; v_saved.version:=0; v_saved.finalized:=false;
  end if;
  if v_action='get' then return jsonb_build_object('ok',true,'sheet',louvesync_private.attendance_sheet(v_saved),'canRecord',v_saved.event_date<=v_today,'today',v_today::text,'serverTime',v_now); end if;
  if v_saved.event_date>v_today then raise exception 'A chamada fica disponível no dia do evento.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'version') is distinct from 'number' or jsonb_typeof(p_payload->'finalize') is distinct from 'boolean' then raise exception 'Versão da chamada inválida.' using errcode='22023'; end if;
  v_version := (p_payload->>'version')::integer; v_final := (p_payload->>'finalize')::boolean;
  if v_version is distinct from v_saved.version then raise exception 'Chamada alterada em outro aparelho.' using errcode='40001'; end if;
  if jsonb_typeof(v_entries) is distinct from 'array' then raise exception 'Equipe inválida.' using errcode='22023'; end if;
  if jsonb_array_length(v_entries) not between 1 and 300 or jsonb_array_length(v_entries)<>jsonb_array_length(v_saved.roster) then raise exception 'A equipe foi alterada. Atualize a chamada.' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements(v_entries) x where jsonb_typeof(x->'memberId') is distinct from 'string'
      or coalesce(length(x->>'memberId'),0) not between 1 and 128 or not (x ? 'status')
      or (x->>'status' is not null and x->>'status' not in ('present','absent','excused'))
      or jsonb_typeof(x->'note') is distinct from 'string' or length(x->>'note')>500)
    or (select count(distinct x->>'memberId') from jsonb_array_elements(v_entries) x)<>jsonb_array_length(v_entries) then raise exception 'Marcações de presença inválidas.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_entries) x where not exists(select 1 from jsonb_array_elements(v_saved.roster) r where r->>'memberId'=x->>'memberId')) then raise exception 'A equipe foi alterada. Atualize a chamada.' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements(v_entries) x where x->>'status'='excused' and btrim(x->>'note')='') then raise exception 'Informe o motivo da falta justificada.' using errcode='22023'; end if;
  if v_final and exists(select 1 from jsonb_array_elements(v_entries) x where x->>'status' is null) then raise exception 'Marque todos os integrantes antes de concluir a chamada.' using errcode='22023'; end if;
  select jsonb_agg(r || jsonb_build_object('status',x->'status','note',btrim(x->>'note')) order by n)
    into v_roster from jsonb_array_elements(v_saved.roster) with ordinality as a(r,n)
    join jsonb_array_elements(v_entries) x on x->>'memberId'=r->>'memberId';
  if not v_exists then
    insert into public.louvesync_attendance_sheets(event_id,event_label,event_date,event_time,event_type,roster,version,finalized,recorded_by,recorded_name,updated_at)
      values(v_id,v_saved.event_label,v_saved.event_date,v_saved.event_time,v_saved.event_type,v_roster,1,v_final,v_actor,v_name,v_now) on conflict(event_id) do nothing;
    if not found then raise exception 'Chamada alterada em outro aparelho.' using errcode='40001'; end if;
  else
    update public.louvesync_attendance_sheets set roster=v_roster,version=version+1,finalized=v_final,recorded_by=v_actor,recorded_name=v_name,updated_at=v_now where event_id=v_id;
  end if;
  select * into v_saved from public.louvesync_attendance_sheets where event_id=v_id;
  v_result := louvesync_private.attendance_sheet(v_saved);
  insert into public.louvesync_attendance_revisions(event_id,version,snapshot,recorded_at) values(v_id,v_saved.version,v_result,v_now);
  return jsonb_build_object('ok',true,'sheet',v_result,'canRecord',true,'today',v_today::text,'serverTime',v_now);
end;
$$;
revoke all on function louvesync_private.attendance(jsonb) from public;
grant usage on schema louvesync_private to anon,authenticated;
grant execute on function louvesync_private.attendance(jsonb) to anon,authenticated;

create or replace function public.louvesync_attendance(p_payload jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select louvesync_private.attendance(p_payload);
$$;
revoke all on function public.louvesync_attendance(jsonb) from public;
grant execute on function public.louvesync_attendance(jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
