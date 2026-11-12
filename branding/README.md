# Marca do LouveSync

As variantes usam o mesmo monograma de fitas enviado pelo usuário. O nome do aplicativo permanece LouveSync.

- **Preta:** cabeçalho e favicon do tema claro.
- **Branca:** cabeçalho e favicon do tema escuro.
- **Colorida e transparente:** entrada e carregamento do aplicativo.
- **Fitas claras sobre degradê:** instalação PWA, Apple Touch Icon e launcher Android.
- **Monocromática Android:** ícones temáticos do Android 13+, quando habilitados pelo usuário no launcher.

`source/icon-reference.jpg` preserva a referência principal enviada em 12/11/2026. `source/mark-master.png` é a extração da marca colorida sobre transparência, preparada com ImageGen a partir da referência sobre fundo azul-marinho. As exportações mantêm a silhueta e a proporção do monograma; as versões monocromáticas são derivadas do mesmo canal alfa. O ícone de instalação recebe um fundo em degradê de turquesa, azul e violeta, sem a moldura branca externa da imagem de referência.

Para reproduzir os arquivos, instale ImageMagick 7 e execute `npm run assets:brand`. A aplicação e o build usam os arquivos exportados já incluídos no repositório; não precisam de ImageMagick nem de um serviço de geração. `exports.json` registra caminhos e dimensões.

Os recursos web ficam em `public/brand/v1/` e entram no cache offline de cada build. O manifesto mantém `id`, `start_url` e `scope`, preservando a identidade da instalação. O favicon acompanha o tema do app, inclusive na primeira abertura com tema salvo. Os ícones de instalação são coloridos e não são trocados pelo controle de tema do app.

No iPhone, uma instalação existente pode manter seu ícone antigo; remover e adicionar novamente à Tela de Início garante a substituição. Android instalado pelo Chrome atualiza conforme as regras do navegador. O APK precisa ser atualizado para a versão 1.0.3 ou posterior para receber os recursos nativos novos. A tela de abertura nativa usa a variante preta ou branca de acordo com o tema do sistema.
