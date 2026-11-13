// Offline interactions created by older app versions may still reference the
// local post ID after the database assigns its authoritative ID on publication.
export function remapAnnouncementTask(task, localId, savedId) {
  const matches = postId => postId != null && localId != null && savedId != null && String(postId) === String(localId);
  if (task?.type === 'create_comment' && matches(task.data?.post_id)) {
    return { ...task, data: { ...task.data, post_id: savedId } };
  }
  if (task?.type === 'toggle_reaction' && matches(task.data?.row?.post_id)) {
    return { ...task, data: { ...task.data, row: { ...task.data.row, post_id: savedId } } };
  }
  return task;
}
