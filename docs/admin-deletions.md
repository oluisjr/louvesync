# Exclusão exclusiva do administrador

Execute [`20261113_admin_deletions.sql`](../supabase/migrations/20261113_admin_deletions.sql) no SQL Editor do Supabase. A instalação é idempotente e mantém o login por membro/PIN.

O app envia `POST /api/admin-delete` com o tipo e o ID do conteúdo e as credenciais da sessão. O servidor chama `louvesync_admin_delete` usando as variáveis já usadas pelo monitoramento: `SUPABASE_URL`/`VITE_SUPABASE_URL` e `SUPABASE_ANON_KEY`/`VITE_SUPABASE_ANON_KEY`. Não é necessária uma service-role key para esta API.

A função consulta o membro no banco, confere o PIN e exige `is_admin = true`. Campos de privilégio enviados pelo navegador são ignorados. A exclusão dos vínculos e do conteúdo ocorre na mesma transação; uma falha reverte a operação. O app só remove o item da tela após confirmação.

A migração revoga `DELETE` direto em `songs` e `events` dos papéis públicos do navegador, mesmo que existam políticas permissivas de RLS. Não muda as permissões de `event_songs`/`event_members`, necessárias para a edição atual do setlist. O endpoint antigo `/api/delete-event` passa a usar a mesma verificação e exige um ID explícito; a exclusão em lote por data foi removida.

Se a função não estiver instalada, a exclusão falha com uma mensagem de ativação necessária. Não existe retorno à exclusão direta pelo navegador. A proteção no banco só começa após executar a migração.

Esta mudança reutiliza o modelo de identidade/PIN existente; não transforma PINs em contas do Supabase Auth. A confidencialidade das credenciais e as permissões de leitura/edição da tabela `members` continuam tendo os limites do login atual, documentados também em [monitoramento](admin-activity.md).

Validação local: `node --test tests/admin-deletions.test.js` cobre a API e o transporte; `node scripts/test_admin_deletions_sql.js` executa a migração e os cenários de autorização, idempotência e rollback em um PostgreSQL descartável, sem rede. O segundo comando requer Docker e a imagem `postgres:17-alpine`.
