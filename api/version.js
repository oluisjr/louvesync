// api/version.js — retorna a versão atual do app ou o ID único do deploy no Vercel para forçar reload anti-cache
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  // Usa o ID único do deploy do Vercel, o hash do commit git ou um fallback estável
  const deployId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev_1.0.0';
  res.status(200).json({ version: deployId });
}
