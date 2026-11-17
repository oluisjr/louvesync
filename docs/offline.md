# Uso offline

O usuário usa sempre a mesma ação Salvar. O aplicativo escolhe automaticamente o envio imediato ou o armazenamento no aparelho, com sincronização posterior. Na tela Presença há somente Salvar presença: marcações incompletas continuam pendentes, e a chamada fica completa quando todos são marcados. O registro salvo e o resumo do período são mantidos no cache tanto depois de um envio online quanto de um salvamento offline.

Abra o app com internet uma vez e aguarde o aviso de preparação terminar. O service worker baixa a interface, as ilustrações e a Bíblia Livre completa. Ao entrar em cada conta, o app prepara também seu conteúdo de trabalho. Vídeos e Spotify continuam online.

Reabrir o app continua mostrando a versão de visitante. O botão Fazer login abre a tela atual; contas anteriormente validadas podem desbloquear o conteúdo local com seu próprio PIN, verificado por PBKDF2 com salt. Um primeiro acesso, um novo cadastro ou um PIN ainda não confirmado no banco precisam da conexão inicial.

Músicas, escalas, respostas de participação, setlists, chamados de presença, solicitações, decisões, patrimônio, cadastros, mural, comentários, reações, avisos salvos, pedidos de oração e anotações recebem alterações locais. Os envios ficam identificados como pendentes. Aprovações, permissões e publicações para outras pessoas só valem após confirmação do servidor. Informações sobre outras pessoas mostram o último estado baixado.

Perguntas ao Maestro e consultas de cifras podem ser preparadas offline. Respostas novas exigem o serviço remoto: são processadas quando a conexão volta. A conversa recebe a resposta automaticamente; formatações e consultas ficam em Ver resultados prontos, com opção de copiar. Alertas ao vivo entre aparelhos só chegam a outros usuários quando há conexão.

O navegador sinaliza online/offline. O app também verifica o servidor, retenta periodicamente e ao retornar à janela. A sincronização ocorre com o app aberto ou ao reabri-lo, sem prometer execução enquanto o sistema suspende ou fecha o navegador. A fila só envia tarefas da conta original após revalidar PIN e acesso no servidor; pedidos de visitantes continuam anônimos, mesmo após um login.

Cada tarefa é persistida antes do recibo local, removida apenas após confirmação e protegida contra envios simultâneos entre abas. A fila não carrega o PIN da sessão. Alterações de PIN solicitadas pela administração contêm o novo valor solicitado até o processamento, como parte do cadastro pendente. Gravações ficam em IndexedDB e só são removidas após confirmação do registro de áudio. Conteúdo e resultados locais ficam separados por conta. Dados locais dependem do espaço e das permissões de armazenamento do navegador; limpar os dados do site também remove pendências ainda não enviadas.

Conflitos em chamadas, músicas ou eventos ficam guardados para revisão. Atualizações remotas não apagam alterações pendentes. Não há alteração de esquema ou relaxamento das regras de autorização do banco.

## Verificação

- Testes unitários: persistência antes do recibo, falha de armazenamento, perda de rede sem evento offline, separação de autores, PIN com hash, credenciais fixas, concorrência entre abas, preservação de alterações e conflitos.
- Navegador com SQL local real: pedido de oração e chamada offline, edição de escala, ordem de comunicados e interações.
- Build de produção e service worker real: atualização preservando rascunho, Bíblia em capítulo nunca lido, reabertura offline, PIN explícito e isolamento da fila entre contas, recibo interrompido sem duplicar o pedido.
