import test from "node:test";
import assert from "node:assert/strict";
import { publishReviewedHotSnapshot, validateReviewedHotSnapshot } from "../scripts/publish-reviewed-hot.mjs";
import { buildHotList } from "../shared/hot-list.mjs";

const NOW = Date.parse("2026-10-19T05:00:00Z");
function candidate() {
  const topics = ["TikTok", "WhatsApp", "Facebook", "Instagram", "Threads", "Discord", "Reddit", "Snapchat", "Twitch", "Telegram"];
  const result = { methodVersion: 9, updatedAt: new Date(NOW).toISOString(), status: "ready", stale: false, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160, sources: [], failedSources: [],
    ...buildHotList(topics.map((topic, index) => ({ sourceId: "techcrunch", title: `${topic} launches new voice chat controls`, url: `https://techcrunch.com/2026/10/19/verified-${index}/`, publishedAt: new Date(NOW - (index + 1) * 60_000).toISOString() })), new Date(NOW)) };
  result.rankings = result.rankings.map((story) => {
    const source = story.sources[0];
    return { ...story, detail: { status: "ready", titleZh: `${story.topic} 推出具体的语音控制功能`, change: "平台为语音通话新增主持人审批，适用于本次测试的受邀用户。", whyItMatters: "审批改变了进入通话的门槛，需关注主持人的管理负担与新访客的加入情况。", evidenceQuote: "New voice chat controls let hosts approve invited speakers before they join.", sourceUrl: source.url, sourceName: source.name, sourceTitle: source.title, sourceFeedPublishedAt: source.publishedAt, sourcePublishedAt: source.publishedAt, verifiedAt: new Date(NOW).toISOString() } };
  });
  return result;
}

test("reviewed release validates the exact ten-item candidate and removes private diagnostics", async () => {
  const data = candidate();
  const checked = await validateReviewedHotSnapshot({ ...data, diagnostics: [{ reason: "private_review_only" }] }, NOW);
  assert.equal(checked.candidate.rankings.length, 10);
  assert(!checked.json.includes("private_review_only"));
  assert.match(checked.sha256, /^[a-f0-9]{64}$/);
});

test("reviewed release refuses partial, stale, unapproved or source-mismatched candidates before any database operation", async () => {
  for (const change of [
    (data) => data.rankings.pop(),
    (data) => { data.rankings[0].detail.status = "rejected"; },
    (data) => { data.rankings[0].detail.sourceTitle = "A different source article"; },
    (data) => { data.previousProposal = "transient copy"; },
  ]) {
    const data = candidate(); change(data);
    await assert.rejects(validateReviewedHotSnapshot(data, NOW));
  }
  await assert.rejects(validateReviewedHotSnapshot(candidate(), NOW + 31 * 60_000), /thirty minutes/);
});

test("reviewed publication reports success only after one write and exact production readback", async () => {
  const data = candidate();
  const expected = await validateReviewedHotSnapshot(data, NOW);
  const calls = [];
  const result = await publishReviewedHotSnapshot(data, { now: NOW, execute: async (args) => {
    calls.push(args);
    return JSON.stringify(args[0] === "--file"
      ? [{ success: true, meta: { changes: 1 }, results: [] }]
      : [{ success: true, results: [{ updated_at: data.updatedAt, payload_json: expected.json }] }]);
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "--file");
  assert.equal(calls[1][0], "--command");
  assert.deepEqual(result, { reviewedAt: data.updatedAt, rankings: 10, sha256: expected.sha256, written: true });
});

test("a skipped or unacknowledged production write cannot masquerade as a completed release", async () => {
  for (const acknowledgement of [
    [{ success: true, meta: { changes: 0 }, results: [] }],
    [{ success: false, meta: { changes: 1 }, results: [] }],
    [{ success: true, results: [] }],
    [],
    "not json",
  ]) {
    let calls = 0;
    await assert.rejects(publishReviewedHotSnapshot(candidate(), { now: NOW, execute: async () => {
      calls += 1;
      return typeof acknowledgement === "string" ? acknowledgement : JSON.stringify(acknowledgement);
    } }));
    assert.equal(calls, 1, "no readback success can hide a missing write acknowledgement");
  }
});

test("a production readback with different content or timestamp fails instead of reporting the candidate hash", async () => {
  const data = candidate();
  const expected = await validateReviewedHotSnapshot(data, NOW);
  for (const persisted of [
    { updated_at: data.updatedAt, payload_json: JSON.stringify({ different: "production payload" }) },
    { updated_at: new Date(NOW + 60_000).toISOString(), payload_json: expected.json },
    null,
  ]) {
    let calls = 0;
    await assert.rejects(publishReviewedHotSnapshot(data, { now: NOW, execute: async () => {
      calls += 1;
      return JSON.stringify(calls === 1 ? [{ success: true, meta: { changes: 1 }, results: [] }]
        : [{ success: true, results: persisted ? [persisted] : [] }]);
    } }), /Production snapshot/);
    assert.equal(calls, 2);
  }
});
