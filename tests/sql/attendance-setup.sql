create role anon;
create role authenticated;
create table public.members(id text primary key,name text,pin text,is_admin boolean,role text,instrument text,status text);
create table public.events(id text primary key,label text,date text,time text,type text);
create table public.event_members(id bigint generated always as identity primary key,event_id text,member_id text,confirmed boolean);
insert into public.members values
  ('admin','Admin fixture','ADMIN_TEST_PIN',true,'Vocal','Vocal','ativo'),
  ('leader','Leader fixture','LEADER_TEST_PIN',false,'Líder de Louvor','Teclado','ativo'),
  ('member','Member fixture','MEMBER_TEST_PIN',false,'Vocal','Vocal','ativo'),
  ('inactive','Inactive leader','INACTIVE_TEST_PIN',true,'Líder de Louvor','Vocal','inativo');
insert into public.events values
  ('event','Culto anterior',((clock_timestamp() at time zone 'America/Sao_Paulo')::date-1)::text,'18:00','culto'),
  ('other','Outro culto',((clock_timestamp() at time zone 'America/Sao_Paulo')::date-1)::text,'19:00','culto'),
  ('future','Próximo culto',((clock_timestamp() at time zone 'America/Sao_Paulo')::date+1)::text,'18:00','culto'),
  ('empty','Sem equipe',((clock_timestamp() at time zone 'America/Sao_Paulo')::date)::text,'18:00','ensaio');
insert into public.event_members(event_id,member_id,confirmed) values
  ('event','admin',true),('event','member',false),('other','admin',null),('future','admin',true);
