import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_UPLOAD_RULES, webpBytesFromDataUrl } from "../shared/image-upload.mjs";

test("image uploads normalize to WebP within the shared size limit", () => {
  assert.deepEqual(IMAGE_UPLOAD_RULES.acceptedMimeTypes, ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(IMAGE_UPLOAD_RULES.outputMimeType, "image/webp");
  assert.equal(IMAGE_UPLOAD_RULES.extension, ".webp");
  assert.equal(IMAGE_UPLOAD_RULES.maxBytes, 3 * 1024 * 1024);
  assert.equal(IMAGE_UPLOAD_RULES.maxEdge, 1920);

  const bytes = Uint8Array.from([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
  const dataUrl = `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`;
  assert.deepEqual(webpBytesFromDataUrl(dataUrl), bytes);
});

test("the upload boundary rejects content mislabeled as WebP", () => {
  const pngHeader = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const dataUrl = `data:image/webp;base64,${Buffer.from(pngHeader).toString("base64")}`;
  assert.throws(() => webpBytesFromDataUrl(dataUrl), /WebP/);
});
