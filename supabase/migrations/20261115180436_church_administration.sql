begin;
create or replace function louvesync_private.community_admin(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a jsonb:=louvesync_private.resolve_actor(p_payload->>'memberId',p_payload->>'pin'); act text:=p_payload->>'action'; e jsonb:=p_payload->'event'; ev public.louvesync_church_events%rowtype; pr public.louvesync_prayer_requests%rowtype; was jsonb; metadata jsonb;
begin
 if a is null or not coalesce((a->>'is_admin')::boolean,false) or a->>'access_type'='church_member' then raise exception 'Acesso restrito à administração.' using errcode='28000'; end if;
 if act='admin_list' then
  return jsonb_build_object('ok',true,'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc),'[]') from (select * from public.louvesync_church_events order by starts_at desc limit 500) x),'prayers',(select coalesce(jsonb_agg(to_jsonb(x)-'ip_hash' order by x.created_at desc),'[]') from (select * from public.louvesync_prayer_requests order by created_at desc limit 200) x));
 elsif act='save_event' then
  select * into ev from public.louvesync_church_events where id=(e->>'id')::uuid for update;
  if found and ev.updated_at is distinct from (e->>'updated_at')::timestamptz then raise exception 'O evento foi atualizado em outro aparelho. Recarregue antes de editar.' using errcode='40001'; end if;
  was:=case when ev.id is not null then jsonb_build_object('published',ev.published) end;
  insert into public.louvesync_church_events(id,title,description,starts_at,ends_at,location,category,published,created_by)
  values((e->>'id')::uuid,btrim(e->>'title'),btrim(coalesce(e->>'description','')),(e->>'starts_at')::timestamptz,nullif(e->>'ends_at','')::timestamptz,btrim(coalesce(e->>'location','')),e->>'category',coalesce((e->>'published')::boolean,false),a->>'id')
  on conflict(id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,category=excluded.category,published=excluded.published,updated_at=clock_timestamp() returning * into ev;
  metadata:=jsonb_build_object('published',ev.published);
  insert into public.louvesync_app_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,before_record,after_record,changed_fields) values(a->>'id',a->>'name',a->>'role','church_events',ev.id::text,case when was is null then 'INSERT' else 'UPDATE' end,was,metadata,array['event']);
  return jsonb_build_object('ok',true,'event',to_jsonb(ev));
 elsif act='review_prayer' then
  select * into pr from public.louvesync_prayer_requests where id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if pr.reviewed_at is distinct from (p_payload->>'reviewed_at')::timestamptz then raise exception 'O pedido já foi atualizado. Recarregue a lista.' using errcode='40001'; end if;
  was:=jsonb_build_object('status',pr.status,'published',pr.published);
  if coalesce((p_payload->>'published')::boolean,false) and pr.visibility<>'community' then raise exception 'O autor não autorizou compartilhar este pedido.' using errcode='42501'; end if;
  update public.louvesync_prayer_requests set status=p_payload->>'status',published=coalesce((p_payload->>'published')::boolean,false),reviewed_by=a->>'id',reviewed_at=clock_timestamp() where id=pr.id returning * into pr;
  metadata:=jsonb_build_object('status',pr.status,'published',pr.published);
  insert into public.louvesync_app_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,before_record,after_record,changed_fields) values(a->>'id',a->>'name',a->>'role','prayer_requests',pr.id::text,'UPDATE',was,metadata,array['status','published']);
  return jsonb_build_object('ok',true,'prayer',to_jsonb(pr)-'ip_hash');
 end if;
 raise exception 'Ação inválida.' using errcode='22023';
end; $$;
revoke all on function louvesync_private.community_admin(jsonb) from public,anon,authenticated;
grant usage on schema louvesync_private to service_role;
grant execute on function louvesync_private.community_admin(jsonb) to service_role;
create or replace function public.louvesync_community_admin(p_payload jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select louvesync_private.community_admin(p_payload);$$;
revoke all on function public.louvesync_community_admin(jsonb) from public,anon,authenticated;
grant execute on function public.louvesync_community_admin(jsonb) to service_role;
commit;
