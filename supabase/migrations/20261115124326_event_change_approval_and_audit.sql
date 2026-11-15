-- Enforce permissions at PostgREST/RPC, retaining the member/PIN login.
-- User credentials are no longer readable from members or shipped seed files.
begin;
create schema if not exists louvesync_private;
revoke all on schema louvesync_private from public;
grant usage on schema louvesync_private to anon,authenticated;

create table if not exists public.louvesync_app_audit (
  id bigint generated always as identity primary key,
  actor_id text, actor_name text not null, actor_role text,
  entity_type text not null, entity_id text, event_id text,
  action text not null check(action in ('INSERT','UPDATE','DELETE')),
  before_record jsonb, after_record jsonb, changed_fields text[] not null,
  request_id uuid, created_at timestamptz not null default clock_timestamp()
);
create index if not exists louvesync_app_audit_event on public.louvesync_app_audit(event_id,id desc);
create index if not exists louvesync_app_audit_actor on public.louvesync_app_audit(actor_id,id desc);
create table if not exists public.louvesync_change_requests (
  id uuid primary key default gen_random_uuid(), event_id text,
  actor_id text not null, actor_name text not null,
  kind text not null check(kind in ('key','song','song_edit','song_create')),
  source_song_id text not null, source_item_id text,
  proposal jsonb not null, before_record jsonb not null,
  reason text not null check(length(reason) between 1 and 500),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz, decided_by text, decided_name text, decision_note text
);
create unique index if not exists louvesync_change_request_pending on public.louvesync_change_requests(actor_id,kind,coalesce(event_id,''),source_song_id) where status='pending';
create index if not exists louvesync_change_request_event on public.louvesync_change_requests(event_id,created_at desc,id);
create index if not exists louvesync_change_request_actor on public.louvesync_change_requests(actor_id,created_at desc,id);
alter table public.louvesync_app_audit enable row level security;
alter table public.louvesync_change_requests enable row level security;
revoke all on public.louvesync_app_audit,public.louvesync_change_requests from public,anon,authenticated;
revoke all on sequence public.louvesync_app_audit_id_seq from public,anon,authenticated;
create table if not exists louvesync_private.login_attempts(member_id text primary key,attempts integer not null,window_started timestamptz not null);
alter table louvesync_private.login_attempts enable row level security;
revoke all on louvesync_private.login_attempts from public,anon,authenticated;

create or replace function louvesync_private.resolve_actor(p_id text,p_pin text) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select to_jsonb(m)-'pin' from public.members m where m.id::text=p_id and m.pin::text=p_pin
    and length(p_pin) between 1 and 256 and lower(coalesce(nullif(btrim(m.status),''),'ativo')) in ('ativo','ativa','active');
$$;
revoke all on function louvesync_private.resolve_actor(text,text) from public,anon,authenticated;
create or replace function louvesync_private.request_actor() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare h jsonb; begin
  begin h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when invalid_text_representation then return null; end;
  return louvesync_private.resolve_actor(h->>'x-louvesync-member',h->>'x-louvesync-pin');
end; $$;
create or replace function louvesync_private.is_leader(p_actor jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select coalesce((p_actor->>'is_admin')::boolean,false) or
    (translate(lower(coalesce(p_actor->>'role','')),'áàâãéêíóôõúüç','aaaaeeiooouuc') ~ '\mlider\M'
     and translate(lower(coalesce(p_actor->>'role','')),'áàâãéêíóôõúüç','aaaaeeiooouuc') ~ '\mlouvor\M');
$$;
revoke all on function louvesync_private.request_actor(),louvesync_private.is_leader(jsonb) from public;
grant execute on function louvesync_private.request_actor(),louvesync_private.is_leader(jsonb) to anon,authenticated;
create or replace function louvesync_private.set_actor(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb; begin
  a:=louvesync_private.resolve_actor(p_payload->>'memberId',p_payload->>'pin');
  if a is null then raise exception 'Sessão inválida.' using errcode='28000'; end if;
  perform set_config('louvesync.audit_actor',a::text,true);
  return a;
end; $$;
revoke all on function louvesync_private.set_actor(jsonb) from public,anon,authenticated;

create or replace function louvesync_private.login(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb; n integer; t timestamptz:=clock_timestamp(); v_id text:=p_payload->>'memberId'; begin
  if coalesce(length(v_id),0) not between 1 and 128 or coalesce(length(p_payload->>'pin'),0) not between 1 and 256 then raise exception 'Sessão inválida.' using errcode='28000'; end if;
  insert into louvesync_private.login_attempts(member_id,attempts,window_started) values(v_id,1,t)
    on conflict(member_id) do update set attempts=case when login_attempts.window_started<t-interval '15 minutes' then 1 else login_attempts.attempts+1 end,
      window_started=case when login_attempts.window_started<t-interval '15 minutes' then t else login_attempts.window_started end returning attempts into n;
  if n>12 then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  a:=louvesync_private.resolve_actor(v_id,p_payload->>'pin');
  if a is null then return jsonb_build_object('ok',false,'code','invalid_credentials'); end if;
  delete from louvesync_private.login_attempts where member_id=v_id or window_started<t-interval '1 day';
  return jsonb_build_object('ok',true,'member',a);
end; $$;
revoke all on function louvesync_private.login(jsonb) from public;
grant execute on function louvesync_private.login(jsonb) to anon,authenticated;
create or replace function public.louvesync_login(p_payload jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select louvesync_private.login(p_payload);$$;
revoke all on function public.louvesync_login(jsonb) from public;
grant execute on function public.louvesync_login(jsonb) to anon,authenticated;

create or replace function louvesync_private.audit_change() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb; b jsonb; c jsonb; r jsonb; fields text[]; v_id text; v_event text; begin
  b:=case when tg_op<>'INSERT' then to_jsonb(old) end; c:=case when tg_op<>'DELETE' then to_jsonb(new) end;
  if tg_op='UPDATE' and b=c then return null; end if;
  a:=coalesce(nullif(current_setting('louvesync.audit_actor',true),'')::jsonb,louvesync_private.request_actor());
  if a is null and current_setting('role',true) in ('anon','authenticated') then raise exception 'Identifique sua sessão para alterar dados.' using errcode='28000'; end if;
  r:=coalesce(c,b); v_id:=coalesce(r->>'id',r->>'event_id',r->>'song_id',r->>'post_id');
  v_event:=case when tg_table_name='events' then v_id else r->>'event_id' end;
  select coalesce(array_agg(k order by k),'{}'::text[]) into fields from (select jsonb_object_keys(coalesce(b,'{}')||coalesce(c,'{}')) k) x where b->k is distinct from c->k;
  insert into public.louvesync_app_audit(actor_id,actor_name,actor_role,entity_type,entity_id,event_id,action,before_record,after_record,changed_fields,request_id)
    values(a->>'id',coalesce(a->>'name','Sistema'),a->>'role',tg_table_name,v_id,v_event,tg_op,b-'pin',c-'pin',fields,nullif(current_setting('louvesync.change_request',true),'')::uuid);
  return null;
end; $$;
revoke all on function louvesync_private.audit_change() from public,anon,authenticated;

create or replace function louvesync_private.guard_content_write() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb:=louvesync_private.request_actor(); b jsonb; c jsonb; k text; begin
  a:=coalesce(nullif(current_setting('louvesync.audit_actor',true),'')::jsonb,a);
  if a is null and current_setting('role',true) in ('anon','authenticated') then raise exception 'Sessão inválida.' using errcode='28000'; end if;
  -- Preserve the verified author before their own PIN or role changes.
  if tg_table_name='members' and a is not null then perform set_config('louvesync.audit_actor',a::text,true); end if;
  if tg_op='DELETE' then c:=to_jsonb(old); else c:=to_jsonb(new); end if;
  if tg_table_name in ('event_songs','event_members') then perform 1 from public.events where id::text=c->>'event_id' for update; end if;
  if tg_op='UPDATE' and a is not null and not louvesync_private.is_leader(a) then
    b:=to_jsonb(old);
    if tg_table_name='event_members' and (b-'confirmed') is distinct from (c-'confirmed') then raise exception 'Somente sua resposta à escala pode ser alterada.' using errcode='42501'; end if;
    foreach k in array array['id','event_id','member_id','created_by','post_id','song_id'] loop
      if b ? k and b->k is distinct from c->k then raise exception 'O vínculo deste registro não pode ser alterado.' using errcode='42501'; end if;
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_table_name='announcement_comments' and a is not null then new.member_name:=a->>'name'; end if;
  if tg_table_name='rehearsal_notes' and a is not null then new.updated_by:=a->>'id'; end if;
  return new;
end; $$;
revoke all on function louvesync_private.guard_content_write() from public,anon,authenticated;

-- Replace permissive legacy writes on the tables used by this app. Social and
-- rehearsal actions retain ownership/assignment rules; catalog and scales are
-- leadership-only. Keys requested by members never write these tables directly.
do $$ declare t text; p record; ins text; upd text; del text;
  leader text:='(select louvesync_private.is_leader(louvesync_private.request_actor()))';
  actor text:='(select louvesync_private.request_actor()->>''id'')';
begin
  foreach t in array array['members','songs','events','event_songs','event_members','equipment','announcements','announcement_comments','announcement_reactions','announcement_saves','rehearsal_sessions','rehearsal_notes','rehearsal_takes'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    ins:=leader; upd:=leader; del:=leader;
    if t='members' then ins:='(select coalesce((louvesync_private.request_actor()->>''is_admin'')::boolean,false))'; upd:=ins; del:=ins;
    elsif t='event_members' then upd:=leader||' or member_id::text='||actor;
    elsif t='announcements' then ins:='created_by::text='||actor; upd:=leader||' or created_by::text='||actor; del:=upd;
    elsif t in ('announcement_comments','announcement_reactions','announcement_saves') then ins:='member_id::text='||actor; upd:=ins; del:=leader||' or member_id::text='||actor;
    elsif t in ('rehearsal_sessions','rehearsal_takes') then
      ins:=leader||' or exists(select 1 from public.event_members em where em.event_id::text='||quote_ident(t)||'.event_id::text and em.member_id::text='||actor||')';
      if t='rehearsal_sessions' then upd:=ins; end if;
    elsif t='rehearsal_notes' then
      ins:=leader||' or (updated_by::text='||actor||' and exists(select 1 from public.event_songs es join public.event_members em on em.event_id=es.event_id where es.song_id::text=rehearsal_notes.song_id::text and em.member_id::text='||actor||'))';
      upd:=leader||' or exists(select 1 from public.event_songs es join public.event_members em on em.event_id=es.event_id where es.song_id::text=rehearsal_notes.song_id::text and em.member_id::text='||actor||')';
    end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
    execute format('create policy louve_read on public.%I for select to anon,authenticated using(true)',t);
    execute format('create policy louve_insert on public.%I for insert to anon,authenticated with check(%s)',t,ins);
    execute format('create policy louve_update on public.%I for update to anon,authenticated using(%s) with check(%s)',t,upd,upd);
    execute format('create policy louve_delete on public.%I for delete to anon,authenticated using(%s)',t,del);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if t='members' then execute 'revoke all(pin) on public.members from public,anon,authenticated'; execute 'grant select(id,name,role,instrument,avatar,color,status,is_admin,vocal_category) on public.members to anon,authenticated';
    else execute format('grant select on public.%I to anon,authenticated',t); end if;
    execute format('grant insert,update,delete on public.%I to anon,authenticated',t);
    execute format('drop trigger if exists louve_guard_write on public.%I',t);
    execute format('create trigger louve_guard_write before insert or update or delete on public.%I for each row execute function louvesync_private.guard_content_write()',t);
    execute format('drop trigger if exists louve_audit_change on public.%I',t);
    execute format('create trigger louve_audit_change after insert or update or delete on public.%I for each row execute function louvesync_private.audit_change()',t);
  end loop;
  foreach t in array array['louvesync_attendance_sheets','louvesync_change_requests'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop trigger if exists louve_audit_change on public.%I',t);
    execute format('create trigger louve_audit_change after insert or update or delete on public.%I for each row execute function louvesync_private.audit_change()',t);
  end loop;
end; $$;

create or replace function louvesync_private.sequence_value(p_text text) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$begin
  if starts_with(p_text,'louvesync:v1:') then begin return substr(p_text,length('louvesync:v1:')+1)::jsonb; exception when invalid_text_representation then null; end; end if;
  return jsonb_build_object('text',coalesce(p_text,''),'key',null);
end; $$;
create or replace function louvesync_private.song_version(p_event text,p_song text) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('itemId',es.id::text,'songId',es.song_id,'title',s.title,'singerId',es.singer_member_id,'order',es.order_index,
    'sequence',es.sequence,'songKey',s.key,'vocalKeys',s.vocal_keys,'bpm',s.bpm,'timeSignature',s.time_signature,
    'key',coalesce(louvesync_private.sequence_value(es.sequence)->>'key',s.vocal_keys->>es.singer_member_id,s.key))
  from public.event_songs es join public.songs s on s.id=es.song_id where es.event_id::text=p_event and es.song_id::text=p_song;
$$;
revoke all on function louvesync_private.sequence_value(text),louvesync_private.song_version(text,text) from public,anon,authenticated;
create or replace function louvesync_private.clear_setlist_confirmation(p_event text) returns void
language plpgsql security definer set search_path=pg_catalog as $$declare r record; j jsonb; prefix text:='louvesync:event-preferences:v1:'; begin
  for r in select id,note_text from public.event_songs where event_id::text=p_event and item_type='note' and song_id is null and starts_with(note_text,prefix) for update loop
    begin j:=substr(r.note_text,length(prefix)+1)::jsonb; exception when invalid_text_representation then continue; end;
    if j ? 'setlist_confirmation' then update public.event_songs set note_text=prefix||(j||jsonb_build_object('setlist_confirmation',null))::text where id=r.id; end if;
  end loop;
end; $$;
revoke all on function louvesync_private.clear_setlist_confirmation(text) from public,anon,authenticated;

create or replace function louvesync_private.changes(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  a jsonb:=louvesync_private.set_actor(p_payload); lead boolean:=louvesync_private.is_leader(a);
  action text:=p_payload->>'action'; ev text:=nullif(p_payload->>'eventId',''); sid text:=p_payload->>'songId'; kind text:=p_payload->>'kind';
  proposed jsonb:=coalesce(p_payload->'proposal','{}'); old_value jsonb; current_value jsonb; result jsonb; r public.louvesync_change_requests%rowtype;
  v_id uuid; v_reason text:=btrim(p_payload->>'reason'); v_note text:=btrim(coalesce(p_payload->>'decisionNote','')); total integer; more boolean; cursor_id bigint; request_cursor uuid;
  k text; cols text; assigns text; seq jsonb;
begin
  if action='audit' then
    if not lead then raise exception 'Histórico exclusivo da liderança.' using errcode='42501'; end if;
    cursor_id:=coalesce((p_payload->>'beforeId')::bigint,9223372036854775807);
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('id',x.id::text) order by x.id desc),'[]'::jsonb) into result from
      (select * from public.louvesync_app_audit where (ev is null or event_id=ev) and id<cursor_id order by id desc limit 51) x;
    more:=jsonb_array_length(result)>50;
    if more then result:=result-50; end if;
    return jsonb_build_object('ok',true,'entries',result,'hasMore',more,'serverTime',clock_timestamp());
  end if;
  if action='list' then
    request_cursor:=nullif(p_payload->>'beforeRequest','')::uuid;
    select count(*) into total from public.louvesync_change_requests where status='pending' and (ev is null or event_id=ev) and (lead or actor_id=a->>'id');
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into result from
      (select * from public.louvesync_change_requests where (ev is null or event_id=ev) and (lead or actor_id=a->>'id')
        and (coalesce(p_payload->>'status','all')<>'pending' or status='pending')
        and (request_cursor is null or (created_at,id)<(select created_at,id from public.louvesync_change_requests where id=request_cursor and (lead or actor_id=a->>'id')))
        order by created_at desc,id desc limit 51) x;
    more:=jsonb_array_length(result)>50; if more then result:=result-50; end if;
    return jsonb_build_object('ok',true,'requests',result,'pendingCount',total,'hasMore',more,'serverTime',clock_timestamp());
  end if;
  if action='request' then
    if kind is null or kind not in ('key','song','song_edit','song_create') or coalesce(length(sid),0) not between 1 and 128 or coalesce(length(v_reason),0) not between 1 and 500 or jsonb_typeof(proposed)<>'object' or length(proposed::text)>200000 then raise exception 'Solicitação inválida.' using errcode='22023'; end if;
    if kind in ('key','song') then
      perform 1 from public.events where id::text=ev and type is distinct from 'ensaio' for share;
      if not found then raise exception 'Evento não encontrado ou sem repertório próprio.' using errcode='P0002'; end if;
      old_value:=louvesync_private.song_version(ev,sid);
      if old_value is null then raise exception 'A música não está mais neste evento.' using errcode='40001'; end if;
      if kind='key' then
        if not lead and (old_value->>'singerId' is distinct from a->>'id' or not exists(select 1 from public.event_members where event_id::text=ev and member_id::text=a->>'id')) then raise exception 'Você só pode solicitar seu tom quando estiver escalado como vocal desta música.' using errcode='42501'; end if;
        if coalesce(proposed->>'key','') !~ '^[A-G](#|b)?m?$' or proposed->>'key'=old_value->>'key' then raise exception 'Escolha um novo tom válido.' using errcode='22023'; end if;
        proposed:=jsonb_build_object('key',proposed->>'key');
      else
        if not exists(select 1 from public.songs where id::text=proposed->>'songId') then raise exception 'Selecione uma música do repertório.' using errcode='22023'; end if;
        if exists(select 1 from public.event_songs where event_id::text=ev and song_id::text=proposed->>'songId') then raise exception 'Esta música já faz parte do evento.' using errcode='22023'; end if;
        select jsonb_build_object('songId',id,'title',title) into proposed from public.songs where id::text=proposed->>'songId';
      end if;
    else
      ev:=null;
      select to_jsonb(s) into old_value from public.songs s where id::text=sid;
      if kind='song_create' and old_value is not null then raise exception 'A música já existe. Solicite uma edição.' using errcode='40001'; end if;
      if kind='song_edit' and old_value is null then raise exception 'Música não encontrada.' using errcode='P0002'; end if;
      for k in select jsonb_object_keys(proposed) loop
        if k not in ('title','artist','cat','bpm','time_signature','tags','yturl','media_url','lyrics') and not (kind='song_create' and k='key') then raise exception 'Campo não permitido na solicitação.' using errcode='42501'; end if;
      end loop;
      if not (proposed ? 'title') or coalesce(length(btrim(proposed->>'title')),0) not between 1 and 255 then raise exception 'Informe o título da música.' using errcode='22023'; end if;
      if kind='song_create' and coalesce(proposed->>'key','') !~ '^[A-G](#|b)?m?$' then raise exception 'Informe o tom original.' using errcode='22023'; end if;
      if kind='song_edit' and not exists(select 1 from jsonb_each(proposed) e where old_value->e.key is distinct from e.value) then raise exception 'Não há alterações para solicitar.' using errcode='22023'; end if;
      old_value:=coalesce(old_value,'{}');
    end if;
    v_id:=coalesce(nullif(p_payload->>'requestId','')::uuid,gen_random_uuid());
    if exists(select 1 from public.louvesync_change_requests where id=v_id) then
      select * into r from public.louvesync_change_requests where id=v_id;
      if r.actor_id is distinct from a->>'id' or r.kind<>kind or r.proposal<>proposed or r.source_song_id<>sid or r.event_id is distinct from ev then raise exception 'Identificador de solicitação já usado.' using errcode='40001'; end if;
      return jsonb_build_object('ok',true,'request',to_jsonb(r));
    end if;
    perform set_config('louvesync.change_request',v_id::text,true);
    insert into public.louvesync_change_requests(id,event_id,actor_id,actor_name,kind,source_song_id,source_item_id,proposal,before_record,reason)
      values(v_id,ev,a->>'id',a->>'name',kind,sid,old_value->>'itemId',proposed,old_value,v_reason) returning * into r;
    return jsonb_build_object('ok',true,'request',to_jsonb(r));
  end if;
  if action not in ('decide','cancel') or coalesce(length(p_payload->>'requestId'),0)=0 then raise exception 'Ação inválida.' using errcode='22023'; end if;
  select * into r from public.louvesync_change_requests where id=(p_payload->>'requestId')::uuid;
  if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
  if action='decide' and not lead then raise exception 'Somente a liderança pode decidir solicitações.' using errcode='42501'; end if;
  if action='cancel' and r.actor_id is distinct from a->>'id' then raise exception 'Cancele apenas suas solicitações.' using errcode='42501'; end if;
  if r.event_id is not null then perform 1 from public.events where id::text=r.event_id for update; end if;
  select * into r from public.louvesync_change_requests where id=r.id for update;
  if r.status<>'pending' then raise exception 'Esta solicitação já foi decidida. Atualize a lista.' using errcode='40001'; end if;
  if action='decide' and coalesce(p_payload->>'decision','') not in ('approved','rejected') then raise exception 'Decisão inválida.' using errcode='22023'; end if;
  if length(v_note)>500 then raise exception 'Observação muito longa.' using errcode='22023'; end if;
  perform set_config('louvesync.change_request',r.id::text,true);
  if action='decide' and p_payload->>'decision'='approved' then
    if r.kind in ('key','song') then
      current_value:=louvesync_private.song_version(r.event_id,r.source_song_id);
      if current_value is distinct from r.before_record then raise exception 'O repertório mudou desde o pedido. Revise a escala antes de aprovar.' using errcode='40001'; end if;
      if r.kind='key' then
        if not exists(select 1 from public.members where id::text=r.actor_id and lower(coalesce(nullif(status,''),'ativo')) in ('ativo','ativa','active')) or not exists(select 1 from public.event_members where event_id::text=r.event_id and member_id::text=r.before_record->>'singerId') then raise exception 'O vocal não está mais nesta escala.' using errcode='40001'; end if;
        seq:=louvesync_private.sequence_value(r.before_record->>'sequence');
        update public.event_songs set sequence='louvesync:v1:'||jsonb_build_object('text',coalesce(seq->>'text',''),'key',r.proposal->>'key')::text where id::text=r.source_item_id and event_id::text=r.event_id;
      else
        if exists(select 1 from public.event_songs where event_id::text=r.event_id and song_id::text=r.proposal->>'songId') then raise exception 'A música solicitada já está neste evento.' using errcode='40001'; end if;
        if not exists(select 1 from public.songs where id::text=r.proposal->>'songId') then raise exception 'A música solicitada não está mais no repertório.' using errcode='40001'; end if;
        update public.event_songs set song_id=r.proposal->>'songId',sequence=null where id::text=r.source_item_id and event_id::text=r.event_id;
      end if;
      perform louvesync_private.clear_setlist_confirmation(r.event_id);
    elsif r.kind='song_create' then
      if exists(select 1 from public.songs where id::text=r.source_song_id) then raise exception 'A música já foi cadastrada. Atualize antes de aprovar.' using errcode='40001'; end if;
      insert into public.songs(id,title,artist,cat,key,bpm,time_signature,tags,yturl,media_url,lyrics,vocal_keys,created_by)
        values(r.source_song_id,r.proposal->>'title',r.proposal->>'artist',r.proposal->>'cat',r.proposal->>'key',(r.proposal->>'bpm')::integer,r.proposal->>'time_signature',
          array(select jsonb_array_elements_text(coalesce(r.proposal->'tags','[]'))),r.proposal->>'yturl',r.proposal->>'media_url',r.proposal->>'lyrics','{}',r.actor_id);
    else
      select to_jsonb(s) into current_value from public.songs s where id::text=r.source_song_id for update;
      if current_value is distinct from r.before_record then raise exception 'A música mudou desde o pedido. Revise antes de aprovar.' using errcode='40001'; end if;
      select string_agg(format('%I',key),',' order by key),string_agg(format('%I=x.%I',key,key),',' order by key) into cols,assigns from jsonb_object_keys(r.proposal) key;
      execute format('update public.songs s set %s from jsonb_populate_record(null::public.songs,$1) x where s.id::text=$2',assigns) using current_value||r.proposal,r.source_song_id;
    end if;
  end if;
  update public.louvesync_change_requests set status=case when action='cancel' then 'cancelled' else p_payload->>'decision' end,
    decided_at=clock_timestamp(),decided_by=a->>'id',decided_name=a->>'name',decision_note=v_note where id=r.id returning * into r;
  return jsonb_build_object('ok',true,'request',to_jsonb(r));
end; $$;
revoke all on function louvesync_private.changes(jsonb) from public;
grant execute on function louvesync_private.changes(jsonb) to anon,authenticated;
create or replace function public.louvesync_changes(p_payload jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select louvesync_private.changes(p_payload);$$;
revoke all on function public.louvesync_changes(jsonb) from public;
grant execute on function public.louvesync_changes(jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
