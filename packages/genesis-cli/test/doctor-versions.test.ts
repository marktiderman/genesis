import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const umbrella = (packages: Record<string, string>) => ({
  "node_modules/@marktiderman/genesis/package.json": JSON.stringify({ name: "@marktiderman/genesis", version: "1.0.0" }),
  "node_modules/@marktiderman/genesis/dist/versions.json": JSON.stringify({ version: "1.0.0", packages }),
});

const skew = async (root: string) => (await runDoctor({ root, config: {} })).findings.filter((f) => f.rule === "version-skew");

describe("version-skew", () => {
  it("says nothing without the umbrella", async () => {
    expect(await skew(makeApp(null))).toEqual([]);
  });

  it("says nothing when every installed package matches the release", async () => {
    expect(await skew(makeApp(null, umbrella({ "@marktiderman/genesis-ui": "9.9.9", "@marktiderman/genesis-forms": "1.0.0" })))).toEqual([]);
  });

  it("warns for each installed package on another version", async () => {
    const found = await skew(makeApp(null, umbrella({ "@marktiderman/genesis-ui": "2.12.0", "@marktiderman/genesis-core": "9.9.9" })));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "warn", subject: "@marktiderman/genesis-ui", file: "package.json" });
    expect(found[0]!.message).toContain("9.9.9");
    expect(found[0]!.message).toContain("2.12.0");
  });
});
