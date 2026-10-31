import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { introspectSettings } from "../src/introspect/settings.js";

const root = path.resolve("/app");

describe("introspectSettings", () => {
  it("defaults when nothing is set", () => {
    expect(introspectSettings({}, root)).toEqual({
      target: path.join(root, "resources.genesis.ts"),
      label: "resources.genesis.ts",
      schemas: ["public"],
      databaseEnv: "DATABASE_URL",
    });
  });

  it("follows doctor.contracts, relative to the app root like the doctor", () => {
    const s = introspectSettings({}, root, { out: "src/resources.genesis.ts", schemas: ["public", "work"], databaseEnv: "DB_URL" });
    expect(s.target).toBe(path.join(root, "src/resources.genesis.ts"));
    expect(s.label).toBe("src/resources.genesis.ts");
    expect(s.schemas).toEqual(["public", "work"]);
    expect(s.databaseEnv).toBe("DB_URL");
  });

  it("lets flags win", () => {
    const s = introspectSettings({ out: "x.ts", schema: "a, b", databaseEnv: "OTHER" }, root, { out: "src/resources.genesis.ts", schemas: ["public"] });
    expect(s.target).toBe(path.join(root, "x.ts"));
    expect(s.schemas).toEqual(["a", "b"]);
    expect(s.databaseEnv).toBe("OTHER");
  });

  it("keeps the schemas the existing contract names when the config doesn't", () => {
    const read = (file: string) => (file === path.join(root, "resources.genesis.ts") ? "// Generated\n// Source: Postgres (public, private)\n" : null);
    expect(introspectSettings({}, root, undefined, read).schemas).toEqual(["public", "private"]);
    expect(introspectSettings({}, root, { schemas: [] }, read).schemas).toEqual(["public", "private"]);
    expect(introspectSettings({}, root, { schemas: ["work"] }, read).schemas).toEqual(["work"]);
  });

  it("reads one schema for --openapi", () => {
    expect(introspectSettings({ openapi: "spec.json" }, root, { schemas: ["public", "work"] }).schemas).toEqual(["public"]);
    expect(introspectSettings({ openapi: "spec.json" }, root, { schemas: ["work"] }).schemas).toEqual(["work"]);
  });
});
