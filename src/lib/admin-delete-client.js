const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

// UI visibility is only a convenience. The database authorizes the member/PIN.
export async function deleteAdminContent(targetType, targetId, actor, transport = fetch) {
  const memberId = actor?.memberId || actor?.id;
  if (!identifier(memberId) || typeof actor?.pin !== 'string' || !actor.pin || actor.pin.length > 256) throw new Error('Não foi possível validar sua sessão. Entre novamente no app.');
  if (!['song', 'event'].includes(targetType) || !identifier(String(targetId || ''))) throw new Error('Conteúdo inválido.');
  const payload = { targetType, targetId:String(targetId), memberId, pin:actor.pin };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await transport('/api/admin-delete', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', body:JSON.stringify(payload), signal:controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Não foi possível excluir. Tente novamente.');
    if (data?.ok !== true || data.targetType !== targetType || data.targetId !== payload.targetId) throw new Error('A exclusão não foi confirmada pelo servidor.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A exclusão não foi confirmada. Verifique sua conexão e tente novamente.', { cause:error });
    throw error;
  } finally { clearTimeout(timer); }
}
