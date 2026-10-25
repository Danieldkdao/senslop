import type {
  PreviewImageAssetSchema,
  PreviewImageSchema,
} from "@senslop/contracts";

export const freezeImagePreview = (
  path: string,
  before: Buffer | null,
  after: Buffer | null,
): PreviewImageSchema | undefined => {
  if (!/\.(?:png|jpe?g|webp)$/i.test(path)) return undefined;
  let unavailableReason: string | undefined;
  const freeze = (bytes: Buffer | null): PreviewImageAssetSchema | null => {
    if (!bytes) return null;
    if (bytes.length > 2 * 1024 * 1024) {
      unavailableReason = "Image exceeds the 2 MiB preview limit.";
      return null;
    }
    const mime = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : null;
    if (!mime) {
      unavailableReason =
        "Image format could not be verified from captured bytes.";
      return null;
    }
    return { mime, base64: bytes.toString("base64") };
  };
  const previewBefore = freeze(before);
  const previewAfter = freeze(after);
  return {
    before: previewBefore,
    after: previewAfter,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
};
