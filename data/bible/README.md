# Bíblia Livre (2018)

Texto em português do Brasil da Bíblia Livre, edição Textus Receptus, atualizado a partir de João Ferreira de Almeida (1819). © 2018 Diego Santos, Mario Sérgio e Marco Teles. Distribuição sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), com atribuição.

Fonte e créditos oficiais: <https://ebible.org/porbr2018/>. `source-about.htm` preserva a atribuição fornecida no pacote de origem. `manifest.json` registra a edição, o endereço do arquivo VPL e os hashes SHA-256 do pacote e do JSON convertido.

O JSON é usado apenas pelo servidor em `/api/bible`; não é incluído no JavaScript entregue ao navegador. A conversão preserva o texto, os acentos e a pontuação. Apenas os prefixos de referência se tornam índices de livro, capítulo e versículo. Não há tradução automática, modernização nem correção editorial feita pelo aplicativo.

Para reproduzir a importação, baixe o pacote oficial indicado no manifesto e execute, na raiz do aplicativo:

```powershell
node scripts/import_bible.js caminho/porbr2018_vpl.zip
npm.cmd test
```

Os testes verificam os 66 livros, 1.189 capítulos e 31.102 versículos, a numeração consecutiva, o hash do corpus, referências de conferência e a separação de cache por edição. `.gitattributes` mantém os JSON em LF para que o hash seja estável em Windows e Linux.
