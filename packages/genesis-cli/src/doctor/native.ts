/**
 * The `native` pack: rules for Expo / React Native apps on
 * `@marktiderman/genesis-ui-native`. Turned on with `doctor.packs: ["native"]`.
 *
 * The screen layouts and replacements are read from the installed native
 * package's declarations, like the core rules read the web package; the
 * wrapped-primitive list is shared with the repo's check-forbidden-imports
 * gate. Literal colors in native code are reported by rules.ts checkColors
 * as `native-literal-color`.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { NATIVE_WRAPPED_PRIMITIVES, wrappedPrimitivesIn } from "../../../../scripts/lib/native-primitives.mjs";
import { DoctorConfigError } from "./config.js";
import { NATIVE_UI_PACKAGE, readPackageExports, type PackageExports } from "./genesis.js";
import { lineAt } from "./scan.js";
import type { DoctorContext, SourceFile } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const JSX_EXTS = new Set([".tsx", ".jsx"]);
const RESOLVE_EXTS = [".tsx", ".ts", ".jsx", ".js"];

/** A Genesis screen layout: an exported component named `…Page`, `…Screen` or `ScreenContainer`. */
const LAYOUT_NAME = /(?:Page|Screen|ScreenContainer)$/;
/** Route files Expo Router treats as non-screens. */
const NON_SCREEN_ROUTE = /(?:^|\/)(?:_layout|\+html|\+native-intent|\+middleware)\.[jt]sx?$|\+api\.[jt]sx?$/;

/** The installed native package (also when `uiPackage` points the core rules at the web one). */
function nativePackage(ctx: DoctorContext): PackageExports {
  const pkg = readPackageExports(ctx.root, NATIVE_UI_PACKAGE);
  if (!pkg) throw new DoctorConfigError(`the native pack needs ${NATIVE_UI_PACKAGE}; install it, or remove "native" from doctor.packs`);
  return pkg;
}

/** Genesis screen layouts the installed native package exports, sorted. */
export function nativeLayouts(pkg: Pick<PackageExports, "components">): string[] {
  return pkg.components.filter((n) => LAYOUT_NAME.test(n));
}

export function checkNativePack(ctx: DoctorContext): void {
  const pkg = nativePackage(ctx);
  checkRawPrimitives(ctx, pkg);
  checkCustomHeaders(ctx, pkg);
  checkScreenLayouts(ctx, pkg);
  checkStoreReadiness(ctx);
}

/** `native-raw-primitive`: a React Native primitive Genesis wraps, imported from react-native. */
function checkRawPrimitives(ctx: DoctorContext, pkg: PackageExports): void {
  const re = /\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']react-native["']/g;
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    for (const m of file.code.matchAll(re)) {
      for (const name of wrappedPrimitivesIn(m[1])) {
        const use = NATIVE_WRAPPED_PRIMITIVES[name].filter((c) => pkg.values.has(c));
        ctx.report({
          rule: "native-raw-primitive",
          file: file.path,
          line: lineAt(file.code, m.index! + m[0].indexOf(name)),
          subject: name,
          message: `imports ${name} from react-native, which Genesis wraps; use ${use.length ? use.join(" or ") : "the Genesis wrapper"} from ${NATIVE_UI_PACKAGE}`,
        });
      }
    }
  }
}

/** `native-custom-header`: the navigator header turned off and a hand-drawn one rendered, or a hand-built tab bar. */
function checkCustomHeaders(ctx: DoctorContext, pkg: PackageExports): void {
  const layouts = nativeLayouts(pkg);
  if (layouts.length === 0) return;
  const headerWay = pkg.values.has("ScreenContainer")
    ? `ScreenContainer's header props${pkg.values.has("composeHeaderOptions") ? " (composeHeaderOptions)" : ""}`
    : `a Genesis layout's header (${layouts.join(", ")})`;
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext)) continue;
    const code = file.code;
    const hidden = /\bheaderShown\s*(?::|=\s*\{)\s*false\b/.exec(code);
    if (hidden) {
      const own = customElement(code, /<([A-Z][\w$]*Header[\w$]*)\b/g, pkg) ?? (/\bstyles\.header\w*\b/.test(code) ? "styles.header" : null);
      if (own) {
        ctx.report({
          rule: "native-custom-header",
          level: "warn",
          file: file.path,
          line: lineAt(code, hidden.index),
          subject: own,
          message: `hides the navigator header and draws its own (${own}); use ${headerWay} so the title, back button and large-title behavior stay native`,
        });
      }
    }
    const tabBarProp = /<Tabs\b[^>]*?\btabBar\s*=\s*\{/.exec(code);
    const tabBar = tabBarProp ? "tabBar prop" : customElement(code, /<([A-Z][\w$]*TabBar[\w$]*)\b/g, pkg);
    if (tabBar) {
      const at = tabBarProp ? tabBarProp.index : code.search(new RegExp(`<${tabBar}\\b`));
      ctx.report({
        rule: "native-custom-header",
        level: "warn",
        file: file.path,
        line: lineAt(code, at),
        subject: tabBar,
        message: `builds a tab bar by hand (${tabBar}); use the router's native <Tabs> bar, themed through Genesis screenOptions`,
      });
    }
  }
}

/** The first JSX element matching `re` that Genesis doesn't export (the app's own). */
function customElement(code: string, re: RegExp, pkg: PackageExports): string | null {
  for (const m of code.matchAll(re)) {
    const name = m[1].split(".")[0];
    if (!pkg.values.has(name)) return m[1];
  }
  return null;
}

/** The Expo Router root: `native.routerRoot`, else `src/app`, else `app`. */
export function routerRoot(ctx: Pick<DoctorContext, "root" | "config">): string {
  if (ctx.config.native?.routerRoot) return ctx.config.native.routerRoot.replace(/\/+$/, "");
  return existsSync(path.join(ctx.root, "src", "app")) ? "src/app" : "app";
}

/** `native-screen-layout`: a route screen that doesn't render a Genesis screen layout (directly or through one local import). */
function checkScreenLayouts(ctx: DoctorContext, pkg: PackageExports): void {
  const layouts = nativeLayouts(pkg);
  if (layouts.length === 0) return;
  const rootDir = routerRoot(ctx);
  if (!existsSync(path.join(ctx.root, rootDir))) {
    ctx.report({
      rule: "native-screen-layout",
      level: "warn",
      file: rootDir,
      message: `no Expo Router root at ${rootDir}; set doctor.native.routerRoot`,
    });
    return;
  }
  const renders = new RegExp(`<(?:${layouts.join("|")}|Redirect)\\b`);
  const byPath = new Map(ctx.files.map((f) => [f.absolutePath, f]));
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext) || !file.path.startsWith(`${rootDir}/`) || NON_SCREEN_ROUTE.test(file.path)) continue;
    // A route that only re-exports a screen, or renders no JSX, is judged where the screen lives.
    if (!/\bexport\s+default\b/.test(file.code) || !/<[A-Za-z]/.test(file.code)) continue;
    if (renders.test(file.code)) continue;
    const viaImport = localImports(ctx.root, file).some((abs) => {
      const target = byPath.get(abs) ?? readSource(abs);
      return target !== null && renders.test(target.code);
    });
    if (viaImport) continue;
    ctx.report({
      rule: "native-screen-layout",
      level: "warn",
      file: file.path,
      message: `doesn't render a Genesis screen layout (${layouts.join(", ")}); wrap the screen in one so the header, safe area and scrolling match every other screen`,
    });
  }
}

/** Files a source imports by relative path or the `@/` / `~/` root aliases, resolved to absolute paths that exist. */
function localImports(root: string, file: SourceFile): string[] {
  const out: string[] = [];
  for (const m of file.code.matchAll(/\bfrom\s*["']((?:\.{1,2}|[@~])\/[^"']+)["']/g)) {
    const spec = m[1];
    const bases = spec.startsWith(".")
      ? [path.resolve(path.dirname(file.absolutePath), spec)]
      : [path.join(root, spec.slice(2)), path.join(root, "src", spec.slice(2))];
    for (const base of bases) {
      const hit = [base, ...RESOLVE_EXTS.map((e) => base + e), ...RESOLVE_EXTS.map((e) => path.join(base, `index${e}`))].find(
        (p) => SCRIPT_EXTS.has(path.extname(p)) && existsSync(p),
      );
      if (hit) {
        out.push(hit);
        break;
      }
    }
  }
  return out;
}

function readSource(abs: string): Pick<SourceFile, "code"> | null {
  try {
    return { code: readFileSync(abs, "utf8") };
  } catch {
    return null;
  }
}

// ---- store-readiness ----

/** Modules that need an iOS usage string: the Info.plist key, and the config-plugin option that sets it. */
const PERMISSIONS: ReadonlyArray<{ module: string; key: string; option: string }> = [
  { module: "expo-camera", key: "NSCameraUsageDescription", option: "cameraPermission" },
  { module: "expo-image-picker", key: "NSPhotoLibraryUsageDescription", option: "photosPermission" },
  { module: "expo-image-picker", key: "NSCameraUsageDescription", option: "cameraPermission" },
  { module: "expo-media-library", key: "NSPhotoLibraryUsageDescription", option: "photosPermission" },
  { module: "expo-location", key: "NSLocationWhenInUseUsageDescription", option: "locationWhenInUsePermission" },
  { module: "expo-av", key: "NSMicrophoneUsageDescription", option: "microphonePermission" },
  { module: "expo-audio", key: "NSMicrophoneUsageDescription", option: "microphonePermission" },
  { module: "expo-contacts", key: "NSContactsUsageDescription", option: "contactsPermission" },
];
/** Third-party sign-in packages that trigger App Store guideline 4.8. */
const SOCIAL_SIGN_IN = ["expo-auth-session", "@react-native-google-signin/google-signin", "react-native-fbsdk-next"];
const APPLE_SIGN_IN = ["expo-apple-authentication", "@invertase/react-native-apple-authentication"];
const EXPO_CONFIGS = ["app.json", "app.config.json", "app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"];

/** The app's Expo config as data (JSON files) plus text (dynamic configs, scanned best-effort). */
interface ExpoConfig {
  file: string;
  json: Record<string, unknown> | null;
  text: string;
}

function readExpoConfigs(root: string): ExpoConfig[] {
  const out: ExpoConfig[] = [];
  for (const name of EXPO_CONFIGS) {
    const abs = path.join(root, name);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    let json: Record<string, unknown> | null = null;
    if (name.endsWith(".json")) {
      try {
        const raw = JSON.parse(text) as Record<string, unknown>;
        json = (raw.expo as Record<string, unknown> | undefined) ?? raw;
      } catch (err) {
        throw new DoctorConfigError(`${name} is not valid JSON: ${(err as Error).message}`);
      }
    }
    out.push({ file: name, json, text });
  }
  return out;
}

function get(obj: unknown, keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** A config plugin's options object from `plugins`, or null when the plugin isn't listed with options. */
function pluginOptions(json: Record<string, unknown> | null, module: string): Record<string, unknown> | null {
  const plugins = json?.plugins;
  if (!Array.isArray(plugins)) return null;
  for (const p of plugins) {
    if (Array.isArray(p) && p[0] === module && p[1] && typeof p[1] === "object") return p[1] as Record<string, unknown>;
  }
  return null;
}

function dependencies(root: string): Set<string> {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return new Set();
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string> | undefined>;
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

/** `store-readiness`: static App Store checks against app.json / app.config.*. */
export function checkStoreReadiness(ctx: DoctorContext): void {
  const configs = readExpoConfigs(ctx.root);
  if (configs.length === 0) {
    ctx.report({ rule: "store-readiness", level: "warn", file: "app.json", message: "no app.json or app.config.* found; the store checks read the Expo config" });
    return;
  }
  const file = configs[0].file;
  const deps = dependencies(ctx.root);
  /** A setting is present in any config: the JSON path is set, or a dynamic config's text names it. */
  const has = (keys: string[], word: string) =>
    configs.some((c) => (c.json ? get(c.json, keys) !== undefined : new RegExp(`\\b${word}\\b`).test(c.text)));

  if (!has(["ios", "config", "usesNonExemptEncryption"], "usesNonExemptEncryption") && !has(["ios", "infoPlist", "ITSAppUsesNonExemptEncryption"], "ITSAppUsesNonExemptEncryption")) {
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file,
      subject: "usesNonExemptEncryption",
      message: "sets neither ios.config.usesNonExemptEncryption nor ios.infoPlist.ITSAppUsesNonExemptEncryption; set it (false for HTTPS-only apps) so App Store Connect doesn't hold every build for the export-compliance question",
    });
  }

  const social = SOCIAL_SIGN_IN.filter((d) => deps.has(d));
  const supabaseOAuth = ctx.files.find((f) => /\bsignInWithOAuth\s*\(|\bsignInWithIdToken\s*\(\s*\{\s*provider\s*:\s*["'](?!apple["'])/.test(f.code));
  if (supabaseOAuth) social.push(`Supabase OAuth in ${supabaseOAuth.path}`);
  if (social.length > 0 && !APPLE_SIGN_IN.some((d) => deps.has(d))) {
    ctx.report({
      rule: "store-readiness",
      file: "package.json",
      subject: "expo-apple-authentication",
      message: `offers third-party sign-in (${social.join(", ")}) without Sign in with Apple; App Store guideline 4.8 requires it: add expo-apple-authentication`,
    });
  }

  const missing = new Map<string, string[]>();
  for (const p of PERMISSIONS) {
    if (!deps.has(p.module)) continue;
    const set = configs.some((c) =>
      c.json
        ? typeof get(c.json, ["ios", "infoPlist", p.key]) === "string" || typeof pluginOptions(c.json, p.module)?.[p.option] === "string"
        : new RegExp(`\\b(?:${p.key}|${p.option})\\b`).test(c.text),
    );
    if (!set) missing.set(p.key, [...(missing.get(p.key) ?? []), `${p.module} (${p.option})`]);
  }
  for (const [key, modules] of missing) {
    ctx.report({
      rule: "store-readiness",
      file,
      subject: key,
      message: `has no ${key} for ${modules.join(", ")}; set ios.infoPlist.${key} or the plugin option to a sentence saying why the app needs it (App Review rejects missing or generic strings)`,
    });
  }

  if (!has(["ios", "privacyManifests"], "privacyManifests")) {
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file,
      subject: "privacyManifests",
      message: "has no ios.privacyManifests; declare the required-reason APIs the app uses (NSPrivacyAccessedAPITypes) so uploads aren't rejected for a missing privacy manifest",
    });
  }
}
