-- Somente consulta. Execute no SQL Editor do MESMO projeto usado pelo app.
-- Não grava visualizações nem retorna PINs ou chaves de API.

select
  to_regprocedure('public.louvesync_activity(jsonb)') is not null
    as funcao_de_visualizacoes_instalada,
  to_regclass('public.louvesync_content_views') is not null
    as historico_instalado;

-- Usa as credenciais dentro do banco, sem mostrá-las no resultado.
-- Se der erro, o SQL Editor mostra o código e o ponto da falha.
-- Resultado vazio indica ausência de administrador ou de eventos.
select public.louvesync_activity(jsonb_build_object(
  'action', 'viewers',
  'memberId', m.id::text,
  'pin', m.pin::text,
  'targetType', 'event',
  'targetId', e.id::text
)) as diagnostico_das_visualizacoes
from public.members m
cross join lateral (
  select id from public.events order by date desc limit 1
) e
where m.is_admin is true
limit 1;
