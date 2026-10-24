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
```

Os testes de navegador simulam o banco e o transporte Realtime e exercitam duas sessões independentes, presença, navegação, calendário, cifras, impressão/PDF, Bíblia, permissões e ensaio. Não escrevem no Supabase real. Os testes unitários cobrem preservação de presenças, falhas de gravação, transposição, datas, metadados de evento e APIs. A configuração ESLint separa navegador, Node e service workers e aplica as regras de execução/dependências dos Hooks; React Compiler não é usado pelo projeto.

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
- Preferências `songs.vocal_keys` usam a coluna existente. O código busca o objeto atual antes de mesclar uma alteração; impedir qualquer conflito entre gravações simultâneas exige suporte atômico no banco.
- A fila offline remove somente operações confirmadas e mantém as que falham para nova tentativa. Dados em cache não são apagados na inicialização.
- O service worker é único e recebe uma versão derivada do build, incluindo os arquivos JS/CSS necessários ao uso offline.

## Limites desta entrega

O login/PIN e a autenticação foram preservados por solicitação. As restrições de administrador no app não substituem autorização/RLS no banco. Nenhuma política, tabela ou publicação Realtime de produção foi alterada. Push remoto necessita de um serviço de inscrições/envio e permanece fora desta entrega sem mudanças no backend/banco. A gravação e a impressão nativas precisam de validação final em um Android físico; o comportamento de gesto/overscroll no iOS precisa de verificação em Safari/PWA.
