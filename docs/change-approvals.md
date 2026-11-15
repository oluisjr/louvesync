# Solicitações, permissões e histórico

Os detalhes dos eventos têm a arte 3D aprovada, ações de compartilhamento agrupadas, participação, equipe e abas para setlist, solicitações e histórico. **Mais → Solicitações** reúne os pedidos de todos os eventos e do catálogo. O histórico do app é exclusivo da liderança.

Um membro pode propor substituições por músicas já cadastradas. Para pedir outro tom, precisa constar na equipe do evento e estar vinculado como vocal principal daquela música. A aprovação muda somente o tom naquele evento, preservando o arranjo, o tom original e os tons dos outros vocais. Edições e cadastros do catálogo feitos por membros também são propostas. Alterações em vínculos da equipe, ordem, eventos e patrimônio são restritas à liderança; administração de membros continua exclusiva dos administradores. Comentários, comunicados próprios, respostas à escala e colaboração nos ensaios mantêm as regras de autoria e participação.

Pedidos não alteram o repertório vigente. A liderança aprova ou recusa; o autor pode cancelar um pedido pendente. Aprovar uma troca no evento aplica a mudança e retira a confirmação do setlist na mesma transação. O líder revisa e confirma a nova versão. Se música, vocal ou arranjo mudaram desde o pedido, a aprovação é bloqueada e exige nova revisão. Duas decisões concorrentes não podem aplicar o mesmo pedido duas vezes.

## Banco e autenticação

A migração `*_event_change_approval_and_audit.sql` cria `louvesync_change_requests` e `louvesync_app_audit`, além das funções privadas e políticas de RLS. `louvesync_changes` é o acesso controlado a solicitações e logs. O servidor identifica o membro pelo PIN persistido; cargos e nomes enviados pelo navegador não concedem privilégios. Os transportes web, APK e API usam a mesma autorização. O build não executa migrações.

O login permanece por membro/PIN e passa a ser validado por `louvesync_login`, com limite de tentativas. PINs não são retornados na lista pública de membros, em arquivos de demonstração, perfis ou logs. Apenas a credencial do usuário que entrou é mantida no dispositivo para as chamadas autenticadas, e é removida ao sair. Sessões antigas sem essa credencial precisam entrar novamente. O editor de membros permite redefinir um PIN sem consultar ou preencher o PIN atual. Esta mudança não redefine os PINs existentes.

As políticas são aplicadas no banco, inclusive para gravações diretas pela API pública. Cabeçalhos `x-louvesync-member` e `x-louvesync-pin` identificam as operações REST; são enviados apenas ao endpoint REST do projeto Supabase. RPCs também validam as credenciais no corpo. Chaves de serviço não são usadas no frontend nem para decidir pedidos.

Triggers registram as próximas inserções, alterações e exclusões nas tabelas do app, incluindo músicas, eventos, setlists, equipe, membros, patrimônio, mural, ensaio, chamadas e solicitações. Os logs guardam autor, horário do servidor, entidade, campos e valores anteriores/novos, sem valores de PIN. O vínculo com a solicitação permite conferir a aprovação. As tabelas de logs não aceitam alterações por membros ou líderes e só podem ser consultadas pela função autorizada. Operações internas sem usuário são identificadas como Sistema. O histórico não reconstrói alterações anteriores à migração.

## Verificação

`npm run test:changes:sql` usa PostgreSQL descartável com PGlite e o papel `anon`: testa bloqueio de gravações diretas, leitura de PINs, vocal correto, aprovação, recusa, cancelamento, conflito de versão, preservação do setlist e autoria dos logs. Os testes unitários verificam os transportes, respostas e sanitização. Os testes de navegador usam a interface real e a função SQL real em um banco descartável para submeter, aprovar, recusar e cancelar pedidos, sem modificar os registros reais da igreja. Capturas cobrem 320/390 px e os dois temas; testes nativos simulados não substituem a conferência em aparelho físico.
