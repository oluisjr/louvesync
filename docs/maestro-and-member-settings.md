# Maestro e configurações de membros

## Maestro

O diagnóstico em produção em 15/11/2026 encontrou `GROK_API_KEY` configurada na Vercel, enquanto o handler consultava somente `GROQ_API_KEY`/`VITE_GROQ_API_KEY`. A chamada retornava HTTP 503 antes de alcançar o provedor. Groq e Grok/xAI são serviços diferentes.

O servidor agora seleciona Groq (`https://api.groq.com/openai/v1/chat/completions`) ou xAI (`https://api.x.ai/v1/chat/completions`). Reconhece o prefixo da chave para acomodar uma chave Groq armazenada como `GROK_API_KEY`. A precedência de variáveis é `GROQ_API_KEY`, `XAI_API_KEY`, `GROK_API_KEY` e a variável legada. Não é necessário renomear a configuração existente.

Os padrões são `llama-3.3-70b-versatile` em Groq e `grok-4.3` em xAI. `MAESTRO_MODEL` substitui o padrão; também são aceitas as opções específicas `GROQ_MODEL`, `XAI_MODEL` e `GROK_MODEL`. O cliente não escolhe o modelo nem recebe credenciais do provedor. Referências oficiais: [Groq](https://console.groq.com/docs/models) e [xAI](https://docs.x.ai/docs/models).

O primeiro teste real após corrigir a variável revelou HTTP 404 do provedor para o modelo padrão. Quando um padrão está indisponível, o servidor consulta `/v1/models` e tenta um modelo de conversa efetivamente oferecido àquela chave, preservando o provedor e o prazo total da requisição. Modelos de imagem, voz e moderação são excluídos. Uma escolha explícita por variável de ambiente é respeitada e não sofre substituição automática. A alternativa que responder com sucesso é reutilizada por até uma hora por instância.

`/api/maestro` autentica o membro pelo RPC de login existente e consulta o acesso persistido à tela Maestro. A formatação de cifras exige acesso a Músicas. Configuração indisponível, sessão inválida, modelo inexistente, falta de créditos e demora recebem mensagens distintas. Falhas preservam a pergunta e não consomem as dez respostas da sessão. O servidor limita cada membro a trinta tentativas em cinco minutos por instância. O modo nativo com recursos locais usa o domínio canônico da API.

O personagem usa a arte de referência com rosto, cabelos, moletom azul e marca preservados, acrescentando a batuta. É uma imagem WebP com transparência para a interface.

## Preferências e disponibilidade

A migração `20261115150809_member_access_and_availability.sql` acrescenta `members.permissions`, `unavailable_days` e `schedule_enabled`. Foi aplicada ao projeto hospedado e registrada com a mesma versão do arquivo local. `permissions = null` conserva o acesso padrão compatível com o cargo; uma lista vazia não libera telas. Administradores sempre conservam o painel administrativo para evitar bloqueio da própria gestão.

As preferências não são expostas na lista pública de login. `louvesync_member_settings` exige membro/PIN válidos: a liderança lê as configurações da equipe e os demais leem somente as próprias. As políticas existentes continuam reservando a alteração dos cadastros à administração. O histórico existente registra autoria e campos modificados, sem registrar o PIN.

Todas as rotas da navegação, atalhos da Home e destinos de notificações usam a mesma regra de telas e cargo. A alteração é recarregada nos demais aparelhos por broadcast, eventos do banco, retomada da janela e atualização periódica. Uma cópia offline conserva as últimas preferências conhecidas; mudanças remotas dependem de reconexão. A ocultação de telas complementa as políticas de dados e não substitui as verificações de autorização já existentes.

**Conta ativa** é independente de **Ativo na escala**. Desativar a participação mantém o login. Dias indisponíveis usam domingo = 0 até sábado = 6 e são verificados para todos os integrantes. A seleção manual mostra o motivo do bloqueio. A geração e o salvamento conferem cada data, incluindo recorrências e o ensaio do sábado anterior. A data do ensaio é verificada separadamente da data do culto.

O banco também rejeita a inclusão de novos vínculos de equipe incompatíveis com essas configurações. Vínculos históricos e respostas de presença permanecem válidos. O aplicativo verifica conflitos ao mudar a data de um evento; uma alteração direta de data por SQL administrativo deve fazer essa mesma conferência, pois o trigger protege os vínculos novos/alterados.

## Validação

`npm test` verifica o resolvedor de provedor, autenticação, acesso persistido, erros, resposta do cliente e regras de disponibilidade. `npm run test:members:sql` aplica a migração duas vezes em PostgreSQL descartável e verifica persistência, privacidade, cargo, dias, participação, histórico e autoria. `npm run test:changes:sql` mantém a cobertura de aprovação de alterações.

Os cenários Playwright cobrem salvamento, outro dispositivo, recarga, bloqueio de vocal/instrumentista, ensaio em dia diferente e recuperação de falha do Maestro nos dois temas. O transporte de IA nesses testes é simulado. Esses testes de navegador não substituem a conferência física de Safari/PWA ou Android.

Após a publicação do commit `04c4884`, `/api/maestro` respondeu HTTP 200 com `OK` em uma chamada real, autenticada com um cadastro temporário exclusivo para QA e fora da escala. O log da função confirmou Groq e a alternativa disponível `openai/gpt-oss-20b`. O cadastro temporário foi removido e sua ausência foi confirmada no banco. Nenhum PIN de membro real ou valor de chave do provedor foi consultado. Essa chamada comprova o caminho de autenticação, API e provedor naquele momento; créditos e disponibilidade continuam dependendo da conta de IA.
