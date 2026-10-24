// @feat:native-starter
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import starter from "../starter.config";
import { defineStarter, nativePlatforms, type StarterConfig } from "../src/lib/define-starter";
import { copy, format } from "../src/copy";
import { findInlineCopy } from "./inline-copy";

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
  it("refuses a config with no way to sign in", () => {
    const none: StarterConfig = { ...starter, features: { ...starter.features, emailSignIn: false, appleSignIn: false } };
    expect(() => defineStarter(none)).toThrow(/nobody can sign in/);
  });

  it("builds for iOS only when email sign-in is off (Apple's button shows only on iOS)", () => {
    expect(nativePlatforms({ emailSignIn: true })).toEqual(["ios", "android"]);
    expect(nativePlatforms({ emailSignIn: false })).toEqual(["ios"]);
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
  it("is the only source of user-facing text in src", () => {
    const files = filesUnder("src").filter((f) => /\.tsx?$/.test(f) && f !== join("src", "copy.ts"));
    const offenders = files.flatMap((file) => findInlineCopy(read(file), file));
    expect(offenders).toEqual([]);
  });

  it("the check finds inline copy and ignores code that only looks like it", () => {
    const flagged = findInlineCopy(
      [
        "const a = <Text>Signed in as {email}</Text>;",
        'const b = <Text>{"Hello"}</Text>;',
        "const c = <Text>{`Hi ${name}`}</Text>;",
        'const d = <Screen title="Hi" subtitle={"There"} />;',
        'Alert.alert("Oops", "It broke");',
        'const e = { text: "Cancel", label: `Ünïcode` };',
        'const f = <Text>3 items</Text>; const u = "https://x"; const g = <Text>Hi</Text>;',
      ].join("\n"),
      "probe.tsx",
    );
    expect(flagged.map((h) => h.slice(h.indexOf(": ") + 2))).toEqual([
      "Signed in as",
      '{"Hello"}',
      "{`Hi ${name}`}",
      'title="Hi"',
      'subtitle={"There"}',
      '"Oops"',
      '"It broke"',
      'text: "Cancel"',
      "label: `Ünïcode`",
      "3 items",
      "Hi",
    ]);
    const clean = findInlineCopy(
      [
        "const a = x > y && z < w;",
        "const b = () => useSession<Session>();",
        "const c: Promise<Item[]> = load();",
        'const d = <Redirect href="/sign-in" />;',
        'const e = <Tab name="(home)" testID="home" md="home" variant="ghost" />;',
        "const f = <Text>{copy.home.title}</Text>;",
        "Alert.alert(t.title, t.body, [{ text: t.cancel }]);",
        '// <Text>a comment</Text> and a "quoted" word',
      ].join("\n"),
      "probe.tsx",
    );
    expect(clean).toEqual([]);
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

  it("carries the Apple token revocation migration and its pgTAP test unchanged", () => {
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_apple_token_revocation.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shippedSql("0003_genesis_apple_token_revocation.sql"));
    expect(read("supabase/tests/database/genesis_apple_token_revocation.test.sql")).toBe(shippedSql("tests/0003_genesis_apple_token_revocation.test.sql"));
  });
});

describe("supabase/functions", () => {
  it("carries @marktiderman/genesis-supabase's genesis-apple-revoke function unchanged", () => {
    const shipped = join(supabasePackage, "functions", "genesis-apple-revoke");
    const names = readdirSync(shipped).sort();
    expect(names).toEqual(["apple.ts", "handler.ts", "index.ts"]);
    expect(readdirSync(join(root, "supabase/functions/genesis-apple-revoke")).sort()).toEqual(names);
    for (const name of names) {
      expect(read(`supabase/functions/genesis-apple-revoke/${name}`), name).toBe(readFileSync(join(shipped, name), "utf8"));
    }
  });

  it("deploys it without the gateway's JWT check (the function checks the caller itself)", () => {
    expect(read("supabase/config.toml")).toMatch(/\[functions\.genesis-apple-revoke\]\s*\nverify_jwt = false/);
  });
});
