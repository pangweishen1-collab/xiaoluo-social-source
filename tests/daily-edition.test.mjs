import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_SECTION_KEYS, prepareDailyEdition } from "../app/daily-edition.mjs";

const item = (id, title, eventKey = id) => ({ id, title, eventKey, summary: `${title}摘要`, sourceUrls: ["https://example.com/story", "http://example.com/unsafe", "javascript:alert(1)"] });

test("daily edition has exactly three ordered columns and promotes each story once", () => {
  const edition = prepareDailyEdition({ schemaVersion: 1, leadItemId: "lead", highlightIds: ["hiring", "hiring", "missing"], sections: [
    { key: "week_changes", items: [item("change", "产品变化"), item("repeat", "重复事件", "lead")] },
    { key: "hiring", items: [item("hiring", "招聘动向")] },
    { key: "radar", items: [item("lead", "产品头条"), item("radar2", "新产品")] },
  ] });
  assert.deepEqual(edition.sections.map((section) => section.key), DAILY_SECTION_KEYS);
  assert.equal(edition.sections[2].label, "语聊直播产品近一周变化");
  assert.equal(edition.total, 4);
  assert.equal(edition.lead.id, "lead");
  assert.deepEqual(edition.highlights.map((story) => story.id), ["hiring"]);
  assert.deepEqual(edition.sections.map((section) => section.items.map((story) => story.id)), [["radar2"], [], ["change"]]);
  assert.equal(edition.sections[1].originalCount, 1);
  assert.deepEqual(edition.lead.sourceUrls, ["https://example.com/story"]);
});

test("invalid or empty structured editions leave historical Markdown available", () => {
  assert.equal(prepareDailyEdition(null), null);
  assert.equal(prepareDailyEdition({ schemaVersion: 1, sections: [] }), null);
  assert.equal(prepareDailyEdition({ schemaVersion: 1, sections: [{ key: "radar", items: [{ id: "bad", title: "" }] }] }), null);
});
