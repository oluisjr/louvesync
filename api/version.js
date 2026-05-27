// api/version.js — retorna a versão atual do app para verificação de updates no PWA
import pkg from '../package.json' assert { type: 'json' };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ version: pkg.version });
}
