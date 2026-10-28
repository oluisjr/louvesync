# LouveSync

Aplicação React/Vite para repertório, escalas e ensaios compartilhados. O login por membro/PIN foi mantido. Estas correções não exigem migração nem executam alterações no banco de produção.

## Desenvolvimento

Requer Node.js 24 e npm. Use o checkout existente:

```sh
npm ci
npm run dev
```

Sem configuração Supabase, o aplicativo preserva os dados locais. Para usar a instância existente, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente. Nunca use uma chave de serviço no frontend.

O Maestro usa `/api/maestro`; configure `GROQ_API_KEY` somente no servidor/Vercel. A variável antiga `VITE_GROQ_API_KEY` ainda é reconhecida pelo servidor para compatibilidade, mas não é referenciada pelo frontend. `SCRAPERAPI_KEY` é opcional e também fica no servidor. Os mesmos handlers da pasta `api` são usados no desenvolvimento e na Vercel.

## Validação

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:updates
```

Os testes de navegador simulam o banco e o transporte Realtime e exercitam duas sessões independentes, presença, navegação, calendário, cifras, impressão/PDF, Bíblia, permissões e ensaio. Não escrevem no Supabase real. Os testes unitários cobrem preservação de presenças, falhas de gravação, transposição, datas, metadados de evento e APIs. A configuração ESLint separa navegador, Node e service workers e aplica as regras de execução/dependências dos Hooks; React Compiler não é usado pelo projeto.

## Interface e edição de eventos

O editor usa um painel com altura definida, fora dos contêineres da aplicação, e uma única área de rolagem. Cabeçalho, abas e ações ficam visíveis. As abas **Detalhes**, **Setlist** e **Equipe** preservam os dados enquanto o usuário navega; os pedidos e a Santa Ceia ficam próximos do setlist, antes do catálogo completo. O painel acompanha a altura disponível quando o teclado abre, contém o foco e bloqueia a interação com a tela ao fundo.

Bíblia, Ensaio e controles de cifra compartilham cores, campos, botões, ícones e estados de seleção nos temas claro e escuro. Os testes do editor cobrem rolagem, filtragem, reordenação, salvamento e navegação por teclado, em celular e desktop, incluindo uma janela de altura reduzida. A abertura real do teclado e os gestos nativos ainda devem ser conferidos em um aparelho físico.

[Capturas da interface com dados de demonstração](docs/interface.md).

## Exportação do setlist

Nos detalhes do evento, **Exportar para Excel** baixa uma planilha `.xlsx` com categoria, música, vocalista escalado e tom. **Copiar setlist para WhatsApp** usa os mesmos dados, com a categoria no lugar da numeração. Ambos preservam a sequência do evento e priorizam seu tom específico; sem vocalista vinculado, exibem “Vocalista não definido”. No APK 1.0.2, o Android oferece seu diálogo de salvamento para escolher a pasta, sem solicitar acesso geral ao armazenamento. APKs anteriores orientam a atualizar ou exportar pelo navegador. O salvamento nativo ainda precisa de conferência em um Android físico.

## Android

O aplicativo Android usa `https://louvesync.vercel.app` e acompanha os deploys web automaticamente. A impressão usa o diálogo nativo do Android, incluindo Salvar como PDF; a gravação solicita permissão do microfone. O iOS continua web/PWA: Safari → Compartilhar → Adicionar à Tela de Início.

O workflow **Android APK** do GitHub Actions gera um APK de teste instalável, disponível como artefato `louvesync-android-apk`. Também é possível gerar localmente com JDK 21 e Android SDK 35:

```sh
LOUVESYNC_APP_URL=https://louvesync.vercel.app npm run android:apk
```

Saída: `android/app/build/outputs/apk/debug/app-debug.apk`. Este é um APK de teste assinado com chave de debug, não uma versão assinada para a Play Store. Chaves de assinatura não devem ser commitadas.

## Persistência e colaboração

- As telas derivam os registros selecionados dos dados atuais, preservando o contexto ao voltar da cifra para um evento.
- Broadcast compartilha alterações e o ensaio entre clientes; assinaturas Postgres e atualização periódica complementam a reconexão. Música, estilo e cronômetro usam a sessão do evento escolhido.
- O cronômetro compartilha um instante inicial e envia seu estado a quem entra depois; o tempo também é salvo periodicamente nos campos existentes da sessão.
- A edição do evento preserva IDs dos itens, sequências e confirmações dos participantes mantidos. As gravações novas precedem a remoção dos itens obsoletos. Operações em múltiplas tabelas não são uma transação SQL; atomicidade completa e autorização no servidor dependem de um trabalho posterior no banco.
- Tom de um evento é armazenado junto da sequência, na coluna de texto `event_songs.sequence`, com prefixo versionado `louvesync:v1:`. Sequências antigas em texto puro continuam sendo lidas. Não é criada uma coluna nova.
- O envio para `events` contém somente `id`, `date`, `time`, `type`, `label` e `theme`. Músicas pedidas e a escolha de Santa Ceia são preservadas numa nota interna versionada de `event_songs.note_text`, usando as colunas existentes; não dependem de `events.requested_songs` ou `events.santa_ceia_song`. A nota interna não aparece no setlist, nas cifras ou nas exportações. As colunas legadas, quando presentes, continuam sendo lidas até a primeira gravação no formato atual. O mesmo caminho é usado ao sincronizar eventos da fila offline.
- Preferências `songs.vocal_keys` usam a coluna existente. O código busca o objeto atual antes de mesclar uma alteração; impedir qualquer conflito entre gravações simultâneas exige suporte atômico no banco.
- A fila offline remove somente operações confirmadas e mantém as que falham para nova tentativa. Dados em cache não são apagados na inicialização.
- O service worker é único e recebe uma versão derivada do build, incluindo os arquivos JS/CSS necessários ao uso offline.

## Limites desta entrega

O login/PIN e a autenticação foram preservados por solicitação. As restrições de administrador no app não substituem autorização/RLS no banco. Nenhuma política, tabela ou publicação Realtime de produção foi alterada. Push remoto necessita de um serviço de inscrições/envio e permanece fora desta entrega sem mudanças no backend/banco. A gravação e a impressão nativas precisam de validação final em um Android físico; o comportamento de gesto/overscroll no iOS precisa de verificação em Safari/PWA.

## Atualização automática na web, PWA e Android

Cada build publica o mesmo identificador em `index.html`, `sw.js` e `version.json`. O identificador inclui o conteúdo dos scripts, estilos, worker e arquivos públicos. O app compara a versão realmente carregada (metadado do HTML) com a versão publicada; apenas observar uma versão nova não a marca como instalada.

- HTML, versão, worker e manifestos usam `no-store` no navegador e no CDN da Vercel. Os arquivos JS/CSS com hash mantêm cache imutável. O rewrite da SPA não captura os arquivos de controle de atualização.
- Ao abrir, voltar ao primeiro plano, recuperar a conexão ou retornar pelo histórico/BFCache, o app consulta a versão pela rede. Enquanto está visível, verifica também a cada 30 segundos. A checagem inicial ocorre antes de montar o React.
- Um worker novo só assume depois de baixar um conjunto completo e consistente de HTML/assets. Ele ativa automaticamente, sem ficar preso em waiting, e a mudança de controle dispara a verificação da página. Instalações antigas sem esse protocolo recebem uma navegação de migração uma única vez; o endereço antigo sw-push.js também encaminha ao worker único.
- Em clientes com o protocolo atual, uma edição não salva, gravação, anotação pendente ou modo palco adia a recarga. A atualização é aplicada automaticamente ao concluir/fechar essa atividade. Login, localStorage e fila offline não são limpos. O aviso de atualização não bloqueia os botões do formulário.
- Sem conexão, permanece a última versão completa disponível. Quando a conexão volta, a atualização é tentada novamente. Manifesto inválido, propagação incompleta do deploy ou download com erro não substituem a cópia funcional. Tentativas repetidas da mesma recarga têm proteção contra loop.
- No Android, o WebView evita seu cache HTTP e emite um evento ao retomar a atividade. O APK 1.0.1 inclui essa integração; atualize o APK uma vez para recebê-la. Os próximos deploys web continuam dispensando recompilar/reinstalar o APK. O iOS permanece PWA.

`npm run test:updates` executa cenários com service workers reais, incluindo cache antigo, migração, várias janelas, reconexão, rollback, chunks ausentes e proteção contra loops. Um cenário usa dois builds Vite reais, altera uma mensagem no JavaScript do segundo, salva uma cifra durante a atualização e confirma a nova interface online e offline. Essa suíte pressupõe `npm run build` concluído e não modifica o banco nem chama APIs externas. Ela não substitui a validação final em Safari/PWA ou em Android físico. A versão só pode refletir um deploy que tenha sido publicado com sucesso no domínio de produção.
