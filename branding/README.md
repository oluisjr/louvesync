# Ícones do LouveSync

Usam exclusivamente os arquivos originais enviados pelo usuário: bloco escuro no tema claro, bloco branco no tema escuro e bloco em degradê para entrada e instalação. As letras mantêm suas cores, suas dobras e o bloco arredondado.

Os JPGs completos estão em source/. O comando npm run assets:brand apenas recorta a margem externa de apresentação, redimensiona e converte para PNG/ICO; não redesenha, isola nem recolore a marca. O aplicativo usa public/brand/v2/. Os endereços v1 permanecem como compatibilidade com a arte corrigida. exports.json registra as fontes e os recortes.

O favicon e o cabeçalho acompanham o tema do aplicativo. O ícone instalado usa a variante original em degradê. O manifesto mantém a identidade da instalação e publica os tamanhos 192 e 512 com purpose any, preservando o bloco fornecido em vez de redesenhá-lo para máscaras adaptativas.

No iPhone pode ser necessário adicionar novamente à Tela de Início para trocar o ícone. O Android nativo recebe os arquivos na versão 1.0.4; o launcher pode aplicar sua própria máscara do sistema. Não há versão monocromática para recolorir as letras.
