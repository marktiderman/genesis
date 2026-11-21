// @feat:native-previews
import { describe, expect, it } from "vitest";
import { isPreviewPath } from "../src/lib/preview-path";

describe("isPreviewPath: the preview links +native-intent opens without holding", () => {
  it("is the path normalizeLink opens previews at: the default, or links.previews.path", () => {
    for (const to of ["/preview", "/preview?channel=pr-42", "/preview/pr-42"]) expect(isPreviewPath(to, undefined, "/preview"), to).toBe(true);
    for (const to of ["/previews", "/preview-settings", "/clients/1"]) expect(isPreviewPath(to, undefined, "/preview"), to).toBe(false);
    const custom = { path: "/try" };
    for (const to of ["/try", "/try?channel=pr-42", "/try/pr-42"]) expect(isPreviewPath(to, custom, "/preview"), to).toBe(true);
    // The default path is an ordinary route once the app moved previews elsewhere.
    for (const to of ["/preview?channel=pr-42", "/try-it", "/tryouts"]) expect(isPreviewPath(to, custom, "/preview"), to).toBe(false);
    expect(isPreviewPath("/try/?channel=pr-1", { path: "/try/" }, "/preview")).toBe(true);
    // Previews off: every link is held.
    expect(isPreviewPath("/preview?channel=pr-42", false, "/preview")).toBe(false);
  });
});
