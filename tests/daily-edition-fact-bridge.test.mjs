import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyEditionFromFactRecord, validateDailyEdition } from '../shared/daily-edition.mjs';

const fact = (overrides = {}) => ({
  section: 'week_changes',
  event_key: 'voice-app::room-update::v2',
  reported_title: '语聊房新版本上线',
  verified_facts: ['官方说明新增多人语聊房'],
  event_date: '2026-10-14',
  source_urls: ['https://news.example.org/room-update'],
  verification_status: 'verified',
  ...overrides,
});

test('already reported facts without substantive new detail do not re-enter the website edition', () => {
  const edition = createDailyEditionFromFactRecord({ items: [
    fact({ event_key: 'old-null', previously_reported: true, substantive_new_detail: null }),
    fact({ event_key: 'old-empty', previously_reported: true, substantive_new_detail: '' }),
    fact({ event_key: 'old-space', previously_reported: true, substantive_new_detail: '  ' }),
    fact({ event_key: 'newly-verified', previously_reported: false }),
  ] });
  assert.deepEqual(edition.sections.map(section => section.items.map(item => item.eventKey)), [[], [], ['newly-verified']]);
  assert.equal(edition.leadItemId, 'newly-verified');
  assert.equal(validateDailyEdition(edition).ok, true);
  assert.throws(() => createDailyEditionFromFactRecord({ items: [
    fact({ event_key: 'old', previously_reported: true, substantive_new_detail: null }),
  ] }, { leadEventKey: 'old' }), /Selected lead/);
});

test('an already reported event may return when a substantive new detail is recorded', () => {
  const edition = createDailyEditionFromFactRecord({ items: [
    fact({ event_key: 'room-update', previously_reported: true, substantive_new_detail: '新版已在新加坡开放' }),
    fact({ event_key: 'room-update', previously_reported: true, substantive_new_detail: '重复' }),
  ] });
  assert.deepEqual(edition.sections[2].items.map(item => item.eventKey), ['room-update']);
  assert.equal(edition.leadItemId, 'room-update');
  assert.equal(validateDailyEdition(edition).ok, true);
});
