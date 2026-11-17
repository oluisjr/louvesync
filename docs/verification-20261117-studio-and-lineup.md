# Verificação: Ensaio, Treinar e escala por instrumento

- 187 testes unitários aprovados.
- ESLint aprovado.
- Build de produção aprovado; a coleção nova de 12 WebPs faz parte do precache offline.
- 10 cenários de navegador aprovados. Após o ajuste final de espaçamento e leitura dos instrumentistas, os 3 cenários afetados foram executados novamente e aprovados.
- Testes PostgreSQL de permissões, aprovação, concorrência e auditoria aprovados.

Os testes do navegador verificaram:

1. `TODOS`, seleção individual, tom do evento, recarga e interface somente leitura para membros.
2. Seleção de violonista e baterista, gravação offline, envio automático e preservação das outras confirmações.
3. Ensaio e Treinar em 390 e 320 px nos temas claro e escuro, sem transbordamento horizontal; quatro conjuntos de treino distintos carregados.
4. Confirmação do setlist invalidada por mudanças de música, vocal ou tom.
5. Troca de prática, cronômetro e metrônomo real.
6. Notas e metrônomo do Ensaio em ambos os temas.
7. Gravação real de áudio no navegador e recuperação local após falha de upload.

As capturas de implementação estão em `C:/louvesync/visual-concepts/2026-11-16-ensaio-treinar/qa`. Os testes de fluxo usaram contas sintéticas e dados isolados. Nenhum cadastro temporário foi criado em produção, e nenhuma migração de banco é necessária.

A marca foi reexportada das imagens originais, com corte interno da margem de apresentação e máscara de cantos transparentes. Os PNGs da interface, PWA e Android, além dos favicons, foram atualizados pelo mesmo exportador reproduzível.
