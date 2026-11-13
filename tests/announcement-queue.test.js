import test from 'node:test';
import assert from 'node:assert/strict';
import { remapAnnouncementTask } from '../src/lib/announcement-queue.js';

test('legacy comments adopt the canonical publication ID without changing the original task or metadata', () => {
  const data = Object.freeze({ id: 'comment-local', post_id: 'post-local', member_id: 'member', text: 'Estarei lá!', created_at: '2026-11-13T12:00:00Z' });
  const task = Object.freeze({ id: 'job-comment', type: 'create_comment', actorId: 'member', attempts: 2, data });
  const mapped = remapAnnouncementTask(task, 'post-local', 501);
  assert.deepEqual(mapped, { ...task, data: { ...data, post_id: 501 } });
  assert.notEqual(mapped, task);
  assert.notEqual(mapped.data, data);
  assert.equal(task.data.post_id, 'post-local');
});

for (const action of ['insert', 'delete']) test(`legacy reaction ${action} preserves its intent while adopting the canonical ID`, () => {
  const row = Object.freeze({ post_id: '71', member_id: 'member', emoji: '🙏' });
  const data = Object.freeze({ action, row });
  const task = Object.freeze({ id: 'job-reaction', type: 'toggle_reaction', actorId: 'member', data });
  const mapped = remapAnnouncementTask(task, 71, 'canonical-post');
  assert.deepEqual(mapped, { ...task, data: { action, row: { ...row, post_id: 'canonical-post' } } });
  assert.notEqual(mapped.data.row, row);
  assert.equal(task.data.row.post_id, '71');
});

test('unrelated and incomplete jobs are retained unchanged', () => {
  const tasks = [
    { id: 'publish', type: 'create_post', data: { id: 'post-local' } },
    { id: 'other-comment', type: 'create_comment', data: { post_id: 'other-post' } },
    { id: 'other-reaction', type: 'toggle_reaction', data: { action: 'insert', row: { post_id: 'other-post' } } },
    { type: 'create_comment' },
    { type: 'toggle_reaction', data: { action: 'insert' } },
    { type: 'save_rehearsal_note', data: { song_id: 'post-local' } },
    null,
  ];
  for (const task of tasks) assert.equal(remapAnnouncementTask(task, 'post-local', 501), task);
  const task = { type: 'create_comment', data: { post_id: 'post-local' } };
  assert.equal(remapAnnouncementTask(task, null, 501), task);
  assert.equal(remapAnnouncementTask(task, 'post-local', undefined), task);
});

test('ID matching accepts numeric/string equivalence and preserves the saved ID type, including zero', () => {
  const task = { type: 'create_comment', data: { post_id: '0' } };
  assert.equal(remapAnnouncementTask(task, 0, 101).data.post_id, 101);
  assert.equal(remapAnnouncementTask(task, '0', 0).data.post_id, 0);
  assert.equal(task.data.post_id, '0');
});
