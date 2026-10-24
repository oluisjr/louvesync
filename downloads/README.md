# APK Android do LouveSync

[Baixar APK de teste](./louvesync-debug.apk?raw=true)

Este APK 1.0.2 abre `https://louvesync.vercel.app` e acompanha os deploys web. Android 6 ou superior, com Android System WebView atualizado. Inclui permissão de microfone, impressão/Salvar PDF do Android, salvamento de planilhas Excel pelo seletor de arquivos e verificação automática da versão web ao retomar a atividade. Para salvar Excel no Android, atualize o APK uma vez; essa integração nativa não pode ser acrescentada por um deploy web. O cache HTTP do WebView fica desativado; o worker mantém a última versão completa para uso offline.

É uma versão de teste assinada com chave de debug, não uma publicação na Play Store. A instalação exige permitir aplicativos desta origem. Para distribuir atualizações Android de forma permanente, será necessária uma chave de assinatura estável; APKs de debug gerados em máquinas diferentes podem exigir desinstalar a versão anterior, removendo seu cache/sessão local.

A assinatura do APK foi verificada com `apksigner`. O SHA-256 está em `louvesync-debug.apk.sha256` (execute `sha256sum -c downloads/louvesync-debug.apk.sha256` na raiz do repositório). Compilação e assinatura foram validadas; microfone, impressão, salvamento nativo de Excel e gestos ainda precisam de teste em um telefone físico.

Novas compilações podem ser obtidas no workflow **Android APK** do GitHub Actions, no artefato `louvesync-android-apk`.
