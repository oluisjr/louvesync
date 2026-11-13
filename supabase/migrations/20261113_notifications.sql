-- Durable inbox and Web Push. Reuses the current members/PIN login unchanged.
-- Run once in the Supabase SQL Editor, after reviewing this migration.
begin;

create table if not exists public.louvesync_notifications (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  kind text not null check (kind in ('event_changed','song_added','attendance_declined')),
  target_id text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique(member_id,dedupe_key)
);
create index if not exists louvesync_notifications_member on public.louvesync_notifications(member_id,created_at desc);

create table if not exists public.louvesync_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  endpoint text not null unique,
  keys jsonb not null,
  device_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.louvesync_notification_event_state (
  event_id text primary key,
  snapshot jsonb not null,
  fingerprint text not null,
  revision bigint not null default 0
);
create table if not exists public.louvesync_notification_event_queue (
  event_id text primary key,
  ready_at timestamptz not null
);
create table if not exists public.louvesync_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.louvesync_notifications(id) on delete cascade,
  subscription_id uuid not null references public.louvesync_push_subscriptions(id) on delete cascade,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_token uuid,
  claimed_until timestamptz,
  sent_at timestamptz,
  last_error text,
  unique(notification_id,subscription_id)
);
create index if not exists louvesync_push_pending on public.louvesync_push_deliveries(next_attempt_at) where sent_at is null;

alter table public.louvesync_notifications enable row level security;
alter table public.louvesync_push_subscriptions enable row level security;
alter table public.louvesync_notification_event_state enable row level security;
alter table public.louvesync_notification_event_queue enable row level security;
alter table public.louvesync_push_deliveries enable row level security;
revoke all on public.louvesync_notifications,public.louvesync_push_subscriptions,public.louvesync_notification_event_state,public.louvesync_notification_event_queue,public.louvesync_push_deliveries from public,anon,authenticated;

create or replace function public.louvesync_notification_leader(p_member jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select coalesce((p_member->>'is_admin')::boolean,false) or
    translate(lower(coalesce(p_member->>'role','')),'áàâãéêíóôõúüç','aaaaeeiooouuc') ~ '\mlider\M.*\mlouvor\M';
$$;
create or replace function public.louvesync_notification_active(p_member jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select p_member->>'status' is null or lower(p_member->>'status') in ('ativo','ativa','active');
$$;
create or replace function public.louvesync_notification_snapshot(p_id text)
returns jsonb language sql security definer set search_path=pg_catalog as $$
  select jsonb_build_object(
    'event',(select jsonb_build_object('label',to_jsonb(e)->>'label','date',to_jsonb(e)->>'date','time',to_jsonb(e)->>'time','type',to_jsonb(e)->>'type','theme',to_jsonb(e)->>'theme') from public.events e where e.id::text=p_id),
    'songs',coalesce((select jsonb_agg(to_jsonb(s)-'id'-'event_id'-'created_at'-'updated_at' order by s.order_index,s.song_id::text) from public.event_songs s where s.event_id::text=p_id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(m.member_id::text order by m.member_id::text) from public.event_members m where m.event_id::text=p_id),'[]'::jsonb)
  );
$$;

-- This trigger records committed state changes, including offline queue replay.
-- The worker coalesces a multi-request event save and compares final snapshots.
create or replace function public.louvesync_notification_change()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_id text;
  v_event jsonb;
  v_name text;
  v_member text;
  v_url text;
  v_key text;
begin
  if tg_table_name='songs' then
    if tg_op='INSERT' then
      v_id:=new.id::text;
      v_url:='/?tab=repertorio';
      insert into public.louvesync_notifications(member_id,kind,target_id,title,body,url,dedupe_key)
        select m.id::text,'song_added',v_id,'Nova música no repertório',left(coalesce(to_jsonb(new)->>'title','Uma nova música')||' foi adicionada ao repertório.',600),v_url,'song:'||v_id
        from public.members m
        where public.louvesync_notification_active(to_jsonb(m)) and not public.louvesync_notification_leader(to_jsonb(m))
          and m.id::text is distinct from to_jsonb(new)->>'created_by'
        on conflict(member_id,dedupe_key) do nothing;
    end if;
    return new;
  end if;
  if tg_table_name='events' then
    v_id:=case when tg_op='DELETE' then old.id::text else new.id::text end;
  else
    v_id:=case when tg_op='DELETE' then old.event_id::text else new.event_id::text end;
  end if;
  if tg_table_name='event_members' then
    if tg_op in ('INSERT','UPDATE') and new.confirmed=false and (tg_op='INSERT' or old.confirmed is distinct from false) then
      v_member:=new.member_id::text;
      select to_jsonb(e) into v_event from public.events e where e.id::text=v_id;
      select m.name into v_name from public.members m where m.id::text=v_member;
      if v_event is not null then
        v_key:='decline:'||gen_random_uuid()::text;
        v_url:='/?tab=escala';
        if v_id ~ '^[A-Za-z0-9_-]{1,128}$' then v_url:=v_url||'&event='||v_id; end if;
        insert into public.louvesync_notifications(member_id,kind,target_id,title,body,url,dedupe_key)
          select m.id::text,'attendance_declined',v_id,'Ausência na escala',left(coalesce(v_name,'Um integrante')||' não poderá participar de '||coalesce(v_event->>'label','um evento')||'.',600),v_url,v_key
          from public.members m where public.louvesync_notification_active(to_jsonb(m)) and public.louvesync_notification_leader(to_jsonb(m)) and m.id::text<>v_member
          on conflict(member_id,dedupe_key) do nothing;
      end if;
    end if;
    -- A presence confirmation is not an edit of the schedule.
    if tg_op='UPDATE' and (to_jsonb(new)-'confirmed'-'created_at'-'updated_at')=(to_jsonb(old)-'confirmed'-'created_at'-'updated_at') then return new; end if;
  end if;
  insert into public.louvesync_notification_event_queue(event_id,ready_at) values(v_id,clock_timestamp()+interval '1 second')
    on conflict(event_id) do update set ready_at=excluded.ready_at;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.louvesync_notifications(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_member text:=p_payload->>'memberId';
  v_action text:=p_payload->>'action';
  v_now timestamptz:=clock_timestamp();
  v_result jsonb;
  v_subscription jsonb;
  v_endpoint text;
  v_host text;
begin
  if coalesce(p_payload->>'pin','')='' or not exists(select 1 from public.members m where m.id::text=v_member and m.pin::text=p_payload->>'pin') then
    raise exception 'Sessão inválida.' using errcode='28000';
  end if;
  if v_action='list' then
    -- Reading one's own inbox can materialize committed schedule notices even
    -- before optional Web Push credentials are configured. No delivery keys
    -- or other members' inboxes are returned by this authenticated function.
    perform public.louvesync_notification_worker('{"action":"drain","inboxOnly":true}'::jsonb);
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into v_result from (
      select n.id,n.kind as type,n.target_id as "targetId",n.title,n.body,n.url,n.created_at,n.read_at
      from public.louvesync_notifications n where n.member_id=v_member order by n.created_at desc limit 100
    ) t;
    return jsonb_build_object('ok',true,'items',v_result,'serverTime',v_now);
  elsif v_action='mark_read' then
    if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids')>100 then raise exception 'Solicitação inválida.' using errcode='22023'; end if;
    update public.louvesync_notifications set read_at=coalesce(read_at,v_now)
      where member_id=v_member and id in(select value::uuid from jsonb_array_elements_text(p_payload->'ids'));
  elsif v_action='subscribe' then
    v_subscription:=p_payload->'subscription'; v_endpoint:=v_subscription->>'endpoint';
    v_host:=substring(v_endpoint from '^https://([^/:?#]+)');
    if length(v_endpoint)>2048 or v_endpoint !~ '^https://[^/@:?#]+/[^#[:space:]]+$' or not (
      v_host in ('fcm.googleapis.com','fcm-notification.googleapis.com','web.push.apple.com') or v_host like '%.push.services.mozilla.com' or v_host like '%.notify.windows.com'
    ) or coalesce(v_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87,88}={0,2}$' or coalesce(v_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then
      raise exception 'Inscrição inválida.' using errcode='22023';
    end if;
    insert into public.louvesync_push_subscriptions as current_subscription(member_id,endpoint,keys,device_id)
      values(v_member,v_endpoint,v_subscription->'keys',nullif(p_payload->>'deviceId','')::uuid)
      on conflict(endpoint) do update set member_id=excluded.member_id,keys=excluded.keys,device_id=excluded.device_id,active=true,updated_at=v_now,
        created_at=case when current_subscription.member_id=excluded.member_id then current_subscription.created_at else v_now end;
  elsif v_action='unsubscribe' then
    delete from public.louvesync_push_subscriptions where member_id=v_member and endpoint=p_payload->>'endpoint';
  elsif v_action not in ('config','dispatch') then
    raise exception 'Ação inválida.' using errcode='22023';
  end if;
  return jsonb_build_object('ok',true,'serverTime',v_now);
end;
$$;

-- Private worker: only the Vercel service-role credential can see subscriptions
-- belonging to other members, materialize recipients or acknowledge deliveries.
create or replace function public.louvesync_notification_worker(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_action text:=p_payload->>'action';
  v_job record;
  v_state public.louvesync_notification_event_state%rowtype;
  v_snapshot jsonb;
  v_hash text;
  v_revision bigint;
  v_label text;
  v_url text;
  v_recipient record;
  v_delivery record;
  v_deliveries jsonb:='[]'::jsonb;
  v_claim uuid;
  v_status text;
  v_limit integer:=greatest(1,least(20,coalesce((p_payload->>'limit')::integer,20)));
  v_now timestamptz:=clock_timestamp();
begin
  if v_action='complete' then
    select * into v_delivery from public.louvesync_push_deliveries where id=(p_payload->>'deliveryId')::uuid and claim_token=(p_payload->>'claimToken')::uuid for update;
    if not found then return jsonb_build_object('ok',true); end if;
    v_status:=p_payload->>'status';
    if v_status='expired' then delete from public.louvesync_push_subscriptions where id=v_delivery.subscription_id;
    elsif v_status='sent' then update public.louvesync_push_deliveries set sent_at=v_now,claimed_until=null,claim_token=null,last_error=null where id=v_delivery.id;
    elsif v_status='retry' then update public.louvesync_push_deliveries set claimed_until=null,claim_token=null,next_attempt_at=v_now+make_interval(secs=>least(3600,30*power(2,greatest(0,attempts-1)))::integer),last_error=left(p_payload->>'errorCode',80) where id=v_delivery.id;
    else raise exception 'Estado inválido.' using errcode='22023'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if v_action<>'drain' then raise exception 'Ação inválida.' using errcode='22023'; end if;
  for v_job in select * from public.louvesync_notification_event_queue where ready_at<=v_now order by ready_at limit 100 for update skip locked loop
    v_snapshot:=public.louvesync_notification_snapshot(v_job.event_id);
    v_hash:=md5(v_snapshot::text);
    select * into v_state from public.louvesync_notification_event_state where event_id=v_job.event_id for update;
    if v_state.fingerprint is distinct from v_hash then
      v_revision:=coalesce(v_state.revision,0)+1;
      v_label:=coalesce(v_snapshot->'event'->>'label',v_state.snapshot->'event'->>'label','Evento');
      v_url:='/?tab=escala';
      if v_job.event_id ~ '^[A-Za-z0-9_-]{1,128}$' then v_url:=v_url||'&event='||v_job.event_id; end if;
      for v_recipient in
        select m.id::text as member_id from public.members m
        where public.louvesync_notification_active(to_jsonb(m)) and not public.louvesync_notification_leader(to_jsonb(m))
          and (v_snapshot->'members' ? m.id::text or coalesce(v_state.snapshot->'members','[]'::jsonb) ? m.id::text)
      loop
        insert into public.louvesync_notifications(member_id,kind,target_id,title,body,url,dedupe_key)
          values(v_recipient.member_id,'event_changed',v_job.event_id,'Escala atualizada',left(case
            when v_snapshot->'event'='null'::jsonb then v_label||' foi cancelado. Confira sua escala.'
            when not(v_snapshot->'members' ? v_recipient.member_id) then 'Você não está mais escalado para '||v_label||'.'
            else 'A escala de '||v_label||' foi atualizada. Confira músicas, horário e equipe.' end,600),v_url,'event:'||v_job.event_id||':'||v_revision::text)
          on conflict(member_id,dedupe_key) do nothing;
      end loop;
      insert into public.louvesync_notification_event_state(event_id,snapshot,fingerprint,revision) values(v_job.event_id,v_snapshot,v_hash,v_revision)
        on conflict(event_id) do update set snapshot=excluded.snapshot,fingerprint=excluded.fingerprint,revision=excluded.revision;
    end if;
    delete from public.louvesync_notification_event_queue where event_id=v_job.event_id;
  end loop;
  if coalesce((p_payload->>'inboxOnly')::boolean,false) then return jsonb_build_object('ok',true,'deliveries','[]'::jsonb); end if;
  insert into public.louvesync_push_deliveries(notification_id,subscription_id,next_attempt_at)
    select n.id,s.id,v_now from public.louvesync_notifications n join public.louvesync_push_subscriptions s on s.member_id=n.member_id and s.active and n.created_at>=s.created_at
    where n.created_at>=v_now-interval '7 days'
    on conflict(notification_id,subscription_id) do nothing;
  for v_delivery in
    select d.*,s.endpoint,s.keys,n.title,n.body,n.url,n.kind,n.target_id
      from public.louvesync_push_deliveries d join public.louvesync_push_subscriptions s on s.id=d.subscription_id and s.active
      join public.louvesync_notifications n on n.id=d.notification_id
      where d.sent_at is null and d.attempts<6 and d.next_attempt_at<=v_now and (d.claimed_until is null or d.claimed_until<=v_now)
      order by d.next_attempt_at limit v_limit for update of d skip locked
  loop
    v_claim:=gen_random_uuid();
    update public.louvesync_push_deliveries set claim_token=v_claim,claimed_until=v_now+interval '90 seconds',attempts=attempts+1 where id=v_delivery.id;
    v_deliveries:=v_deliveries||jsonb_build_array(jsonb_build_object('deliveryId',v_delivery.id,'claimToken',v_claim,'subscription',jsonb_build_object('endpoint',v_delivery.endpoint,'keys',v_delivery.keys),'notification',jsonb_build_object('id',v_delivery.notification_id,'title',v_delivery.title,'body',v_delivery.body,'url',v_delivery.url,'type',v_delivery.kind,'targetId',v_delivery.target_id)));
  end loop;
  return jsonb_build_object('ok',true,'deliveries',v_deliveries);
end;
$$;

-- Baseline existing events without notifying everyone during activation.
insert into public.louvesync_notification_event_state(event_id,snapshot,fingerprint)
  select e.id::text,s.value,md5(s.value::text) from public.events e cross join lateral(select public.louvesync_notification_snapshot(e.id::text) as value) s
  on conflict(event_id) do nothing;

drop trigger if exists louvesync_notifications_events on public.events;
create trigger louvesync_notifications_events after insert or update or delete on public.events for each row execute function public.louvesync_notification_change();
drop trigger if exists louvesync_notifications_songs on public.songs;
create trigger louvesync_notifications_songs after insert on public.songs for each row execute function public.louvesync_notification_change();
drop trigger if exists louvesync_notifications_items on public.event_songs;
create trigger louvesync_notifications_items after insert or update or delete on public.event_songs for each row execute function public.louvesync_notification_change();
drop trigger if exists louvesync_notifications_members on public.event_members;
create trigger louvesync_notifications_members after insert or update or delete on public.event_members for each row execute function public.louvesync_notification_change();

revoke all on function public.louvesync_notification_leader(jsonb),public.louvesync_notification_active(jsonb),public.louvesync_notification_snapshot(text),public.louvesync_notification_change() from public,anon,authenticated;
revoke all on function public.louvesync_notifications(jsonb) from public;
grant execute on function public.louvesync_notifications(jsonb) to anon,authenticated;
revoke all on function public.louvesync_notification_worker(jsonb) from public,anon,authenticated;
grant execute on function public.louvesync_notification_worker(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
