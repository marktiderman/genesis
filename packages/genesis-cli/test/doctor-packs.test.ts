// @feat:doctor-native
import { execFileSync } from "node:child_process";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BUILTIN_RULES,
  loadGenesis,
  nativeLayouts,
  readPackageExports,
  runDoctor,
  sqlStatements,
  validateConfig,
  type DoctorConfig,
  type Finding,
} from "../src/doctor/index.js";
import { argTypes } from "../src/doctor/supabase.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const NATIVE: DoctorConfig = { packs: ["native"] };
/** Without git, `since` is what says which migrations are new; "0" makes every one new. */
const SUPABASE: DoctorConfig = { packs: ["supabase"], supabase: { since: "0" } };

const run = (fixture: string | null, config: DoctorConfig, extra: Record<string, string> = {}) =>
  runDoctor({ root: makeApp(fixture, extra), config });

/** `rule file:line subject` for compact assertions. */
const brief = (findings: Finding[], rule?: string) =>
  findings.filter((f) => !rule || f.rule === rule).map((f) => `${f.rule} ${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);
const levels = (findings: Finding[], rule: string) => findings.filter((f) => f.rule === rule).map((f) => f.level);

/** A throwaway app with one migration. */
const migration = (sql: string, config: DoctorConfig = SUPABASE) => run(null, config, { "supabase/migrations/20260101000000_m.sql": sql });
const M = "supabase/migrations/20260101000000_m.sql";

const READY_APP_JSON = JSON.stringify({
  expo: {
    ios: {
      config: { usesNonExemptEncryption: false },
      infoPlist: {},
      privacyManifests: { NSPrivacyAccessedAPITypes: [] },
    },
    plugins: ["expo-router", ["expo-camera", { cameraPermission: "Scan a QR code to join a team." }]],
  },
});
const withDeps = (deps: Record<string, string>) => JSON.stringify({ name: "x", private: true, dependencies: deps });
/** A native app with only the given screen files (plus the fixture's package and app.json). */
const nativeApp = (files: Record<string, string>, config: DoctorConfig = NATIVE) =>
  run(null, config, { "package.json": withDeps({ "react-native": "1" }), "app.json": READY_APP_JSON, ...files });

describe("packs config", () => {
  it("validates packs and their settings", () => {
    expect(validateConfig({ packs: ["native", "supabase"], native: { routerRoot: "src/app" }, supabase: { base: "main" } }).packs).toEqual([
      "native",
      "supabase",
    ]);
    expect(() => validateConfig({ packs: ["android"] })).toThrow(/unknown pack "android"/);
    expect(() => validateConfig({ packs: "native" })).toThrow(/"packs" must be a list/);
    expect(() => validateConfig({ packs: ["native", "native"] })).toThrow(/lists a pack twice/);
    expect(() => validateConfig({ native: { routerRoot: "app" } })).toThrow(/native pack is not in "packs"/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { migration: "x" } })).toThrow(/supabase: unknown setting "migration"/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { exposedSchemas: "public" } })).toThrow(/must be a list/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { since: "" } })).toThrow(/must not be empty/);
  });

  it("normalizes pack folders, and rejects empty, absolute and outside paths", () => {
    const c = validateConfig({ packs: ["native", "supabase"], native: { routerRoot: "./app/" }, supabase: { migrations: "./db//migrations/", exposedSchemas: ["Public", "API"] } });
    expect(c.native?.routerRoot).toBe("app");
    expect(c.supabase?.migrations).toBe("db/migrations");
    expect(c.supabase?.exposedSchemas).toEqual(["public", "api"]);
    expect(() => validateConfig({ packs: ["native"], native: { routerRoot: "" } })).toThrow(/non-empty path/);
    expect(() => validateConfig({ packs: ["native"], native: { routerRoot: "/abs/app" } })).toThrow(/not absolute/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { migrations: "../elsewhere" } })).toThrow(/inside the app/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { migrations: "." } })).toThrow(/inside the app/);
  });

  it("pack rule ids are built-in, so rules and allow work and patterns can't take them", async () => {
    for (const id of ["native-raw-primitive", "native-literal-color", "native-custom-header", "native-screen-layout", "store-readiness"]) {
      expect(BUILTIN_RULES).toContain(id);
    }
    for (const id of ["migration-grants", "migration-rls", "migration-definer-search-path", "migration-edited", "migration-testing-kit", "migration-view-rls"]) expect(BUILTIN_RULES).toContain(id);
    await expect(run("clean", { patterns: [{ id: "migration-rls", files: ["src/**"], forbid: "x" }] })).rejects.toThrow(/built-in rule id/);
  });

  it("web apps are unaffected: no pack, no pack findings", async () => {
    const r = await run("native", {});
    expect(r.genesis.uiPackage).toBe("@marktiderman/genesis-ui");
    expect(r.findings.filter((f) => f.rule.startsWith("native-") || f.rule === "store-readiness")).toEqual([]);
  });
});

describe("native pack", () => {
  it("reads the native package and derives the screen layouts from its exports", () => {
    const g = loadGenesis(makeApp(null), NATIVE);
    expect(g.uiPackage).toBe("@marktiderman/genesis-ui-native");
    const pkg = readPackageExports(makeApp(null), "@marktiderman/genesis-ui-native")!;
    expect(nativeLayouts(pkg)).toEqual(["AuthScreen", "NativeResourcePage", "NativeResourceView", "ScreenContainer", "SettingsPage"]);
  });

  it("native-raw-primitive: wrapped primitives from react-native, multi-line and aliased imports included", async () => {
    const r = await run("native", NATIVE);
    expect(brief(r.findings, "native-raw-primitive")).toEqual([
      "native-raw-primitive components/ProfileScreen.tsx:2 ActivityIndicator",
      "native-raw-primitive components/ProfileScreen.tsx:3 Modal",
    ]);
    const modal = r.findings.find((f) => f.subject === "Modal")!;
    // Only replacements the installed package exports are named (NativeDrawer isn't in the fixture).
    expect(modal.message).toContain("use NativeDialog or NativeSheet from @marktiderman/genesis-ui-native");
    // A spinner points at the screen loading state first.
    const spinner = r.findings.find((f) => f.subject === "ActivityIndicator")!;
    expect(spinner.message).toContain("use NativeLoadingState or NativeSkeleton from @marktiderman/genesis-ui-native");
  });

  it("native-raw-primitive: namespace, require and export-from uses count; type-only imports don't", async () => {
    const r = await nativeApp({
      "src/a.ts": 'import * as RN from "react-native";\nexport const M = RN.Modal;\n',
      "src/b.ts": 'const Spin = require("react-native").ActivityIndicator;\nexport { Spin };\n',
      "src/c.ts": 'export { Modal } from "react-native";\n',
      "src/d.ts": 'const { Modal: M2 } = require("react-native");\nexport { M2 };\n',
      "src/e.ts": 'import type { Modal } from "react-native";\nimport { type ActivityIndicator, View } from "react-native";\nexport type T = [Modal, ActivityIndicator, typeof View];\n',
    });
    expect(brief(r.findings, "native-raw-primitive")).toEqual([
      "native-raw-primitive src/a.ts:2 Modal",
      "native-raw-primitive src/b.ts:1 ActivityIndicator",
      "native-raw-primitive src/c.ts:1 Modal",
      "native-raw-primitive src/d.ts:1 Modal",
    ]);
  });

  it("native-literal-color: replaces raw-color in native code; PlatformColor is fine", async () => {
    const r = await run("native", NATIVE);
    expect(brief(r.findings, "native-literal-color")).toEqual([
      "native-literal-color components/ProfileScreen.tsx:19 #ff0000",
      "native-literal-color components/ProfileScreen.tsx:19 rgba(0, 0, 0, 0.5)",
    ]);
    expect(brief(r.findings, "raw-color")).toEqual([]);
    expect(r.findings.find((f) => f.rule === "native-literal-color")!.message).toContain("useThemeRoles()");
  });

  it("native-custom-header: a hidden header with a hand-drawn one, and a hand-built tab bar (warn)", async () => {
    const r = await run("native", NATIVE);
    expect(brief(r.findings, "native-custom-header").sort()).toEqual([
      "native-custom-header app/(tabs)/_layout.tsx:5 tabBar prop",
      "native-custom-header app/_layout.tsx:8 AppHeader",
    ]);
    expect(levels(r.findings, "native-custom-header")).toEqual(["warn", "warn"]);
    expect(r.findings.find((f) => f.subject === "AppHeader")!.message).toContain("ScreenContainer's header props (composeHeaderOptions)");
  });

  it("native-custom-header: tabBar after an arrow-function screenOptions, and a layout's hidden header with the screen's own", async () => {
    const r = await nativeApp({
      "app/(tabs)/_layout.tsx":
        'import { Tabs } from "expo-router";\nexport default function L() {\n  return <Tabs screenOptions={({ route }) => ({ title: route.name })} tabBar={(p) => <Bar {...p} />} />;\n}\n',
      "app/_layout.tsx": 'import { Stack } from "expo-router";\nexport default function L() {\n  return <Stack screenOptions={{ headerShown: false }} />;\n}\n',
      "app/home.tsx": 'import { ScreenContainer } from "@marktiderman/genesis-ui-native";\nexport default function H() {\n  return (\n    <ScreenContainer>\n      <TopHeader />\n    </ScreenContainer>\n  );\n}\n',
    });
    expect(brief(r.findings, "native-custom-header").sort()).toEqual([
      "native-custom-header app/(tabs)/_layout.tsx:3 tabBar prop",
      "native-custom-header app/home.tsx:5 TopHeader",
    ]);
    expect(r.findings.find((f) => f.subject === "TopHeader")!.message).toContain("while app/_layout.tsx hides the navigator's");
  });

  it("native-custom-header: section headers and header-ish style names aren't a hand-drawn header", async () => {
    const r = await nativeApp({
      "app/list.tsx": [
        'import { Stack } from "expo-router";',
        'import { ScreenContainer } from "@marktiderman/genesis-ui-native";',
        "export default function L() {",
        "  return (",
        "    <ScreenContainer>",
        "      <Stack.Screen options={{ headerShown: false }} />",
        "      <SectionHeader title=\"A\" />",
        "      <ListHeader />",
        "      <View style={styles.headerImage} />",
        "    </ScreenContainer>",
        "  );",
        "}",
      ].join("\n"),
    });
    expect(brief(r.findings, "native-custom-header")).toEqual([]);
  });

  it("native-screen-layout: route screens render a layout directly, through a local import, or redirect", async () => {
    const r = await run("native", NATIVE);
    // index renders ScreenContainer, profile imports a screen that does, old-home redirects,
    // signing-in renders NativeLoadingState, _layout and +html aren't screens.
    expect(brief(r.findings, "native-screen-layout")).toEqual(["native-screen-layout app/settings.tsx:0"]);
    expect(r.findings.find((f) => f.rule === "native-screen-layout")!.level).toBe("warn");
  });

  it("native-screen-layout: honors native.routerRoot (./ prefix included) and says when the root is missing", async () => {
    const r = await run("native", validateConfig({ packs: ["native"], native: { routerRoot: "src/routes" } }));
    expect(brief(r.findings, "native-screen-layout")).toEqual(["native-screen-layout src/routes:0"]);
    const dotted = await run("native", validateConfig({ packs: ["native"], native: { routerRoot: "./app" } }));
    expect(brief(dotted.findings, "native-screen-layout")).toEqual(["native-screen-layout app/settings.tsx:0"]);
  });

  it("native-screen-layout: warns when src leaves the router root unscanned", async () => {
    const r = await run("native", { packs: ["native"], src: ["src"] });
    expect(brief(r.findings, "native-screen-layout")).toEqual(["native-screen-layout app:0"]);
    expect(r.findings.find((f) => f.rule === "native-screen-layout")!.message).toContain("add it to doctor.src");
  });

  it("store-readiness: encryption flag, Sign in with Apple, generic usage strings, privacy manifest (all warn)", async () => {
    const r = await run("native", NATIVE);
    expect(brief(r.findings, "store-readiness")).toEqual([
      "store-readiness app.json:0 usesNonExemptEncryption",
      "store-readiness app.json:0 NSCameraUsageDescription",
      "store-readiness app.json:0 privacyManifests",
      "store-readiness package.json:0 sign-in-with-apple",
    ]);
    expect(levels(r.findings, "store-readiness")).toEqual(["warn", "warn", "warn", "warn"]);
    const apple = r.findings.find((f) => f.subject === "sign-in-with-apple")!;
    expect(apple.message).toContain("Supabase google sign-in, expo-auth-session");
    expect(apple.message).toContain("guideline 4.8 asks for an equivalent login");
    expect(r.findings.find((f) => f.subject === "NSCameraUsageDescription")!.message).toContain("Expo's generic default string");
  });

  it("store-readiness: a ready app.json passes", async () => {
    const r = await run("native", NATIVE, {
      "app.json": READY_APP_JSON,
      "package.json": withDeps({ "expo-camera": "1", "expo-auth-session": "1", "expo-apple-authentication": "1" }),
    });
    expect(brief(r.findings, "store-readiness")).toEqual([]);
  });

  it("store-readiness: false opts a permission out; Supabase's apple provider is Sign in with Apple; expo-auth-session alone isn't sign-in", async () => {
    const appJson = JSON.parse(READY_APP_JSON);
    appJson.expo.plugins.push(["expo-image-picker", { photosPermission: "Pick a profile photo.", cameraPermission: false }]);
    const r = await run("native", NATIVE, {
      "app.json": JSON.stringify(appJson),
      "package.json": withDeps({ "expo-camera": "1", "expo-image-picker": "1", "expo-auth-session": "1" }),
      "src/lib/sign-in.ts": 'export const go = (s: any) => [s.auth.signInWithOAuth({ provider: "google" }), s.auth.signInWithOAuth({ provider: "apple" })];\n',
    });
    expect(brief(r.findings, "store-readiness")).toEqual([]);
    const authOnly = await run("native", NATIVE, {
      "app.json": READY_APP_JSON,
      "package.json": withDeps({ "expo-auth-session": "1" }),
      "src/lib/sign-in.ts": "export {};\n",
    });
    expect(brief(authOnly.findings, "store-readiness")).toEqual([]);
  });

  it("store-readiness: playback-only and library-only modules get a hedged warning; Face ID is checked", async () => {
    const r = await run("native", NATIVE, {
      "app.json": READY_APP_JSON,
      "package.json": withDeps({ "expo-av": "1", "expo-local-authentication": "1" }),
      "src/lib/sign-in.ts": "export {};\n",
    });
    expect(brief(r.findings, "store-readiness")).toEqual([
      "store-readiness app.json:0 NSMicrophoneUsageDescription",
      "store-readiness app.json:0 NSFaceIDUsageDescription",
    ]);
    expect(r.findings[0].message).toContain("expo-av, if the app records audio");
    expect(r.findings[0].message).toContain("microphonePermission: false if it doesn't");
  });

  it("store-readiness: scans a dynamic app.config.ts as text", async () => {
    const root = makeApp("native", {
      "app.config.ts": [
        "export default () => ({",
        "  ios: { config: { usesNonExemptEncryption: false }, privacyManifests: { NSPrivacyAccessedAPITypes: [] } },",
        "  plugins: [['expo-camera', { cameraPermission: process.env.CAMERA_COPY }]],",
        "});",
      ].join("\n"),
      "package.json": withDeps({ "expo-camera": "1", "expo-location": "1", "expo-apple-authentication": "1" }),
    });
    rmSync(path.join(root, "app.json"));
    const r = await runDoctor({ root, config: NATIVE });
    expect(brief(r.findings, "store-readiness")).toEqual(["store-readiness app.config.ts:0 NSLocationWhenInUseUsageDescription"]);
  });

  it("store-readiness: withGenesis() covers export compliance, and the privacy manifest when a package needs one", async () => {
    const appJson = (plugin: unknown) => JSON.stringify({ expo: { plugins: ["expo-router", plugin] } });
    const deps = { "expo-apple-authentication": "1", "@react-native-async-storage/async-storage": "1" };
    const covered = await run("native", NATIVE, { "app.json": appJson("@marktiderman/genesis-cli"), "package.json": withDeps(deps) });
    expect(brief(covered.findings, "store-readiness")).toEqual([]);

    // Its options turn each step off, and with no package that needs a manifest it writes none.
    const off = await run("native", NATIVE, {
      "app.json": appJson(["@marktiderman/genesis-cli", { exportCompliance: false, privacyManifest: false }]),
      "package.json": withDeps(deps),
    });
    expect(brief(off.findings, "store-readiness")).toEqual(["store-readiness app.json:0 usesNonExemptEncryption", "store-readiness app.json:0 privacyManifests"]);
    const nothingToDeclare = await run("native", NATIVE, {
      "app.json": appJson("@marktiderman/genesis-cli"),
      "package.json": withDeps({ "expo-apple-authentication": "1" }),
    });
    expect(brief(nothingToDeclare.findings, "store-readiness")).toEqual(["store-readiness app.json:0 privacyManifests"]);

    // A dynamic config is read as text.
    const root = makeApp("native", {
      "app.config.ts": 'export default () => ({ plugins: ["expo-router", "@marktiderman/genesis-cli"] });\n',
      "package.json": withDeps(deps),
    });
    rmSync(path.join(root, "app.json"));
    expect(brief((await runDoctor({ root, config: NATIVE })).findings, "store-readiness")).toEqual([]);

    // Importing the package isn't listing the plugin.
    const importOnly = makeApp("native", {
      "app.config.ts": 'import { doctor } from "@marktiderman/genesis-cli";\nexport default () => ({ plugins: ["expo-router"] });\n',
      "package.json": withDeps(deps),
    });
    rmSync(path.join(importOnly, "app.json"));
    expect(brief((await runDoctor({ root: importOnly, config: NATIVE })).findings, "store-readiness")).toEqual([
      "store-readiness app.config.ts:0 usesNonExemptEncryption",
      "store-readiness app.config.ts:0 privacyManifests",
    ]);
  });

  it("store-readiness: no Expo config is a warning", async () => {
    const root = makeApp("native");
    rmSync(path.join(root, "app.json"));
    const r = await runDoctor({ root, config: NATIVE });
    expect(brief(r.findings, "store-readiness")).toEqual(["store-readiness app.json:0"]);
    expect(r.findings.find((f) => f.rule === "store-readiness")!.level).toBe("warn");
  });

  it("allow and rules apply to pack rules", async () => {
    const r = await run("native", {
      packs: ["native"],
      rules: { "store-readiness": "off", "native-literal-color": "warn" },
      allow: [{ rule: "native-screen-layout", file: "app/settings.tsx", reason: "placeholder screen" }],
    });
    expect(brief(r.findings, "store-readiness")).toEqual([]);
    expect(brief(r.findings, "native-screen-layout")).toEqual([]);
    expect(levels(r.findings, "native-literal-color")).toEqual(["warn", "warn"]);
  });
});

describe("supabase pack", () => {
  it("reads SQL statements with comments, strings and dollar-quoted bodies blanked", () => {
    const s = sqlStatements("-- a; b\ncreate table t (x text default 'a;b');\n/* c; */ select $$ ; $$;\n\nSELECT \"Mixed\".x");
    expect(s).toEqual([
      { sql: "create table t (x text default '')", line: 2, bodies: [] },
      { sql: "select $$ $$", line: 3, bodies: [" ; "] },
      { sql: "select mixed.x", line: 5, bodies: [] },
    ]);
  });

  it("reads E'' strings with backslash escapes", () => {
    const s = sqlStatements("select E'it\\'s; fine';\nselect 'plain\\';\nselect 2");
    expect(s.map((x) => x.sql)).toEqual(["select e''", "select ''", "select 2"]);
  });

  it("keys functions by argument types", () => {
    expect(argTypes("p uuid, q text default 'x', out r int, variadic v int[]")).toEqual(["uuid", "text", "int[]"]);
    expect(argTypes("double precision, a timestamp with time zone, int, varchar(10)")).toEqual([
      "double precision",
      "timestamp with time zone",
      "integer",
      "character varying",
    ]);
  });

  it("migration-grants, migration-rls and migration-definer-search-path on the fixture", async () => {
    const r = await run("supabase", SUPABASE);
    expect(brief(r.findings)).toEqual([
      "migration-rls supabase/migrations/20260101000000_init.sql:5 public.todos",
      "migration-definer-search-path supabase/migrations/20260101000000_init.sql:13 private.do_thing(uuid)",
      // The body's `execute 'grant … to anon'` can't be read, so it's a warning.
      "migration-grants supabase/migrations/20260101000000_init.sql:13 dynamic grant",
      "migration-grants supabase/migrations/20260102000000_grants.sql:2 on all functions",
      "migration-grants supabase/migrations/20260102000000_grants.sql:3 alter default privileges",
      "migration-grants supabase/migrations/20260102000000_grants.sql:5 private.do_thing",
    ]);
    // A blanket grant to authenticated is a warning; to anon or public an error.
    expect(r.findings.map((f) => f.level)).toEqual(["error", "error", "warn", "warn", "error", "error"]);
    expect(r.findings.find((f) => f.subject === "private.do_thing")!.message).toContain("to anon;");
  });

  it("migration-testing-kit: the pgTAP kit never ships as a migration", async () => {
    const r = await migration("create table public.notes (id uuid primary key);\ncreate schema if not exists genesis_testing;\n");
    expect(brief(r.findings, "migration-testing-kit")).toEqual([`migration-testing-kit ${M}:2 genesis_testing`]);
    expect(levels(r.findings, "migration-testing-kit")).toEqual(["error"]);
    const clean = await migration("create table public.genesis_testings (id uuid primary key);\n");
    expect(brief(clean.findings, "migration-testing-kit")).toEqual([]);
  });

  it("migration-view-rls: a view in an exposed schema runs as the signed-in user", async () => {
    const r = await migration(
      [
        "create table public.tasks (id uuid primary key);",
        "alter table public.tasks enable row level security;",
        "create view public.plain as select * from public.tasks;",
        "create view public.safe with (security_invoker = true) as select * from public.tasks;",
        "create view public.fixed as select * from public.tasks;",
        "alter view public.fixed set (security_invoker = true);",
        "create view public.undone with (security_invoker) as select * from public.tasks;",
        "create or replace view public.undone as select * from public.tasks;",
        "create view public.reset with (security_invoker = on, security_barrier = true) as select * from public.tasks;",
        "alter view public.reset reset (security_invoker);",
        "create view public.off with (security_invoker = false) as select * from public.tasks;",
        "create view public.gone as select * from public.tasks;",
        "drop view public.gone;",
        "create view private.internal as select * from public.tasks;",
        "create view public.old_name as select * from public.tasks;",
        "alter view public.old_name rename to new_name;",
      ].join("\n") + "\n",
    );
    expect(brief(r.findings, "migration-view-rls")).toEqual([
      `migration-view-rls ${M}:3 public.plain`,
      `migration-view-rls ${M}:8 public.undone`,
      `migration-view-rls ${M}:9 public.reset`,
      `migration-view-rls ${M}:11 public.off`,
      `migration-view-rls ${M}:15 public.new_name`,
    ]);
    expect(levels(r.findings, "migration-view-rls")).toEqual(["error", "error", "error", "error", "error"]);
  });

  it("migration-grants: without git or since, grants are skipped with a warning instead of flagging applied migrations", async () => {
    const r = await run("supabase", { packs: ["supabase"] });
    expect(brief(r.findings, "migration-grants")).toEqual(["migration-grants supabase/migrations:0"]);
    expect(levels(r.findings, "migration-grants")).toEqual(["warn"]);
    expect(r.findings.find((f) => f.rule === "migration-grants")!.message).toContain("set doctor.supabase.since");
    // since: files sorting before it are applied and trusted.
    const since = await run("supabase", { packs: ["supabase"], supabase: { since: "20260102" } });
    expect(brief(since.findings, "migration-grants").every((s) => s.includes("20260102000000_grants.sql"))).toBe(true);
    const later = await run("supabase", { packs: ["supabase"], supabase: { since: "20260103" } });
    expect(brief(later.findings, "migration-grants")).toEqual([]);
  });

  it("migration-grants: false positives and negatives", async () => {
    const r = await migration(
      [
        "grant execute on all functions in schema public to service_role;",
        "grant execute on all functions in schema public to postgres;",
        "alter default privileges in schema public revoke grant option for execute on functions from public;",
        "grant execute on function public.g(p private.t) to anon;",
        "grant execute on function private.f() to anon granted by postgres;",
        "grant execute on function app_private.h(), public.ok() to public;",
        "grant usage on schema private to anon;",
        "grant usage on schema public to anon;",
        "alter default privileges for role postgres in schema public grant execute on functions to authenticated;",
      ].join("\n"),
    );
    expect(brief(r.findings, "migration-grants")).toEqual([
      `migration-grants ${M}:5 private.f`,
      `migration-grants ${M}:6 app_private.h`,
      `migration-grants ${M}:7 schema private`,
      `migration-grants ${M}:9 alter default privileges`,
    ]);
    expect(levels(r.findings, "migration-grants")).toEqual(["error", "error", "error", "warn"]);
  });

  it("migration-grants: grants built in dynamic SQL are a warning", async () => {
    const r = await migration(
      [
        "do $$ declare f text; begin",
        "  for f in select oid::regprocedure::text from pg_proc loop",
        "    execute format('grant execute on function %s to anon', f);",
        "  end loop;",
        "end $$;",
        "do $$ begin execute 'grant select on public.t to ' || current_setting('app.role'); end $$;",
        "do $$ begin execute format('grant usage on schema %I to authenticated', 'x'); end $$;",
        "do $$ begin perform 1; -- 'grant all to anon'\nend $$;",
        "do $$ begin execute $q$grant execute on function public.f() to anon$q$; end $$;",
      ].join("\n"),
    );
    expect(brief(r.findings, "migration-grants")).toEqual([
      `migration-grants ${M}:1 dynamic grant`,
      `migration-grants ${M}:6 dynamic grant`,
      `migration-grants ${M}:10 dynamic grant`,
    ]);
    expect(levels(r.findings, "migration-grants")).toEqual(["warn", "warn", "warn"]);
    expect(r.findings.filter((f) => f.rule === "migration-grants").map((f) => f.message)).toEqual([
      expect.stringContaining("grant to anon in dynamic SQL"),
      expect.stringContaining("computed role"),
      expect.stringContaining("grant to anon in dynamic SQL"),
    ]);
  });

  it("migration-rls: dynamic enables, disable, rename and set schema", async () => {
    const r = await migration(
      [
        "create table a (id int);",
        "create table b (id int);",
        "do $$ declare t text; begin foreach t in array array['a','b'] loop",
        "  execute format('alter table public.%I enable row level security', t);",
        "end loop; end $$;",
        "create table c (id int);",
        "alter table c enable row level security;",
        "alter table c disable row level security;",
        "create table d (id int);",
        "alter table d rename to e;",
        "alter table e enable row level security;",
        "create table f (id int);",
        "alter table f rename to g;",
        "create table private.h (id int);",
        "alter table private.h set schema public;",
      ].join("\n"),
    );
    expect(brief(r.findings, "migration-rls")).toEqual([`migration-rls ${M}:8 public.c`, `migration-rls ${M}:12 public.g`, `migration-rls ${M}:14 public.h`]);
    expect(r.findings.find((f) => f.subject === "public.c")!.message).toMatch(/^disables row level security/);
  });

  it("exposedSchemas widens the RLS check, case-insensitively", async () => {
    const r = await run("supabase", validateConfig({ packs: ["supabase"], supabase: { since: "0", exposedSchemas: ["PUBLIC", "Private"] } }));
    expect(brief(r.findings, "migration-rls").map((s) => s.split(" ").pop())).toEqual(["public.todos", "private.secrets"]);
  });

  it("migration-definer-search-path: overloads are separate; alter function can add definer or the search_path", async () => {
    const r = await migration(
      [
        "create function public.f(a int) returns int language sql security definer set search_path = '' as $$ select 1 $$;",
        "create function public.f(a text) returns int language sql security definer as $$ select 1 $$;",
        "create function public.g(p uuid) returns int language sql as $$ select 1 $$;",
        "alter function public.g(uuid) security definer;",
        "create function public.h(int) returns int language sql security definer as $$ select 1 $$;",
        "alter function public.h(integer) set search_path = public;",
        "create function public.k() returns int language sql security definer as $$ select 1 $$;",
        "alter function public.k() rename to k2;",
      ].join("\n"),
    );
    expect(brief(r.findings, "migration-definer-search-path")).toEqual([
      `migration-definer-search-path ${M}:2 public.f(text)`,
      `migration-definer-search-path ${M}:4 public.g(uuid)`,
      `migration-definer-search-path ${M}:7 public.k2()`,
    ]);
  });

  it("a missing migrations folder is a config error", async () => {
    await expect(run("clean", SUPABASE)).rejects.toThrow(/supabase\/migrations, which doesn't exist/);
  });

  describe("with git", () => {
    const git = (root: string, ...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=Doctor Test", "-c", "user.email=doctor@example.test", "-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", ...args],
        { cwd: root, stdio: "pipe" },
      );
    const repo = () => {
      const root = makeApp("supabase", { ".gitignore": "node_modules\n", "supabase/migrations/README.md": "notes\n" });
      git(root, "init", "-q", "-b", "main");
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", "applied");
      git(root, "switch", "-q", "-c", "feature");
      return root;
    };

    it("migration-edited: a migration on the base was changed; grants are checked only in new or changed files", async () => {
      const root = repo();
      appendFileSync(path.join(root, "supabase/migrations/20260101000000_init.sql"), "\ncomment on table public.notes is 'x';\n");
      appendFileSync(path.join(root, "supabase/migrations/README.md"), "more notes\n");
      writeFileSync(path.join(root, "supabase/migrations/20260103000000_new.sql"), "grant execute on all routines in schema public to anon;\n");
      // A ./-prefixed folder is normalized, so git's paths still match.
      const r = await runDoctor({ root, config: validateConfig({ packs: ["supabase"], supabase: { base: "main", migrations: "./supabase/migrations" } }) });
      expect(brief(r.findings, "migration-edited")).toEqual([
        "migration-edited supabase/migrations/20260101000000_init.sql:0 supabase/migrations/20260101000000_init.sql",
      ]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toContain("put the change in a new migration");
      // The untouched grants migration is no longer checked; the new one and the edited one are.
      expect(brief(r.findings, "migration-grants")).toEqual([
        "migration-grants supabase/migrations/20260101000000_init.sql:13 dynamic grant",
        "migration-grants supabase/migrations/20260103000000_new.sql:1 on all functions",
      ]);
    });

    it("migration-edited: deleting an applied migration counts too", async () => {
      const root = repo();
      rmSync(path.join(root, "supabase/migrations/20260102000000_grants.sql"));
      const r = await runDoctor({ root, config: { packs: ["supabase"], supabase: { base: "main" } } });
      expect(brief(r.findings, "migration-edited").map((s) => s.split(" ")[1])).toEqual(["supabase/migrations/20260102000000_grants.sql:0"]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toMatch(/^deletes/);
    });

    it("warns when the base ref is missing, and skips grants unless since is set", async () => {
      const r = await runDoctor({ root: repo(), config: { packs: ["supabase"] } });
      expect(brief(r.findings, "migration-edited")).toEqual(["migration-edited supabase/migrations:0"]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toContain("origin/main isn't available");
      expect(levels(r.findings, "migration-edited")).toEqual(["warn"]);
      expect(brief(r.findings, "migration-grants")).toEqual(["migration-grants supabase/migrations:0"]);
    });
  });
});
