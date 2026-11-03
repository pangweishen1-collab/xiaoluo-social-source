import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMessagesByDay } from '../app/message-groups.mjs';
test('groups messages by Beijing day in chat chronology and keeps unknown dates separate', () => {
  const rows=[{id:'old',createdAt:Date.parse('2026-09-20T15:59:00Z')},{id:'new',createdAt:Date.parse('2026-09-20T17:00:00Z')},{id:'same',createdAt:Date.parse('2026-09-20T16:00:00Z')},{id:'unknown'}];
  const groups=groupMessagesByDay(rows);
  assert.deepEqual(groups.map(g=>g.day),['','2026-09-20','2026-09-21']);
  assert.deepEqual(groups[2].messages.map(m=>m.id),['same','new']);
  assert.equal(rows[0].id,'old');
  assert.deepEqual(groupMessagesByDay([]),[]);
});
