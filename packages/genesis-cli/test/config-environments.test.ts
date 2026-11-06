import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { readGenesisConfig, validateEnvironments } from "../src/doctor/config.js";

describe("genesis.config.json environments", () => {
  it("accepts the preview settings", () => {
    expect(validateEnvironments({ previews: "every-pr", label: "", branchPrefix: "try/" })).toEqual({ previews: "every-pr", label: "", branchPrefix: "try/" });
  });
  it("fails a typo instead of silently ignoring it", () => {
    expect(() => validateEnvironments({ preview: "off" })).toThrow(/unknown setting "preview"/);
    expect(() => validateEnvironments({ previews: "always" })).toThrow(/must be "on-demand", "every-pr" or "off"/);
    expect(() => validateEnvironments({ label: 1 })).toThrow(/environments.label must be a string/);
  });
  it("is read from the app's genesis.config.json", () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-env-"));
    writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ environments: { previews: "off" } }));
    expect(readGenesisConfig(root)?.environments).toEqual({ previews: "off" });
  });
});
