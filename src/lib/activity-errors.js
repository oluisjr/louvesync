export function activityFailure(error, upstreamStatus) {
  if (error?.code === 'PGRST125') return { status: 503, body: {
    code: 'ACTIVITY_URL_INVALID',
    error: 'O endereço da API do Supabase é inválido (PGRST125). Confira se a URL configurada na Vercel é a URL base do projeto e faça Redeploy.',
  } };
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return { status: 503, body: { code: 'ACTIVITY_SETUP_REQUIRED', error: 'O monitoramento precisa ser ativado no banco.' } };
  if (error?.code === '28000') return { status: 401, body: { error: 'Sessão inválida. Entre novamente no app.' } };
  if (error?.code === '42501') return { status: 403, body: { error: 'Acesso exclusivo do administrador.' } };
  if (error?.code === 'P0002') return { status: 404, body: { error: 'Conteúdo não encontrado.' } };
  if (['22023', '22P02', '22007', '22008'].includes(error?.code)) return { status: 400, body: { error: 'Solicitação de atividade inválida.' } };
  if ([401, 403].includes(upstreamStatus) || ['PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) return { status: 503, body: {
    code: 'ACTIVITY_SUPABASE_AUTH',
    error: 'O Supabase recusou a chave pública configurada na Vercel. Confira se a URL e a chave anon são do mesmo projeto, salve em Production e faça Redeploy.',
  } };
  // Never return upstream messages, details or hints: they may contain values
  // from SQL or credentials. Only fixed-format diagnostic codes are exposed.
  const databaseCode = typeof error?.code === 'string' && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code) ? error.code : null;
  const status = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : null;
  return { status: 503, body: {
    code: 'ACTIVITY_DATABASE_ERROR', databaseCode, upstreamStatus: status,
    error: `O Supabase não conseguiu consultar as visualizações (${databaseCode || (status ? `HTTP ${status}` : 'sem código')}).`,
  } };
}
