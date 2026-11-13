import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readCache, writeCache } from '../lib/domain.js';
import { broadcastUpdate, onRealtime } from '../lib/realtime.js';
import { Dialog, Icon } from './Interface.jsx';
import { ObservedPost, ViewersButton } from './Activity.jsx';
import ReactionPicker from './ReactionPicker.jsx';
import '../community-mural.css';

const dateText = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return 'Agora';
  if (Math.abs(minutes) < 60) return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(Math.round(minutes / 60), 'hour');
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
const rehearsalPost = post => /ensaio|ensaiar/i.test(`${post.title} ${post.content}`);
const safeImage = post => {
  const value = post.image_url || post.photo_url;
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
};

function Avatar({ member, small = false }) {
  const initials = member?.avatar || member?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('') || 'MB';
  return <span className={'community-avatar' + (small ? ' community-avatar-small' : '')} style={{ '--person-color': member?.color || '#7b3ff2' }} aria-hidden="true">{initials}</span>;
}

function SocialIcon({ name, ...props }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{name === 'like' ? <><path d="M7 10v11H3V10h4Zm0 1 5-8c2 0 3 2 2 5l-1 2h6a2 2 0 0 1 2 2l-2 7a3 3 0 0 1-3 2H7"/></> : name === 'comment' ? <path d="M20 15a3 3 0 0 1-3 3H9l-5 4v-4a3 3 0 0 1-2-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z"/> : <><path d="M4 8V5a2 2 0 0 1 2-2h12v18l-6-4-6 4V8"/></>}</svg>;
}

export default memo(function CommunityMural({ profile, dark, members, activity }) {
  const cacheKey = `ls_mural_cache_v1:${profile?.id || 'local'}`;
  const cached = readCache(cacheKey, {});
  const [posts, setPosts] = useState(() => cached.posts || []);
  const [comments, setComments] = useState(() => cached.comments || []);
  const [reactions, setReactions] = useState(() => cached.reactions || []);
  const [saves, setSaves] = useState(() => cached.saves || []);
  const [loading, setLoading] = useState(!cached.posts?.length);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [expandedComments, setExpandedComments] = useState({});
  const [reactionMenu, setReactionMenu] = useState(null);
  const [commentTexts, setCommentTexts] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const [pending, setPending] = useState({});
  const formId = useId();
  const reactionMenuId = useId();
  const request = useRef(0), alive = useRef(true), locks = useRef(new Set());
  const closeReactions = useCallback((restoreFocus = false) => {
    setReactionMenu(null);
    if (restoreFocus) reactionMenu?.anchor.focus({ preventScroll: true });
  }, [reactionMenu]);

  const refresh = useCallback(async ({ initial = false } = {}) => {
    if (!supabase) { setLoading(false); return; }
    const version = ++request.current;
    if (initial) setLoading(true);
    try {
      const results = await Promise.all([
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('announcement_comments').select('*').order('created_at', { ascending: true }),
        supabase.from('announcement_reactions').select('*'),
        supabase.from('announcement_saves').select('post_id').eq('member_id', profile.id),
      ]);
      if (!alive.current || version !== request.current) return;
      if (results[0].error) throw results[0].error;
      setPosts(results[0].data || []);
      if (!results[1].error) setComments(results[1].data || []);
      if (!results[2].error) setReactions(results[2].data || []);
      if (!results[3].error) setSaves((results[3].data || []).map(row => row.post_id));
      setLoadError(results.some(result => result.error) ? 'Algumas interações não puderam ser atualizadas. Tente novamente.' : '');
    } catch {
      if (alive.current && version === request.current) setLoadError(navigator.onLine ? 'Não foi possível atualizar o mural. Tente novamente.' : 'Sem conexão. Os avisos já carregados continuam disponíveis.');
    } finally {
      if (alive.current && version === request.current) setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    alive.current = true;
    refresh();
    const off = onRealtime(message => { if (message.type === 'mural_changed' || message.type === 'data_changed') refresh(); });
    const resume = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(resume, 15000);
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    const channel = supabase?.channel(`mural_realtime_changes_${crypto.randomUUID()}`);
    for (const table of ['announcements', 'announcement_comments', 'announcement_reactions', 'announcement_saves']) channel?.on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh());
    channel?.subscribe();
    return () => { alive.current = false; off(); clearInterval(timer); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); if (channel) supabase.removeChannel(channel); };
  }, [refresh]);
  useEffect(() => { if (!loading) writeCache(cacheKey, { posts, comments, reactions, saves }); }, [cacheKey, posts, comments, reactions, saves, loading]);

  const queue = (type, data) => {
    if (!window.dispatchOfflineTask) throw new Error('Conecte-se para concluir esta ação.');
    window.dispatchOfflineTask(type, data);
    setNotice('Alteração salva neste aparelho. Será enviada quando a conexão voltar.');
  };
  const runAction = async (key, postId, action) => {
    if (locks.current.has(key)) return;
    locks.current.add(key); setPending(previous => ({ ...previous, [key]: true }));
    setActionErrors(previous => ({ ...previous, [postId]: '' }));
    try { await action(); }
    catch (error) { setActionErrors(previous => ({ ...previous, [postId]: error.message || 'Não foi possível salvar. Tente novamente.' })); }
    finally { locks.current.delete(key); setPending(previous => ({ ...previous, [key]: false })); }
  };
  const notifyChange = () => broadcastUpdate({ type: 'mural_changed' }).catch(() => false);

  const createPost = async event => {
    event.preventDefault();
    if (!profile?.is_admin || locks.current.has('post')) return;
    if (!newTitle.trim() || !newContent.trim()) { setPostError('Informe o título e o comunicado.'); return; }
    locks.current.add('post'); setPosting(true); setPostError('');
    const row = { id: 'post_' + crypto.randomUUID(), title: newTitle.trim(), content: newContent.trim(), created_at: new Date().toISOString(), created_by: profile.id };
    try {
      if (!navigator.onLine) queue('create_post', row);
      else if (supabase) { const { error } = await supabase.from('announcements').insert(row); if (error) throw error; }
      setPosts(previous => [row, ...previous]); setNewTitle(''); setNewContent(''); setNewPostOpen(false);
      await notifyChange();
    } catch (error) { setPostError('Não foi possível publicar. ' + (error.message || 'Tente novamente.')); }
    finally { locks.current.delete('post'); setPosting(false); }
  };
  const addComment = postId => runAction(`comment:${postId}`, postId, async () => {
    const text = (commentTexts[postId] || '').trim();
    if (!text || !profile?.id) return;
    const row = { id: 'comment_' + crypto.randomUUID(), post_id: postId, member_id: profile.id, text, created_at: new Date().toISOString() };
    if (!navigator.onLine) queue('create_comment', row);
    else if (supabase) { const { error } = await supabase.from('announcement_comments').insert(row); if (error) throw error; }
    setComments(previous => [...previous, row]); setCommentTexts(previous => ({ ...previous, [postId]: '' }));
    await notifyChange();
  });
  const toggleReaction = (postId, emoji) => runAction(`reaction:${postId}:${emoji}`, postId, async () => {
    if (!profile?.id) return;
    const row = { post_id: postId, member_id: profile.id, emoji };
    const exists = reactions.some(reaction => reaction.post_id === postId && reaction.member_id === profile.id && reaction.emoji === emoji);
    if (!navigator.onLine) queue('toggle_reaction', { action: exists ? 'delete' : 'insert', row });
    else if (supabase) { const { error } = await (exists ? supabase.from('announcement_reactions').delete().match(row) : supabase.from('announcement_reactions').insert(row)); if (error) throw error; }
    setReactions(previous => exists ? previous.filter(reaction => !(reaction.post_id === postId && reaction.member_id === profile.id && reaction.emoji === emoji)) : [...previous, row]);
    await notifyChange();
  });
  const toggleSave = postId => runAction(`save:${postId}`, postId, async () => {
    if (!navigator.onLine && supabase) throw new Error('Conecte-se para salvar este aviso.');
    const exists = saves.includes(postId), row = { post_id: postId, member_id: profile.id };
    if (supabase) { const { error } = await (exists ? supabase.from('announcement_saves').delete().match(row) : supabase.from('announcement_saves').insert(row)); if (error) throw error; }
    setSaves(previous => exists ? previous.filter(id => id !== postId) : [...previous, postId]);
  });
  const authorFor = id => members.find(member => member.id === id) || { name: 'Membro', avatar: 'MB', color: '#7b3ff2' };
  const filteredPosts = posts.filter(post => filter === 'saved' ? saves.includes(post.id) : filter === 'rehearsal' ? rehearsalPost(post) : true);
  const reactionPost = reactionMenu && filteredPosts.find(post => post.id === reactionMenu.postId);
  const openComposer = () => { if (profile?.is_admin) { setPostError(''); setNewPostOpen(true); } };

  return <div className="app-page aUp community-mural" data-theme={dark ? 'dark' : 'light'}>
    <div className="community-heading"><span aria-hidden="true">📢</span><h2>Mural de Comunicados</h2></div>
    {profile?.is_admin && <div className="community-compose"><Avatar member={profile}/><button type="button" className="community-compose-prompt" onClick={openComposer}>Compartilhe um aviso com a equipe…</button><button type="button" className="community-new-button" onClick={openComposer} aria-label="Novo Aviso"><Icon name="plus" size={16}/><span>Novo aviso</span></button></div>}
    <div className="community-filters" role="group" aria-label="Filtrar comunicados">{[['all', 'Todos'], ['saved', 'Salvos'], ['rehearsal', 'Ensaios']].map(([id, label]) => <button className="community-filter" type="button" key={id} aria-pressed={filter === id} onClick={() => { closeReactions(); setFilter(id); }}>{label}</button>)}</div>
    {notice && <p className="community-message" role="status">{notice}</p>}
    {loadError && <div className="community-message community-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => refresh({ initial: true })}>Tentar novamente</button></div>}
    {loading && !posts.length ? <p className="community-loading" role="status">Carregando comunicados…</p> : <div className="community-feed">{filteredPosts.map(post => {
      const author = authorFor(post.created_by), postComments = comments.filter(comment => comment.post_id === post.id), postReactions = reactions.filter(reaction => reaction.post_id === post.id);
      const saved = saves.includes(post.id), liked = postReactions.some(reaction => reaction.member_id === profile.id && reaction.emoji === '👍');
      const photo = safeImage(post), visibleComments = expandedComments[post.id] ? postComments : postComments.slice(-1);
      return <ObservedPost key={post.id} post={post} enabled={!newPostOpen} onView={() => activity?.recordView('announcement', post.id)} className="community-post">
        <header className="community-post-header"><Avatar member={author}/><div className="community-author"><strong>{author.name}</strong><small>{author.role || author.instrument || 'Ministério'} · <time dateTime={post.created_at}>{dateText(post.created_at)}</time></small></div><button type="button" className="community-save" aria-label={`${saved ? 'Remover dos salvos' : 'Salvar aviso'}: ${post.title}`} aria-pressed={saved} disabled={pending[`save:${post.id}`]} onClick={() => toggleSave(post.id)}><SocialIcon name="save"/></button></header>
        <div className={'community-post-body' + (rehearsalPost(post) ? ' community-post-rehearsal' : '')}><h3>{post.title}</h3><p>{post.content}</p></div>
        {photo && <img className="community-post-photo" src={photo} alt={'Imagem de ' + post.title} loading="lazy"/>}
        {profile?.is_admin && <div className="community-viewers"><ViewersButton activity={activity} targetType="announcement" targetId={post.id} title={post.title} members={members} dark={dark}/></div>}
        <div className="community-social-summary"><span><span aria-hidden="true">{postReactions.length ? [...new Set(postReactions.map(reaction => reaction.emoji))].slice(0, 3).join('') : '♡'}</span> {postReactions.length} {postReactions.length === 1 ? 'reação' : 'reações'}</span><button type="button" onClick={() => setExpandedComments(previous => ({ ...previous, [post.id]: !previous[post.id] }))} aria-expanded={!!expandedComments[post.id]}>{postComments.length} {postComments.length === 1 ? 'comentário' : 'comentários'}</button></div>
        <div className="community-social-actions"><button type="button" aria-pressed={liked} disabled={pending[`reaction:${post.id}:👍`]} onClick={() => toggleReaction(post.id, '👍')}><SocialIcon name="like"/>Curtir</button><button type="button" aria-haspopup="menu" aria-controls={reactionMenu?.postId === post.id ? reactionMenuId : undefined} aria-expanded={reactionMenu?.postId === post.id} onClick={event => setReactionMenu(reactionMenu?.postId === post.id ? null : { postId: post.id, anchor: event.currentTarget })}><span aria-hidden="true">♡</span>Reagir</button><button type="button" aria-expanded={!!expandedComments[post.id]} onClick={() => setExpandedComments(previous => ({ ...previous, [post.id]: !previous[post.id] }))}><SocialIcon name="comment"/>Comentar</button></div>
        {!!visibleComments.length && <div className="community-comments">{visibleComments.map(comment => { const member = authorFor(comment.member_id); return <div className="community-comment" key={comment.id}><Avatar member={member} small/><div><strong>{member.name}</strong><p>{comment.text}</p></div></div>; })}</div>}
        {expandedComments[post.id] && <form className="community-comment-form" onSubmit={event => { event.preventDefault(); addComment(post.id); }}><input aria-label={'Escrever comentário em ' + post.title} data-update-blocking={!!commentTexts[post.id]?.trim()} value={commentTexts[post.id] || ''} onChange={event => setCommentTexts(previous => ({ ...previous, [post.id]: event.target.value }))} placeholder="Escreva um comentário..." required/><button type="submit" disabled={pending[`comment:${post.id}`] || !commentTexts[post.id]?.trim()}>{pending[`comment:${post.id}`] ? 'Enviando…' : 'Enviar'}</button></form>}
        {actionErrors[post.id] && <p className="community-post-error" role="alert">{actionErrors[post.id]}</p>}
      </ObservedPost>;
    })}{!filteredPosts.length && !loading && <div className="community-empty"><Icon name="note" size={28}/><strong>{filter === 'saved' ? 'Nenhum aviso salvo' : filter === 'rehearsal' ? 'Nenhum aviso de ensaio' : 'Nenhum comunicado no mural'}</strong><p>{filter === 'saved' ? 'Use o marcador no aviso para encontrá-lo aqui.' : 'Os comunicados da equipe aparecerão aqui.'}</p></div>}</div>}
    {reactionPost && <ReactionPicker id={reactionMenuId} anchor={reactionMenu.anchor} postTitle={reactionPost.title} dark={dark} selected={reactions.filter(reaction => reaction.post_id === reactionPost.id && reaction.member_id === profile.id).map(reaction => reaction.emoji)} pending={['👍', '🙏', '🎵', '🔥'].filter(emoji => pending[`reaction:${reactionPost.id}:${emoji}`])} onSelect={emoji => toggleReaction(reactionPost.id, emoji)} onClose={closeReactions}/>}
    {newPostOpen && <Dialog dark={dark} icon="note" title="Novo Comunicado" description="Publique um aviso para a equipe." closeLabel="Fechar novo comunicado" busy={posting} onClose={() => setNewPostOpen(false)} footer={<>{postError && <p className="ui-message ui-error" role="alert">{postError}</p>}<div className="ui-dialog-buttons"><button type="button" className="ui-button" disabled={posting} onClick={() => setNewPostOpen(false)}>Cancelar</button><button type="submit" form={formId} className="ui-button ui-button-primary" disabled={posting}>{posting ? 'Publicando…' : 'Publicar'}</button></div></>}>
      <form id={formId} onSubmit={createPost}><label className="ui-field">Título do aviso<input autoFocus placeholder="Título do post *" value={newTitle} onChange={event => setNewTitle(event.target.value)} required disabled={posting}/></label><label className="ui-field">Comunicado<textarea placeholder="Escreva o comunicado aqui..." value={newContent} onChange={event => setNewContent(event.target.value)} rows={7} required disabled={posting}/></label></form>
    </Dialog>}
  </div>;
});
