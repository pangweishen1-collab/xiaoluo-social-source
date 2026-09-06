export const IMAGE_UPLOAD_RULES = Object.freeze({
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  accept: "image/jpeg,image/png,image/webp",
  outputMimeType: "image/webp",
  extension: ".webp",
  maxBytes: 3 * 1024 * 1024,
  maxEdge: 1920,
  minEdge: 480,
  qualities: [.82, .7, .58, .46],
});

export function webpBytesFromDataUrl(value) {
  const match = typeof value === "string" && /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("图片必须是 WebP 格式。");
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  if (!bytes.byteLength || bytes.byteLength > IMAGE_UPLOAD_RULES.maxBytes) throw new Error("图片必须是小于 3MB 的 WebP 格式。");
  const signature = String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12));
  if (signature !== "RIFFWEBP") throw new Error("图片内容不是有效的 WebP 格式。");
  return bytes;
}
