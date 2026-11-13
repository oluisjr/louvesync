# Ativar notificações

O código mantém o login atual. A lista no sino usa credenciais de membro/PIN e dados persistidos no Supabase; notificações de demonstração foram removidas.

## Supabase

Execute `supabase/migrations/20261113_admin_deletions.sql` e `supabase/migrations/20261113_notifications.sql` no SQL Editor. Também estão reunidas em `supabase/activate-20261113.sql`. A instalação é idempotente; não apaga eventos, músicas ou membros. A proteção de exclusão no banco começa após instalar o primeiro script.

As notificações começam com as próximas alterações, sem avisos retroativos da instalação. Regras:

- Alterações significativas no evento, setlist, tom, vocal ou equipe avisam as pessoas escaladas. Quem foi removido recebe a informação de que deixou de estar escalado.
- Novas músicas avisam os membros ativos, exceto o autor e líderes/admin.
- Recusas de presença avisam somente administradores e membros cuja função seja Líder de Louvor. Confirmar presença não envia aviso. Repetir uma recusa já registrada não envia outro aviso.
- Administradores e líderes ficam fora dos avisos gerais, conforme solicitado.

O banco calcula os destinatários, compara a versão final do evento e agrupa as gravações próximas. Cada usuário consulta e marca somente seu próprio histórico. O aplicativo busca novidades ao reconectar e durante o uso; essa lista funciona mesmo antes de configurar o envio push.

## Vercel

Além das variáveis Supabase já usadas pelo app, configure na Vercel, em Production:

- `SUPABASE_SERVICE_ROLE_KEY`: chave de servidor do projeto Supabase. Não use prefixo `VITE_`.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: gere o conjunto uma vez com `node scripts/generate_push_keys.js /tmp/louvesync-push.env` e importe o arquivo nas variáveis do projeto. O comando não imprime as chaves e não sobrescreve um arquivo existente.
- Faça Redeploy depois de salvar as variáveis.

Apenas a chave pública VAPID chega ao navegador. A chave privada e a service-role permanecem no servidor. Mantenha o mesmo conjunto VAPID entre deploys; trocar as chaves exige reativar as inscrições dos aparelhos.

Depois, em cada aparelho: abra o sino → **Ativar notificações** → permita os avisos do navegador. No iPhone, isso exige iOS 16.4 ou posterior e o app adicionado à Tela de Início. Em navegadores compatíveis, o Web Push mostra o aviso com o app fechado. Android WebView/Capacitor sem suporte a Web Push mantém o histórico no sino; notificações nativas do APK exigem integração FCM própria, não são simuladas como ativadas.

As edições feitas no app disparam o envio com uma requisição que pode terminar após fechar a página. O dispositivo pode limitar a entrega por conectividade ou configurações do sistema. A fila mantém tentativas com intervalos crescentes, identifica inscrições vencidas (404/410) e usa identificadores estáveis para evitar empilhar o mesmo aviso. Enquanto houver um app aberto, a fila é revisitada a cada 20 segundos. Para garantir novas tentativas e alterações externas quando nenhum app estiver aberto, configure também um agendamento externo ou Vercel Cron que faça `GET /api/notifications?action=dispatch` com `Authorization: Bearer <CRON_SECRET>`. O arquivo privado gerado inclui esse segredo. A frequência depende do plano da Vercel; nenhum cron incompatível com o plano foi ativado automaticamente.

## Verificação e limites

`node scripts/test_notifications_sql.js` usa PostgreSQL descartável sem rede e verifica permissões, destinatários, deduplicação, alterações, inscrições e fila. Os testes da API simulam os serviços push; o envio real exige a instalação e as variáveis acima. Não foram acessadas contas externas para aplicar a migração ou configurar as chaves.

O login por PIN continua com os limites existentes de leitura/edição de membros. Esta implementação não introduz Supabase Auth e não transforma privilégios enviados pelo navegador em autoridade no banco.
