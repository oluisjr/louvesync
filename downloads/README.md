# APK Android do LouveSync

[Baixar APK de teste](./louvesync-debug.apk?raw=true)

Este APK abre `https://louvesync.vercel.app` e acompanha os deploys web. Android 6 ou superior, com Android System WebView atualizado. Inclui permissão de microfone e integração com a impressão/Salvar PDF do Android.

É uma versão de teste assinada com chave de debug, não uma publicação na Play Store. A instalação exige permitir aplicativos desta origem. Para distribuir atualizações Android de forma permanente, será necessária uma chave de assinatura estável; APKs de debug gerados em máquinas diferentes podem exigir desinstalar a versão anterior, removendo seu cache/sessão local.

A assinatura do APK foi verificada com `apksigner`. O SHA-256 está em `louvesync-debug.apk.sha256` (execute `sha256sum -c downloads/louvesync-debug.apk.sha256` na raiz do repositório). Compilação e assinatura foram validadas; microfone, impressão e gestos ainda precisam de teste em um telefone físico.

Novas compilações podem ser obtidas no workflow **Android APK** do GitHub Actions, no artefato `louvesync-android-apk`.
