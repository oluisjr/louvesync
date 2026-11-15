# Comunidade da igreja

## Visitantes, membros e equipe

A cada abertura ou recarga da página, o app mostra as boas-vindas como **Visitante**, inclusive quando havia um perfil salvo neste aparelho. O botão destacado **Fazer login** abre a tela existente de seleção do membro e senha/PIN. O login explícito direciona a equipe ao ministério e membros da igreja à comunidade. Não é criado um cadastro anônimo no Supabase Auth.

Em **Admin → Editar membro → Tipo de acesso**, o administrador escolhe **Membro da igreja** ou **Equipe do ministério**. A classificação é persistida em `members.access_type`, validada no banco e retornada no login. Visitantes e membros da igreja têm apenas quatro destinos: **Início** (boas-vindas), **Agenda** (eventos da igreja), **Oração** e **Bíblia**. O membro conectado pode sair pelo cabeçalho. Não recebe telas, privilégios administrativos, novas notificações ou seleção para escalas do ministério. A troca de classificação atualiza outros aparelhos por sincronização e retomada da janela; retornar à equipe restaura o ambiente do ministério durante a sessão conectada.

Entrar como visitante limpa somente o perfil e as credenciais da sessão anterior. Mantém tema, posição de leitura e cache da Bíblia. Os capítulos efetivamente abertos ficam em cache local e podem ser relidos sem conexão; capítulos ainda não baixados precisam de internet. A biblioteca de versículos permanece separada por perfil, incluindo o perfil visitante.

Contas existentes continuam classificadas como equipe para preservar seu acesso. O texto antigo do campo função/cargo não reclassifica pessoas automaticamente. **Conta ativa** segue controlando a entrada; **Ativo na escala** segue independente. Um membro da igreja é salvo com função Membro, sem instrumento, sem administração e sem participação na escala. Os vínculos históricos de eventos são preservados.

A API de dados exige uma sessão válida da equipe para ler as tabelas internas do ministério. A lista básica necessária ao login continua pública, sem PINs ou preferências privadas. As credenciais de serviço usadas pela área pública permanecem no servidor. Clientes da comunidade não carregam escalas, repertório ou a lista de pessoas na entrada de visitantes.

## Agenda pública

**Admin → Comunidade da igreja → Agenda pública** permite criar e editar encontros, local, categoria, descrição, começo, encerramento e publicação. Um rascunho é visível somente à administração. Desmarcar **Publicar na agenda da igreja** retira o encontro da área pública sem apagar o registro. Alterações concorrentes exigem atualizar o evento antes de sobrescrevê-lo.

As tabelas `louvesync_church_events` e `events` são independentes. Escalas de cultos, equipes e setlists nunca são copiados automaticamente para visitantes. Uma agenda ainda vazia informa que novos encontros serão publicados, sem eventos fictícios.

## Pedidos de oração

Visitantes e membros podem enviar pedidos. O padrão é **Somente a liderança responsável**; a lista privada fica exclusivamente em **Admin → Comunidade da igreja → Pedidos de oração**. O administrador registra Recebido, Em oração, Respondido ou Arquivado.

Para aparecer em **Oramos juntos**, o autor deve escolher compartilhar com a comunidade e o administrador deve revisar e publicar. A revisão não pode substituir o consentimento. Arquivar retira o pedido da lista pública. O formulário explica que membros e visitantes verão o conteúdo compartilhado após revisão.

**Enviar sem meu nome** elimina o nome e a associação com o cadastro na gravação, inclusive quando quem envia está conectado. Pedidos não são colocados em localStorage. Erros preservam o texto enquanto a tela está aberta, e o logout descarta o formulário da conta anterior. A confirmação só aparece depois do recibo persistido pelo banco.

O servidor aceita até cinco envios por hora por origem de rede. O endereço é transformado em um hash HMAC antes da gravação; não é retornado à interface. O banco serializa a contagem e evita duplicação em tentativas repetidas. A tabela de pedidos não concede leitura ou gravação direta a `anon`/`authenticated`; a API pública retorna apenas conteúdo com consentimento e publicação revisada. O histórico administrativo registra autor, ação e mudanças de status/publicação, sem copiar o texto da oração para o histórico geral do ministério.

## Artes e leitura

O Maestro usa `public/images/maestro/toy.webp`, uma versão com cabeça e olhos maiores e materiais de boneco 3D, preservando cabelo, moletom, marca e batuta. A geração nativa usou o [prompt preservado](designs/maestro-toy-prompt.txt). A imagem original gerada fica em `C:\louvesync\visual-concepts\2026-11-15-community-implementation\maestro-toy.png`. As artes de igreja, calendário e oração aprovadas foram exportadas para `public/images/community/`.

As mensagens do usuário têm balões roxos à direita; as do Maestro têm avatar e superfície própria à esquerda. Confirmados, recusas e pendências usam ícones, textos e cores consistentes nos detalhes e na semana. As músicas recebem categoria em etiqueta e borda com cor, além do tom vigente.

## Verificação

`npm test`, `npm run lint`, `npm run build` e os testes SQL de comunidade, preferências e solicitações verificam a integração. Os cenários Playwright da comunidade usam a API real do projeto conectada a PostgreSQL descartável: entrada sem conta, falha/repetição de envio, anonimato, consentimento, revisão, publicação/retirada, troca de classificação em dois aparelhos e tentativas de promoção indevida. Os demais cenários mantêm a cobertura de escalas, presença, setlists, Bíblia e PINs.

As capturas foram conferidas nos temas claro/escuro em 320 e 390 pixels. Gestos e teclado de Safari/PWA ou Android físicos ainda dependem de conferência em aparelho.

As três migrações hospedadas foram aplicadas e verificadas, com os arquivos locais alinhados ao registro do Supabase: `20261115180407_church_member_classification.sql`, `20261115180424_church_public_intake.sql` e `20261115180436_church_administration.sql`.

A entrada obrigatória como visitante e as marcações do ministério foram verificadas com 165 testes unitários, 25 cenários únicos de navegador e as suítes SQL de comunidade, preferências, solicitações e marcações. A migração hospedada de marcações é `20261115200859_ministry_mentions_inbox.sql`: colunas, seis gatilhos, restrições e permissões conferidos após a aplicação, sem criar avisos retroativos.
