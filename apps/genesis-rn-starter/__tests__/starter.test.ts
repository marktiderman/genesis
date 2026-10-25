// @feat:native-starter @feat:app-updates @feat:push @feat:observability @feat:devtools-overlay @feat:support-feedback @feat:chat
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import starter from "../starter.config";
import { defineStarter, easConfig, nativePlatforms, privacyBlocks, type StarterConfig } from "../src/lib/define-starter";
import { copy, format } from "../src/copy";
import { findInlineCopy } from "./inline-copy";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
// Wherever the package manager put it (hoisted to the workspace root here).
const supabasePackage = dirname(createRequire(join(root, "package.json")).resolve("@marktiderman/genesis-supabase/package.json"));
const notificationsPackage = dirname(createRequire(join(root, "package.json")).resolve("@marktiderman/genesis-notifications/package.json"));
const shippedSql = (path: string) => readFileSync(join(supabasePackage, "migrations", path), "utf8");
const chatPackage = dirname(createRequire(join(root, "package.json")).resolve("@marktiderman/genesis-chat/package.json"));
const chatSql = (path: string) => readFileSync(join(chatPackage, "migrations", path), "utf8");

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

describe("migrations", () => {
  it("each has its own version, so a new app's database applies every one", () => {
    const versions = filesUnder("supabase/migrations").map((f) => f.split("/").pop()!.split("_")[0]!);
    expect(new Set(versions).size).toBe(versions.length);
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
    expect(nativePlatforms({ emailSignIn: false, googleSignIn: true })).toEqual(["ios", "android"]);
  });

  it("ships Google sign-in off, and refuses it without Apple (Guideline 4.8)", () => {
    expect(starter.features.googleSignIn).toBe(false);
    const googleOnly: StarterConfig = { ...starter, features: { ...starter.features, appleSignIn: false, googleSignIn: true } };
    expect(() => defineStarter(googleOnly)).toThrow(/Guideline 4.8/);
    expect(() => defineStarter({ ...starter, features: { ...starter.features, googleSignIn: true } })).not.toThrow();
  });

  it("declares in the privacy manifest only the blocks that are on", () => {
    expect(privacyBlocks(starter.features)).toEqual(["account", "observability", "push", "support"]);
    expect(privacyBlocks({ observability: false, push: false, support: false })).toEqual(["account"]);
  });

  it("leaves the Apple nonce to the package default (32 random bytes), not a UUID", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).not.toMatch(/randomUUID/);
    expect(auth).not.toMatch(/randomNonce/);
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

  it("carries the push migration unchanged, after the Apple one, without its pgTAP test (superseded by the notifications migration)", () => {
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_push.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shippedSql("0005_genesis_push.sql"));
    // Two of its assertions describe the token move and forget answer the notifications migration replaces.
    expect(filesUnder("supabase/tests/database").some((f) => f.endsWith("genesis_push.test.sql"))).toBe(false);
    const order = filesUnder("supabase/migrations").sort();
    expect(order.indexOf(copies[0]!)).toBeGreaterThan(order.findIndex((f) => f.endsWith("_genesis_apple_token_revocation.sql")));
  });

  it("carries @marktiderman/genesis-notifications' migration and its pgTAP test unchanged, last (it adopts the push tables)", () => {
    const shipped = (rel: string) => readFileSync(join(notificationsPackage, "migrations", rel), "utf8");
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_notifications.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shipped("0001_genesis_notifications.sql"));
    expect(read("supabase/tests/database/genesis_notifications.test.sql")).toBe(shipped("tests/0001_genesis_notifications.test.sql"));
    const order = filesUnder("supabase/migrations").sort();
    expect(order.at(-1)).toBe(copies[0]);
  });

  it("carries the support migration and its pgTAP test unchanged (the support block reads it), after the push one", () => {
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_support.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(shippedSql("0006_genesis_support.sql"));
    expect(read("supabase/tests/database/genesis_support.test.sql")).toBe(shippedSql("tests/0006_genesis_support.test.sql"));
    const order = filesUnder("supabase/migrations").sort();
    expect(order.indexOf(copies[0]!)).toBeGreaterThan(order.findIndex((f) => f.endsWith("_genesis_push.sql")));
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

  it("carries the genesis-push-send function unchanged, deployed without the gateway's JWT check (it checks GENESIS_PUSH_SECRET)", () => {
    const shipped = join(supabasePackage, "functions", "genesis-push-send");
    const names = readdirSync(shipped).sort();
    expect(names).toEqual(["expo.ts", "handler.ts", "index.ts"]);
    expect(readdirSync(join(root, "supabase/functions/genesis-push-send")).sort()).toEqual(names);
    for (const name of names) {
      expect(read(`supabase/functions/genesis-push-send/${name}`), name).toBe(readFileSync(join(shipped, name), "utf8"));
    }
    expect(read("supabase/config.toml")).toMatch(/\[functions\.genesis-push-send\]\s*\nverify_jwt = false/);
  });
});

describe("push", () => {
  it("ships with the push block on, behind the one `push` switch", () => {
    expect(starter.features.push).toBe(true);
    expect(read("src/lib/app.ts")).toContain("features.push ? createStarterPush() : undefined");
  });

  it("keeps expo-notifications in the build whichever way the switch is, so turning push off is JavaScript only", () => {
    expect(read("app.config.ts")).toMatch(/plugins: \[[^\]]*"expo-notifications"/);
    expect(read("app.config.ts")).not.toContain("features.push");
  });

  it("asks for permission only through the soft prompt, never from the root layout", () => {
    expect(read("src/app/_layout.tsx")).not.toMatch(/requestPermissions|offer\(/);
    const asking = filesUnder("src").filter((f) => /requestPermissionsAsync/.test(read(f)));
    expect(asking).toEqual([]);
  });
});

describe("support", () => {
  it("ships with the support block on, behind the one `support` switch, needing a signed-in person", () => {
    expect(starter.features.support).toBe(true);
    expect(read("src/lib/app.ts")).toMatch(/blocks: \[[^\]]*\bsupport\b/);
    expect(read("src/lib/support.ts")).toContain("starter.features.support ? createStarterSupport() : undefined");
    expect(read("src/lib/app.ts")).toContain('appFeatures: ["account"]');
  });

  it("has a route file for every route the block declares, each sending you back to Settings when support is off", () => {
    const routes = ["index", "new", "[id]", "ideas", "shipped"].map((name) => join("src/app/(app)/settings/support", `${name}.tsx`));
    for (const route of routes) expect(read(route), route).toContain("if (!starter.features.support");
    expect(read("src/lib/support.ts")).toContain('supportBasePath = "/settings/support"');
  });

  it("keeps view-shot and expo-sensors in the build whichever way the switch is, so turning support off is JavaScript only", () => {
    expect(read("app.config.ts")).not.toContain("features.support");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(["react-native-view-shot", "expo-sensors", "@marktiderman/genesis-support"]));
  });
});

describe("chat", () => {
  it("ships with chat on, its migration and pgTAP test copied unchanged after the support one, and genesis_chat served by the API", () => {
    expect(starter.features.chat).toBe(true);
    const copies = filesUnder("supabase/migrations").filter((f) => f.endsWith("_genesis_chat.sql"));
    expect(copies).toHaveLength(1);
    expect(read(copies[0]!)).toBe(chatSql("0001_genesis_chat.sql"));
    expect(read("supabase/tests/database/genesis_chat.test.sql")).toBe(chatSql("tests/0001_genesis_chat.test.sql"));
    const order = filesUnder("supabase/migrations").sort();
    expect(order.indexOf(copies[0]!)).toBeGreaterThan(order.findIndex((f) => f.endsWith("_genesis_support.sql")));
    expect(read("supabase/config.toml")).toMatch(/schemas = \[[^\]]*"genesis_chat"/);
    expect(JSON.parse(read("genesis.config.json")).doctor.supabase.exposedSchemas).toContain("genesis_chat");
  });

  it("has the Messages tab and its routes, each sending you home when chat is off", () => {
    expect(read("src/app/(app)/_layout.tsx")).toContain('name="messages" hidden={!starter.features.chat}');
    for (const route of ["_layout", "index", "[id]"]) {
      expect(read(join("src/app/(app)/messages", `${route}.tsx`)), route).toContain("if (!starter.features.chat) return <Redirect");
    }
  });

  it("opens a message's push in its thread, and adds the messages category with Reply and Mark read when push is on", () => {
    expect(read("src/lib/links.ts")).toContain('"/messages/:id": "/messages/:id"');
    expect(read("src/lib/push.ts")).toContain("starter.features.chat ? [chatPushCategory()] : []");
    expect(read("src/lib/push.ts")).toContain("onResponse: onChatPushResponse");
    expect(read("src/lib/chat.tsx")).toContain("starter.features.chat && starter.features.push");
  });

  it("keeps expo-audio, expo-image-picker and expo-clipboard in the build whichever way the switch is", () => {
    expect(read("app.config.ts")).not.toContain("features.chat");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(["expo-audio", "expo-image-picker", "expo-clipboard", "@marktiderman/genesis-chat"]));
  });
});
