import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_REF, catalogFeatures } from "../hub-catalog-sync.mjs";

describe("hub-catalog-sync", () => {
  it("names this repo's catalog", () => {
    expect(CATALOG_REF).toBe("marktiderman/genesis");
  });

  it("sends each feature's key, name, status and owner, retired ones included", () => {
    expect(
      catalogFeatures({
        features: [
          { id: "a", name: "A", status: "live", owner: "mark", summary: "not sent" },
          { id: "b", name: "B", status: "retired" },
        ],
      }),
    ).toEqual([
      { key: "a", name: "A", status: "live", owner: "mark" },
      { key: "b", name: "B", status: "retired", owner: null },
    ]);
  });

  it("reads the committed registry, every feature with a status the hub knows", () => {
    const registry = JSON.parse(readFileSync(join(import.meta.dirname, "../../features.json"), "utf8"));
    const features = catalogFeatures(registry);
    expect(features.length).toBe(registry.features.length);
    const hub = new Set(["idea", "planned", "building", "beta", "live", "deprecated", "retired"]);
    expect(features.filter((f) => !hub.has(f.status))).toEqual([]);
  });
});
