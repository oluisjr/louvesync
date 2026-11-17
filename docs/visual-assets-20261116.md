# Ensaio, Treinar e variedade dos modelos 3D

As telas usam as propostas aprovadas em 16/11/2026, com interfaces funcionais em tema claro e escuro. Gravação real, cifras, notas, tempo compartilhado e metrônomo foram preservados. As imagens respondem ao gesto de pressionar e arrastar usando o componente de ilustração existente.

Foram geradas 12 artes novas com o ImageGen nativo. Os PNGs originais estão em `C:/louvesync/visual-concepts/2026-11-16-ensaio-treinar/production-assets`; os prompts completos estão em [artwork-prompts/20261116](artwork-prompts/20261116). As versões WebP do app preservam transparência, têm no máximo 768 px e fazem parte do pacote offline automaticamente.

| Uso | Arte nova |
| --- | --- |
| Ensaio | Palco com painéis azuis e terracota, violão vinho e teclado marfim |
| Gravar ensaio | Microfone marfim, latão, detalhes ameixa e suporte rose gold |
| Treinar teclado | Teclado azul, fones creme/teal e metrônomo areia |
| Treinar voz | Microfone coral, fones ameixa e diapasão dourado |
| Treinar violão | Violão verde floresta, afinador azul e partituras |
| Treinar ritmo | Bateria vinho e metrônomo sálvia |
| Metrônomo do treino | Corpo teal, base nogueira e pêndulo de latão |
| Detalhes do evento | Palco sálvia/champanhe, violão branco e teclado teal |
| Bíblia | Bíblia vinho com marcador teal sobre suporte nogueira |
| Presenças | Equipe abstrata e prancheta de chamada |
| Patrimônio | Variação azul do violão e vinho do baixo |

A Home, a marca e o símbolo da igreja na navegação foram preservados. As variações do patrimônio são estáveis por item, sem alterar o cadastro dos equipamentos.

## Vocal coletivo

`TODOS` indica canto coletivo, sem vocal principal. Não cria conta, integrante, presença ou chave estrangeira fictícia. A escolha é registrada nos metadados musicais já existentes de `event_songs.sequence`, juntamente com o tom e o arranjo; por isso não requer migração de banco. O seletor mantém `Não definido` como estado separado.

A liderança escolhe o vocal e o tom no card da Escala ou nos detalhes do setlist. Membros continuam sujeitos às regras atuais de solicitação/aprovação. Uma mudança de vocal/tom invalida a confirmação anterior do repertório, e `TODOS` aparece nas exportações e no Ensaio. A gravação individual de tom nunca usa `TODOS` como ID de membro.

## Instrumentistas e marca

O card do evento e a aba Equipe permitem escolher o instrumentista quando há mais de uma pessoa cadastrada no mesmo instrumento. A escolha preserva outros papéis e confirmações; os novos escalados entram com resposta pendente. As indisponibilidades são respeitadas. O envio offline usa a mesma fila automática e verifica o acesso atual da liderança ao sincronizar. As escolhas são guardadas nos metadados existentes do evento.

Os ícones foram exportados novamente das imagens originais em `branding/source`, com recorte das margens de apresentação e cantos transparentes. As cores e as dobras da marca foram preservadas. A exportação maskable usa o fundo de marca até as bordas. O comando `npm run assets:brand` reproduz as versões da interface, PWA, favicon e Android.
