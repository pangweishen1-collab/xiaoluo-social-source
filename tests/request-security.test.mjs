import test from "node:test";
import assert from "node:assert/strict";
import { isCrossOriginMutation } from "../shared/request-security.mjs";
test("writes reject cross-origin and cross-site requests but keep same-origin and CLI access", () => {
  const request = headers => new Request("https://site.test/api/articles", { method: "POST", headers });
  assert.equal(isCrossOriginMutation(request({ Origin: "https://other.test" })), true);
  assert.equal(isCrossOriginMutation(request({ Origin: "null" })), true);
  assert.equal(isCrossOriginMutation(request({ "Sec-Fetch-Site": "cross-site" })), true);
  assert.equal(isCrossOriginMutation(request({ Origin: "https://site.test" })), false);
  assert.equal(isCrossOriginMutation(request({})), false);
  assert.equal(isCrossOriginMutation(new Request("https://site.test/api/articles", { headers: { Origin: "https://other.test" } })), false);
});
