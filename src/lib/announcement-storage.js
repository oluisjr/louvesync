const id = value => value == null ? '' : String(value);
const errorWithCode = (message, code) => Object.assign(new Error(message), { code });

export function sameAnnouncement(left, right) {
  if (!left || !right) return false;
  if (id(left.id) && id(left.id) === id(right.id)) return true;
  const time = Date.parse(left.created_at);
  return !!id(left.created_by) && id(left.created_by) === id(right.created_by) &&
    left.title === right.title && left.content === right.content &&
    Number.isFinite(time) && time === Date.parse(right.created_at);
}

const confirmed = row => ({ ...row, pendingSync: false, _publication: 'confirmed', _previouslyConfirmed: true });

export function restoreAnnouncementCache(posts = []) {
  return (Array.isArray(posts) ? posts : []).map(post => ({ ...post,
    _previouslyConfirmed: !post.pendingSync && (post._publication === 'confirmed' || post._previouslyConfirmed === true),
    _publication: post.pendingSync ? 'pending' : 'checking',
  }));
}

export function reconcileAnnouncements(previous, savedRows, authorId) {
  const pending = previous.filter(post => !savedRows.some(saved => sameAnnouncement(post, saved)) &&
    (post.pendingSync || (id(authorId) && id(post.created_by) === id(authorId))))
    .map(post => ({ ...post, _publication: post.pendingSync ? 'pending' : 'missing' }));
  return [...pending, ...savedRows.map(confirmed)];
}

function requireClient(client) {
  if (!client) throw errorWithCode('A conexão com o mural está indisponível. Atualize o app e tente novamente.', 'ANNOUNCEMENT_CONNECTION_REQUIRED');
}

const query = (builder, signal) => typeof builder.abortSignal === 'function' ? builder.abortSignal(signal) : builder;
async function bounded(action) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try { return await action(controller.signal); }
  catch (error) {
    if (controller.signal.aborted) throw errorWithCode('A verificação da publicação demorou demais. O texto está preservado; tente novamente.', 'ANNOUNCEMENT_CHECK_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

async function readById(client, postId, signal) {
  if (!id(postId)) return null;
  const { data, error } = await query(client.from('announcements').select('*').eq('id', postId).maybeSingle(), signal);
  // Old local IDs may have a different type from the database-generated ID.
  // They can still be reconciled by the exact publication identity below.
  if (error && error.code !== '22P02') throw error;
  return data?.id != null ? data : null;
}

async function readByIdentity(client, post, signal) {
  if (!id(post?.created_by) || !Number.isFinite(Date.parse(post?.created_at))) return null;
  const { data, error } = await query(client.from('announcements').select('*')
    .eq('created_by', post.created_by).eq('created_at', post.created_at), signal);
  if (error) throw error;
  const matches = (Array.isArray(data) ? data : []).filter(row => row.id != null && sameAnnouncement({ ...post, id: null }, row));
  if (matches.length > 1) throw errorWithCode('Há mais de uma publicação correspondente. Atualize o mural para consultar o aviso correto.', 'ANNOUNCEMENT_AMBIGUOUS');
  return matches[0] || null;
}

// A read-only check on the same client/project used for the feed. Never creates
// or republishes content when an old cache entry is absent from the database.
export async function verifyAnnouncement(client, post) {
  requireClient(client);
  return bounded(async signal => {
    const row = await readById(client, post?.id, signal) || await readByIdentity(client, post, signal);
    return row ? confirmed(row) : null;
  });
}

// Do not discard an offline job based solely on a write acknowledgement. The
// separate read confirms the persisted ID and makes retries recover a previous
// successful write without inserting a duplicate after its response was lost.
export async function publishAnnouncement(client, post) {
  requireClient(client);
  return bounded(async signal => {
    const row = {
      id: post.id, title: post.title, content: post.content,
      created_at: post.created_at, created_by: post.created_by,
    };
    const previous = await readByIdentity(client, row, signal);
    if (previous) return confirmed(previous);
    const insert = value => query(client.from('announcements').insert(value).select('*').single(), signal);
    let result = await insert(row);
    if (['22P02', '428C9'].includes(result.error?.code)) {
      // UUID/identity schemas can generate the authoritative ID themselves.
      const { id: _localId, ...generated } = row;
      result = await insert(generated);
    }
    if (result.error) {
      if (result.error.code === '23505' || !result.error.code) {
        const recovered = await readByIdentity(client, row, signal);
        if (recovered) return confirmed(recovered);
      }
      throw result.error;
    }
    const saved = result.data?.id != null ? await readById(client, result.data.id, signal) : await readByIdentity(client, row, signal);
    if (!saved) throw errorWithCode('A publicação ainda não foi confirmada no banco. O texto foi preservado para tentar novamente.', 'ANNOUNCEMENT_NOT_CONFIRMED');
    return confirmed(saved);
  });
}
