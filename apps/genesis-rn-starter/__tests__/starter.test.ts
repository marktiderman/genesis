// @feat:native-starter @feat:app-updates @feat:observability @feat:devtools-overlay
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import starter from "../starter.config";
import { defineStarter, easConfig, nativePlatforms, type StarterConfig } from "../src/lib/define-starter";
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

  it("refuses an EAS project id that isn't a UUID", () => {
    expect(() => defineStarter({ ...starter, app: { ...starter.app, easProjectId: "my-project" } })).toThrow(/easProjectId/);
    expect(() => defineStarter({ ...starter, app: { ...starter.app, easProjectId: "" } })).not.toThrow();
  });

  it("ships with the updates block on and no EAS project (a placeholder for `eas init`)", () => {
    expect(starter.features.updates).toBe(true);
    expect(starter.app.easProjectId).toBe("");
  });
});

describe("EAS config", () => {
  it("turns expo-updates off in builds until there is an EAS project", () => {
    expect(easConfig({ easProjectId: "" })).toEqual({ updates: { enabled: false } });
  });

  it("points updates at the project and links it", () => {
    const id = "0b5a2c7e-1d3f-4a6b-9c8d-7e6f5a4b3c2d";
    expect(easConfig({ easProjectId: id })).toEqual({
      updates: { enabled: true, url: `https://u.expo.dev/${id}` },
      extra: { eas: { projectId: id } },
    });
  });
});

describe("fingerprint", () => {
  // app.config.ts imports starter.config.ts and define-starter.ts, so the fingerprint would hash
  // them as files and a JavaScript-only switch (updates, queryPersistence…) would change the
  // runtime version: installed builds would stop getting updates. .fingerprintignore leaves them
  // out; what they mean for the native build is in the evaluated config, which is hashed.
  it("leaves the files app.config.ts imports out, and app.config.ts imports nothing else", () => {
    const ignored = read(".fingerprintignore").split("\n").filter((l) => l && !l.startsWith("#"));
    expect(ignored).toEqual(["starter.config.ts", "src/lib/define-starter.ts"]);
    const imports = [...read("app.config.ts").matchAll(/^import .*from "(.+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["expo/config", "./starter.config", "./src/lib/define-starter"]);
  });

  it("app.config.ts reads no JavaScript-only switch", () => {
    expect(read("app.config.ts")).not.toMatch(/features\.(updates|queryPersistence|queryLifecycle|keyboardScroll|deepLinks|notifications|accountDeletion|wipeSessionOnReinstall|refreshWhileActive|observability|devtools)/);
  });
});

describe("devtools overlay", () => {
  // Metro folds `__DEV__` and `process.env.EXPO_PUBLIC_*` at build time and drops the dead branch
  // before it collects dependencies, so the overlay is in a bundle only behind this condition.
  it("is imported only from devtools-overlay.ts, which only devtools.ts requires, behind the build-time condition", () => {
    const importers = filesUnder("src").filter((f) => /\.tsx?$/.test(f) && /from "@marktiderman\/genesis-native\/devtools"/.test(read(f)));
    // devtools.ts imports a type only, which the compiler erases.
    expect(importers.sort()).toEqual([join("src", "lib", "devtools-overlay.ts"), join("src", "lib", "devtools.ts")]);
    expect(read("src/lib/devtools.ts")).toMatch(/^import type \{ DevtoolsBlock \} from "@marktiderman\/genesis-native\/devtools";$/m);
    const requirers = filesUnder("src").filter((f) => /devtools-overlay/.test(read(f)) && !f.endsWith("devtools-overlay.ts"));
    expect(requirers).toEqual([join("src", "lib", "devtools.ts")]);
    const gate = read("src/lib/devtools.ts");
    expect(gate).toContain(
      '__DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "development" || process.env.EXPO_PUBLIC_APP_VARIANT === "preview"\n    ? starter.features.devtools',
    );
    expect(gate).not.toMatch(/^import .*devtools-overlay/m);
  });

  it("every EAS build profile sets EXPO_PUBLIC_APP_VARIANT to its APP_VARIANT", () => {
    const eas = JSON.parse(read("eas.json")) as { build: Record<string, { env?: Record<string, string> }> };
    for (const [name, profile] of Object.entries(eas.build)) {
      if (profile.env?.APP_VARIANT) expect(profile.env.EXPO_PUBLIC_APP_VARIANT, name).toBe(profile.env.APP_VARIANT);
    }
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

  it("carries the app-release-policy migration unchanged (the updates block reads it)", () => {
    const shipped = shippedSql("0002_genesis_app_release_policy.sql");
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_app_release_policy.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shipped);
  });

  it("carries its pgTAP test unchanged", () => {
    const shipped = shippedSql("tests/0002_genesis_app_release_policy.test.sql");
    expect(read("supabase/tests/database/genesis_app_release_policy.test.sql")).toBe(shipped);
  });

  it("applies account deletion before the release policy", () => {
    const order = filesUnder("supabase/migrations").sort();
    expect(order.findIndex((f) => f.endsWith("_genesis_account_deletion.sql"))).toBeLessThan(order.findIndex((f) => f.endsWith("_genesis_app_release_policy.sql")));
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
