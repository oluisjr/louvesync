// Supabase clients expect a project base URL, not the Data API endpoint.
// Keep a custom proxy prefix, but strip /rest/v1 and any resource after it.
export function normalizeSupabaseUrl(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) return '';
  let url;
  try { url = new URL(/^[a-z][\w+.-]*:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error('A URL do Supabase é inválida. Use a URL base do projeto.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('A URL do Supabase deve ser HTTP ou HTTPS, sem credenciais.');
  url.pathname = url.pathname.replace(/\/rest\/v1(?:\/.*)?$/i, '').replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
}
