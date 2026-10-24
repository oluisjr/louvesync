const allowedHosts = new Set(['www.cifraclub.com.br', 'cifraclub.com.br', 'www.letras.mus.br', 'letras.mus.br', 'api.vagalume.com.br', 'lrclib.net']);
export function sourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) throw new Error('Use uma URL HTTPS de CifraClub, Letras, Vagalume ou LRCLib.');
  return url.href;
}
export function validateRedirect(options) {
  const host = options.hostname || options.host;
  if (options.protocol !== 'https:' || !allowedHosts.has(host)) throw new Error('Redirecionamento não permitido.');
}
