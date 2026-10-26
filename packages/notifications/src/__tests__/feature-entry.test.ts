// @feat:notifications
// The email channel's entry in the feature registry (features.json, built from features.ts) tells the truth about it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Entry = { id: string; status?: string; platforms?: Record<string, string> };
const { features } = JSON.parse(readFileSync(join(__dirname, "../../../../features.json"), "utf8")) as { features: Entry[] };

describe("notifications-email in the feature registry", () => {
  it("is building on the server, not deprecated", () => {
    const entry = features.find((f) => f.id === "notifications-email");
    expect(entry?.status).toBe("building");
    expect(entry?.platforms?.server).toBe("building");
  });
});
