# Interface do LouveSync

Capturas do aplicativo em Chromium, com dados de demonstração e sem acesso ao banco de produção.

A janela principal acompanha a altura visível do navegador, inclusive após retorno ao app, teclado e rotação. Cabeçalho, fundo do documento e cor do navegador acompanham o tema salvo; o cabeçalho é opaco. O menu flutuante usa o mesmo quadro da página, com espaço de rolagem reservado para ele e para a área inferior do aparelho. As regressões de layout usam Chromium com áreas seguras de iPhone simuladas (47 px no topo e 34 px embaixo), nos dois temas, além de desktop; essa emulação não substitui a verificação do PWA em um iPhone físico.

O editor mantém cabeçalho e ações visíveis durante a rolagem e oferece espaço dedicado para o setlist. Os mesmos campos e botões são usados em Bíblia, Ensaio e cifra.

O catálogo do evento agrupa músicas por categoria, com cores e contagem de selecionadas. O cadastro de membro usa um painel acima da página, com uma área de rolagem e ações fixas; as capturas mostram a parte superior e o final do formulário em uma janela de 320 px de largura. Os testes também verificam uma altura reduzida de 420 px, falha de gravação com preservação dos campos e nova tentativa de salvamento.

| Categorias do evento | Novo membro |
| --- | --- |
| ![Catálogo separado por categoria](screenshots/event-categories.png) | ![Cadastro de membro no celular](screenshots/member-mobile.png) |

![Disponibilidade do membro com botão de cadastro acessível](screenshots/member-mobile-availability.png)

![Cadastro de membro no desktop em tema escuro](screenshots/member-desktop-dark.png)

| Editor no celular | Setlist |
| --- | --- |
| ![Detalhes do evento](screenshots/event-editor.png) | ![Ordem das músicas](screenshots/event-setlist.png) |

| Bíblia | Ensaio |
| --- | --- |
| ![Leitura da Bíblia](screenshots/bible.png) | ![Ensaio colaborativo](screenshots/rehearsal.png) |

| Estilo e alertas | Cifra e tom por vocal |
| --- | --- |
| ![Controles do ensaio](screenshots/rehearsal-controls.png) | ![Controles da cifra](screenshots/chords.png) |

![Editor no desktop, em tema escuro](screenshots/event-desktop-dark.png)
