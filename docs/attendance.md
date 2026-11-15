# Presença real nos eventos

Em **Mais → Presenças**, a liderança consulta as chamadas e a frequência da equipe. O botão **Registrar presença** nos cards da Escala e nos detalhes de um evento abre diretamente sua chamada, inclusive para ensaios.

O acesso usa a liderança existente no projeto: administradores ativos e membros ativos com a função **Líder de Louvor**. O LouveSync atual representa uma equipe de ministério; não existe um cadastro separado de departamentos. A função no banco valida o membro e o PIN persistidos em cada leitura e gravação. Permissões de tela e flags enviadas pelo navegador não concedem acesso.

## Registro e consulta

- A chamada começa com todos os escalados **Não marcados**, independentemente da resposta antecipada à escala.
- Cada pessoa recebe **Presente**, **Ausente** ou **Falta justificada**. Uma falta justificada exige observação, com limite de 500 caracteres.
- **Salvar rascunho** preserva marcações parciais; pendentes não se tornam ausentes. **Concluir chamada** exige uma marcação para cada integrante.
- Chamadas ficam disponíveis no dia do evento, considerando `America/Sao_Paulo` no servidor. Não é possível antecipar presença de um evento futuro.
- A liderança pode corrigir uma chamada concluída. Cada gravação guarda responsável, horário e uma revisão; versões antigas não sobrescrevem o registro de outro aparelho.
- A equipe e os nomes são preservados no primeiro salvamento. Alterações ou exclusões posteriores de eventos, escalas e membros não apagam o histórico já registrado.
- A frequência por integrante usa somente chamadas concluídas. O percentual é presenças dividido por participações registradas, incluindo faltas justificadas no total; essas faltas continuam identificadas separadamente.
- O relatório permite consultar um período de até um ano e exportar as chamadas concluídas em CSV. Períodos com mais de 500 chamadas precisam ser reduzidos; dados não são truncados silenciosamente.

O registro real não altera `event_members.confirmed`, nem a confirmação do setlist. Uma falha de gravação preserva as marcações na tela e não mostra sucesso. As alterações são bloqueadas durante o envio; sair com edições pendentes pede descarte explícito. Não existe fila de confirmação offline para chamadas.

## Persistência e autorização

A migração `supabase/migrations/*_ministry_attendance.sql` cria:

- `louvesync_attendance_sheets`: uma chamada por evento, com equipe, situação, versão e responsável.
- `louvesync_attendance_revisions`: versões preservadas para rastrear correções.
- `louvesync_attendance(jsonb)`: entrada RPC para `list`, `get` e `save`. A implementação privilegiada fica no schema não exposto `louvesync_private`, com `search_path` fixo e validação de liderança/PIN.

As tabelas têm RLS e nenhum acesso direto de `anon` ou `authenticated`. O projeto mantém seu login atual por membro/PIN; esta implementação não o converte em Supabase Auth. Os limites desse modelo continuam descritos em [monitoramento administrativo](admin-activity.md).

O navegador e o APK priorizam o RPC no mesmo projeto Supabase usado pelo app. `/api/attendance` é o transporte alternativo e usa as mesmas credenciais públicas já configuradas para as demais APIs. Não usa nem expõe `service_role`. O frontend só aceita sucesso quando o servidor devolve a versão seguinte e as mesmas marcações enviadas.

## Validação

```powershell
npm.cmd test
npm.cmd run test:attendance:sql
npm.cmd run lint
npm.cmd run build
```

O teste SQL executa a migração e suas verificações num Postgres PGlite descartável, sem conexão com produção e sem precisar de Docker. Os testes de navegador de presença também passam pela API/RPC real e por esse Postgres local, incluindo o cenário de 10 escalados e 5 presentes, recarga, liderança sem admin, conflitos entre aparelhos e exportação.
