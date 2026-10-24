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
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const NATIVE: DoctorConfig = { packs: ["native"] };
const SUPABASE: DoctorConfig = { packs: ["supabase"] };

const run = (fixture: string | null, config: DoctorConfig, extra: Record<string, string> = {}) =>
  runDoctor({ root: makeApp(fixture, extra), config });

/** `rule file:line subject` for compact assertions. */
const brief = (findings: Finding[], rule?: string) =>
  findings.filter((f) => !rule || f.rule === rule).map((f) => `${f.rule} ${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);

const READY_APP_JSON = JSON.stringify({
  expo: {
    ios: {
      config: { usesNonExemptEncryption: false },
      infoPlist: {},
      privacyManifests: { NSPrivacyAccessedAPITypes: [] },
    },
    plugins: ["expo-router", ["expo-camera", { cameraPermission: "Scan a coach's QR code to join their practice." }]],
  },
});
const withDeps = (deps: Record<string, string>) => JSON.stringify({ name: "x", private: true, dependencies: deps });

describe("packs config", () => {
  it("validates packs and their settings", () => {
    expect(validateConfig({ packs: ["native", "supabase"], native: { routerRoot: "src/app" }, supabase: { base: "main" } }).packs).toEqual([
      "native",
      "supabase",
    ]);
    expect(() => validateConfig({ packs: ["android"] })).toThrow(/unknown pack "android"/);
    expect(() => validateConfig({ packs: "native" })).toThrow(/"packs" must be a list/);
    expect(() => validateConfig({ native: { routerRoot: "app" } })).toThrow(/native pack is not in "packs"/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { migration: "x" } })).toThrow(/supabase: unknown setting "migration"/);
    expect(() => validateConfig({ packs: ["supabase"], supabase: { exposedSchemas: "public" } })).toThrow(/must be a list/);
  });

  it("pack rule ids are built-in, so rules and allow work and patterns can't take them", async () => {
    for (const id of ["native-raw-primitive", "native-literal-color", "native-custom-header", "native-screen-layout", "store-readiness"]) {
      expect(BUILTIN_RULES).toContain(id);
    }
    for (const id of ["migration-grants", "migration-rls", "migration-definer-search-path", "migration-edited"]) expect(BUILTIN_RULES).toContain(id);
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
    expect(nativeLayouts(pkg)).toEqual(["AuthScreen", "NativeResourcePage", "ScreenContainer", "SettingsPage"]);
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
    expect(r.findings.filter((f) => f.rule === "native-custom-header").every((f) => f.level === "warn")).toBe(true);
    expect(r.findings.find((f) => f.subject === "AppHeader")!.message).toContain("ScreenContainer's header props (composeHeaderOptions)");
  });

  it("native-screen-layout: route screens render a layout directly, through a local import, or redirect", async () => {
    const r = await run("native", NATIVE);
    // index renders ScreenContainer, profile imports a screen that does, old-home redirects,
    // _layout and +html aren't screens.
    expect(brief(r.findings, "native-screen-layout")).toEqual(["native-screen-layout app/settings.tsx:0"]);
    expect(r.findings.find((f) => f.rule === "native-screen-layout")!.level).toBe("warn");
  });

  it("native-screen-layout: honors native.routerRoot and says when the root is missing", async () => {
    const r = await run("native", { packs: ["native"], native: { routerRoot: "src/routes" } });
    expect(brief(r.findings, "native-screen-layout")).toEqual(["native-screen-layout src/routes:0"]);
  });

  it("store-readiness: encryption flag, Sign in with Apple, usage strings, privacy manifest", async () => {
    const r = await run("native", NATIVE);
    expect(brief(r.findings, "store-readiness")).toEqual([
      "store-readiness app.json:0 usesNonExemptEncryption",
      "store-readiness app.json:0 NSCameraUsageDescription",
      "store-readiness app.json:0 privacyManifests",
      "store-readiness package.json:0 expo-apple-authentication",
    ]);
    const apple = r.findings.find((f) => f.subject === "expo-apple-authentication")!;
    expect(apple.level).toBe("error");
    expect(apple.message).toContain("expo-auth-session, Supabase OAuth in src/lib/sign-in.ts");
    expect(apple.message).toContain("guideline 4.8");
    expect(r.findings.find((f) => f.subject === "usesNonExemptEncryption")!.level).toBe("warn");
    expect(r.findings.find((f) => f.subject === "NSCameraUsageDescription")!.level).toBe("error");
  });

  it("store-readiness: a ready app.json passes", async () => {
    const r = await run("native", NATIVE, {
      "app.json": READY_APP_JSON,
      "package.json": withDeps({ "expo-camera": "1", "expo-auth-session": "1", "expo-apple-authentication": "1" }),
    });
    expect(brief(r.findings, "store-readiness")).toEqual([]);
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
    expect(r.findings.filter((f) => f.rule === "native-literal-color").map((f) => f.level)).toEqual(["warn", "warn"]);
  });
});

describe("supabase pack", () => {
  it("reads SQL statements with comments, strings and dollar-quoted bodies blanked", () => {
    const s = sqlStatements("-- a; b\ncreate table t (x text default 'a;b');\n/* c; */ select $$ ; $$;\n\nSELECT \"Mixed\".x");
    expect(s).toEqual([
      { sql: "create table t (x text default '')", line: 2 },
      { sql: "select $$ $$", line: 3 },
      { sql: "select mixed.x", line: 5 },
    ]);
  });

  it("migration-grants, migration-rls and migration-definer-search-path (no git: every migration is new)", async () => {
    const r = await run("supabase", SUPABASE);
    expect(brief(r.findings)).toEqual([
      "migration-rls supabase/migrations/20260101000000_init.sql:5 public.todos",
      "migration-definer-search-path supabase/migrations/20260101000000_init.sql:13 private.do_thing",
      "migration-grants supabase/migrations/20260102000000_grants.sql:2 on all functions",
      "migration-grants supabase/migrations/20260102000000_grants.sql:3 alter default privileges",
      "migration-grants supabase/migrations/20260102000000_grants.sql:5 private.do_thing",
    ]);
    expect(r.findings.every((f) => f.level === "error")).toBe(true);
    expect(r.findings.find((f) => f.subject === "private.do_thing" && f.rule === "migration-grants")!.message).toContain("to anon;");
  });

  it("exposedSchemas widens the RLS check", async () => {
    const r = await run("supabase", { packs: ["supabase"], supabase: { exposedSchemas: ["public", "private"] } });
    expect(brief(r.findings, "migration-rls").map((s) => s.split(" ").pop())).toEqual(["public.todos", "private.secrets"]);
  });

  it("a missing migrations folder is a config error", async () => {
    await expect(run("clean", SUPABASE)).rejects.toThrow(/supabase\/migrations, which doesn't exist/);
  });

  describe("with git", () => {
    const git = (root: string, ...args: string[]) =>
      execFileSync("git", ["-c", "user.name=Doctor Test", "-c", "user.email=doctor@example.test", "-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", ...args], {
        cwd: root,
        stdio: "pipe",
      });
    const repo = () => {
      const root = makeApp("supabase", { ".gitignore": "node_modules\n" });
      git(root, "init", "-q", "-b", "main");
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", "applied");
      git(root, "switch", "-q", "-c", "feature");
      return root;
    };

    it("migration-edited: a migration on the base was changed; grants are checked only in new or changed files", async () => {
      const root = repo();
      appendFileSync(path.join(root, "supabase/migrations/20260101000000_init.sql"), "\ncomment on table public.notes is 'x';\n");
      writeFileSync(path.join(root, "supabase/migrations/20260103000000_new.sql"), "grant execute on all routines in schema public to anon;\n");
      const r = await runDoctor({ root, config: { packs: ["supabase"], supabase: { base: "main" } } });
      expect(brief(r.findings, "migration-edited")).toEqual([
        "migration-edited supabase/migrations/20260101000000_init.sql:0 supabase/migrations/20260101000000_init.sql",
      ]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toContain("put the change in a new migration");
      // The untouched grants migration is no longer checked; the new one is.
      expect(brief(r.findings, "migration-grants")).toEqual(["migration-grants supabase/migrations/20260103000000_new.sql:1 on all functions"]);
    });

    it("migration-edited: deleting an applied migration counts too", async () => {
      const root = repo();
      rmSync(path.join(root, "supabase/migrations/20260102000000_grants.sql"));
      const r = await runDoctor({ root, config: { packs: ["supabase"], supabase: { base: "main" } } });
      expect(brief(r.findings, "migration-edited").map((s) => s.split(" ")[1])).toEqual(["supabase/migrations/20260102000000_grants.sql:0"]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toMatch(/^deletes/);
    });

    it("warns when the base ref is missing instead of guessing", async () => {
      const r = await runDoctor({ root: repo(), config: SUPABASE });
      expect(brief(r.findings, "migration-edited")).toEqual(["migration-edited supabase/migrations:0"]);
      expect(r.findings.find((f) => f.rule === "migration-edited")!.message).toContain("origin/main isn't available");
      expect(r.findings.find((f) => f.rule === "migration-edited")!.level).toBe("warn");
    });
  });
});
