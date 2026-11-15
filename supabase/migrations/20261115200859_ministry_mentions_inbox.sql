begin;
alter table public.events add column if not exists notes text not null default '';
alter table public.events add column if not exists mention_member_ids text[] not null default '{}';
alter table public.announcements add column if not exists mention_member_ids text[] not null default '{}';
alter table public.announcement_comments add column if not exists mention_member_ids text[] not null default '{}';
do $$ declare t text; begin
 foreach t in array array['events','announcements','announcement_comments'] loop
  if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname='louve_mentions_valid') then
   execute format('alter table public.%I add constraint louve_mentions_valid check(cardinality(mention_member_ids)<=20 and array_position(mention_member_ids,null) is null)',t);
  end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.events'::regclass and conname='louve_event_notes_length') then alter table public.events add constraint louve_event_notes_length check(length(notes)<=4000);end if;
end; $$;
alter table public.louvesync_notifications drop constraint if exists louvesync_notifications_kind_check;
alter table public.louvesync_notifications add constraint louvesync_notifications_kind_check check(kind in ('event_changed','song_added','attendance_declined','mention'));

create or replace function louvesync_private.validate_mentions() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare previous text[]:=case when tg_op='UPDATE' then old.mention_member_ids else '{}'::text[] end; member_id text; actor jsonb;
begin
 if new.mention_member_ids=previous then return new;end if;
 actor:=coalesce(nullif(current_setting('louvesync.audit_actor',true),'')::jsonb,louvesync_private.request_actor());
 for member_id in select distinct id from unnest(new.mention_member_ids) id where not(id=any(previous)) loop
  if actor is null or coalesce(actor->>'access_type','ministry')<>'ministry' then raise exception 'Entre novamente para marcar integrantes.' using errcode='28000';end if;
  if not exists(select 1 from public.members m where m.id::text=member_id and coalesce(m.access_type,'ministry')='ministry' and public.louvesync_notification_active(to_jsonb(m))) then raise exception 'Marque apenas integrantes ativos do ministério.' using errcode='23514';end if;
 end loop;
 if tg_table_name='announcement_comments' and cardinality(new.mention_member_ids)>0 and not exists(select 1 from public.announcements where id::text=(to_jsonb(new)->>'post_id')) then raise exception 'O aviso não está mais disponível.' using errcode='23503';end if;
 return new;
end; $$;
revoke all on function louvesync_private.validate_mentions() from public,anon,authenticated;

create or replace function louvesync_private.notify_mentions() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare previous text[]:=case when tg_op='UPDATE' then old.mention_member_ids else '{}'::text[] end; actor jsonb; source_id text:=new.id::text; target text; title text; body text; link text; post_title text;
begin
 if new.mention_member_ids=previous then return null;end if;
 actor:=coalesce(nullif(current_setting('louvesync.audit_actor',true),'')::jsonb,louvesync_private.request_actor());
 if actor is null then return null;end if;
 if tg_table_name='events' then
  target:=source_id;title:='Você foi mencionado na escala';body:=coalesce(actor->>'name','Um integrante')||' marcou você em '||coalesce(new.label,'um evento')||'.';link:='/?tab=escala';
  if target ~ '^[A-Za-z0-9_-]{1,128}$' then link:=link||'&event='||target;end if;
 else
  target:=case when tg_table_name='announcements' then source_id else (to_jsonb(new)->>'post_id') end;
  if tg_table_name='announcements' then post_title:=new.title;else select a.title into post_title from public.announcements a where a.id::text=target;end if;
  title:=case when tg_table_name='announcements' then 'Você foi mencionado no mural' else 'Você foi mencionado em um comentário' end;
  body:=coalesce(actor->>'name','Um integrante')||' marcou você em '||coalesce(post_title,'um comunicado')||'.';link:='/?tab=mural';
  if target ~ '^[A-Za-z0-9_-]{1,128}$' then link:=link||'&post='||target;end if;
  if tg_table_name='announcement_comments' and source_id ~ '^[A-Za-z0-9_-]{1,128}$' then link:=link||'&comment='||source_id;end if;
 end if;
 insert into public.louvesync_notifications(member_id,kind,target_id,title,body,url,dedupe_key)
 select distinct m.id::text,'mention',target,title,left(body,600),link,'mention:'||tg_table_name||':'||source_id
 from public.members m where m.id::text=any(new.mention_member_ids) and not(m.id::text=any(previous)) and coalesce(m.access_type,'ministry')='ministry' and public.louvesync_notification_active(to_jsonb(m))
 on conflict(member_id,dedupe_key) do update set title=excluded.title,body=excluded.body,url=excluded.url,read_at=null,created_at=clock_timestamp();
 return null;
end; $$;
revoke all on function louvesync_private.notify_mentions() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['events','announcements','announcement_comments'] loop
  execute format('drop trigger if exists louve_mentions_validate on public.%I',t);
  execute format('create trigger louve_mentions_validate before insert or update on public.%I for each row execute function louvesync_private.validate_mentions()',t);
  execute format('drop trigger if exists louve_mentions_notify on public.%I',t);
  execute format('create trigger louve_mentions_notify after insert or update on public.%I for each row execute function louvesync_private.notify_mentions()',t);
 end loop;
end; $$;
commit;
