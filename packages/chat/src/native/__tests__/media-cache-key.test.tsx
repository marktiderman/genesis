// @vitest-environment happy-dom
// @feat:chat
import { describe, expect, it } from "vitest";
import type { ChatAttachment } from "../../core/types";
import { fromServer } from "../media";

const photo = { id: "a1", kind: "image", provider: "storage", path: "conv/1/photo.jpg", url: null, name: "photo.jpg" } as unknown as ChatAttachment;

describe("a photo's cache key", () => {
  it("is its storage path, so a re-signed link hits expo-image's disk cache instead of downloading again", () => {
    const first = fromServer(photo, { "conv/1/photo.jpg": "https://x/photo.jpg?token=1" });
    const resigned = fromServer(photo, { "conv/1/photo.jpg": "https://x/photo.jpg?token=2" });
    expect(first.uri).not.toBe(resigned.uri);
    expect(first.cacheKey).toBe("conv/1/photo.jpg");
    expect(resigned.cacheKey).toBe(first.cacheKey);
  });

  it("is left to the URL for a file that isn't in storage", () => {
    expect(fromServer({ ...photo, provider: "mux", path: null, url: "https://x/v.jpg" } as unknown as ChatAttachment, {}).cacheKey).toBeNull();
  });
});
