import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { introspectSettings } from "../src/introspect/settings.js";

const cwd = path.resolve("/app/packages/web");
const configDir = path.resolve("/app");

describe("introspectSettings", () => {
  it("defaults when nothing is set", () => {
    expect(introspectSettings({}, cwd)).toEqual({
      target: path.join(cwd, "resources.genesis.ts"),
      label: "resources.genesis.ts",
      schemas: ["public"],
      databaseEnv: "DATABASE_URL",
    });
  });

  it("follows doctor.contracts, relative to the config's folder", () => {
    const s = introspectSettings({}, cwd, { out: "src/resources.genesis.ts", schemas: ["public", "work"], databaseEnv: "DB_URL" }, configDir);
    expect(s.target).toBe(path.join(configDir, "src/resources.genesis.ts"));
    expect(s.label).toBe("src/resources.genesis.ts");
    expect(s.schemas).toEqual(["public", "work"]);
    expect(s.databaseEnv).toBe("DB_URL");
  });

  it("lets flags win, with -o relative to where the command runs", () => {
    const s = introspectSettings({ out: "x.ts", schema: "a, b", databaseEnv: "OTHER" }, cwd, { out: "src/resources.genesis.ts", schemas: ["public"] }, configDir);
    expect(s.target).toBe(path.join(cwd, "x.ts"));
    expect(s.schemas).toEqual(["a", "b"]);
    expect(s.databaseEnv).toBe("OTHER");
  });

  it("falls back to public when contracts.schemas is empty", () => {
    expect(introspectSettings({}, cwd, { schemas: [] }).schemas).toEqual(["public"]);
  });
});
