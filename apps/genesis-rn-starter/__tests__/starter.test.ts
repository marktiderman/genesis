// @feat:native-starter
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import starter from "../starter.config";
import { defineStarter, type StarterConfig } from "../src/lib/define-starter";
import { copy, format } from "../src/copy";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
// Wherever the package manager put it (hoisted to the workspace root here).
const supabasePackage = dirname(createRequire(join(root, "package.json")).resolve("@marktiderman/genesis-supabase/package.json"));
const shippedSql = (path: string) => readFileSync(join(supabasePackage, "migrations", path), "utf8");

function filesUnder(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("root layout", () => {
  it("stays within 30 lines: GenesisNativeApp owns everything above the screens", () => {
    const lines = read("src/app/_layout.tsx").trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(lines.join("\n")).toContain("<GenesisNativeApp");
  });
});

describe("starter.config.ts", () => {
  it("ships with every universal feature on", () => {
    const off = Object.entries(starter.features).filter(([, on]) => !on);
    expect(off).toEqual([]);
  });

  it("refuses a config with no way to sign in", () => {
    const none: StarterConfig = { ...starter, features: { ...starter.features, emailSignIn: false, appleSignIn: false } };
    expect(() => defineStarter(none)).toThrow(/nobody can sign in/);
  });

  it("refuses a scheme written as a URL", () => {
    expect(() => defineStarter({ ...starter, app: { ...starter.app, scheme: "myapp://" } })).toThrow(/app\.scheme/);
  });
});

describe("copy catalog", () => {
  it("has no empty strings", () => {
    const empty: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (!node.trim()) empty.push(path);
      } else for (const [key, value] of Object.entries(node as object)) walk(value, path ? `${path}.${key}` : key);
    };
    walk(copy, "");
    expect(empty).toEqual([]);
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(format("Sent to {email} {other}", { email: "a@b.c" })).toBe("Sent to a@b.c {other}");
  });

  // Every user-facing string comes from src/copy.ts, so a translation covers the whole app.
  it("is the only source of user-facing text in the screens", () => {
    const offenders: string[] = [];
    for (const file of filesUnder("src/app").filter((f) => f.endsWith(".tsx"))) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const jsxText = code.match(/>\s*[A-Za-z][^<>{}]*</g) ?? [];
      // title="…" and title={"…"} (a JSX prop), or title: "…" (an options object).
      const literalProps =
        code.match(/\b(label|title|headline|subhead|body|placeholder|accessibilityLabel|submitLabel|headerTitle|emptyTitle|emptyBody|text)(?:=\s*\{?\s*|:\s*)["'`][A-Za-z]/g) ?? [];
      for (const hit of [...jsxText, ...literalProps]) offenders.push(`${relative(root, join(root, file))}: ${hit.trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("supabase/migrations", () => {
  it("carries @marktiderman/genesis-supabase's account-deletion migration unchanged", () => {
    const shipped = shippedSql("0001_genesis_account_deletion.sql");
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_account_deletion.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shipped);
  });

  it("carries its pgTAP test unchanged", () => {
    const shipped = shippedSql("tests/0001_genesis_account_deletion.test.sql");
    expect(read("supabase/tests/database/genesis_account_deletion.test.sql")).toBe(shipped);
  });
});
