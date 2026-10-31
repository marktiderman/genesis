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
import { privacyApisFor } from "../expo.js";
import { DoctorConfigError } from "./config.js";
import { NATIVE_UI_PACKAGE, readPackageExports, type PackageExports } from "./genesis.js";
import { lineAt } from "./scan.js";
import { localImports, readSource } from "./source.js";
import { insideOverlayOf, markedOverlays } from "./overlays.js";
import type { DoctorContext } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const JSX_EXTS = new Set([".tsx", ".jsx"]);

/** A Genesis screen layout: an exported component named `…Page`, `…Screen`, `ScreenContainer` or `NativeResourceView`. */
const LAYOUT_NAME = /(?:Page|Screen|ScreenContainer)$|^NativeResourceView$/;
/** Route files Expo Router treats as non-screens. */
const NON_SCREEN_ROUTE = /(?:^|\/)(?:_layout|\+html|\+native-intent|\+middleware)\.[jt]sx?$|\+api\.[jt]sx?$/;
/** Header-named components that head a section of a screen, not the screen. */
const PART_HEADER = /(?:Section|List|Card|Dialog|Table|Group|Column|Row|Cell|Accordion|Sheet|Drawer|Modal|Popover|Menu|Panel|Form)Header$/;
const HIDES_HEADER = /\bheaderShown\s*(?::|=\s*\{)\s*false\b/;

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

const RN = String.raw`["']react-native["']`;

/** `native-raw-primitive`: a React Native primitive Genesis wraps, taken from react-native at runtime. */
function checkRawPrimitives(ctx: DoctorContext, pkg: PackageExports): void {
  // The app's overlay of the native component package is the wrapper: it takes the primitives from react-native.
  const overlays = markedOverlays(ctx);
  const wrapped = Object.keys(NATIVE_WRAPPED_PRIMITIVES);
  const named = [
    // import { Modal } / import RN, { Modal }; `import type { … }` doesn't match.
    new RegExp(String.raw`\bimport\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*${RN}`, "g"),
    new RegExp(String.raw`\bexport\s+\{([^}]*)\}\s*from\s*${RN}`, "g"),
    new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*${RN}\s*\)`, "g"),
  ];
  const namespaces = [
    new RegExp(String.raw`\bimport\s+\*\s+as\s+([\w$]+)\s+from\s*${RN}`, "g"),
    new RegExp(String.raw`\b(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*${RN}\s*\)`, "g"),
  ];
  const member = new RegExp(String.raw`\brequire\(\s*${RN}\s*\)\.(${wrapped.join("|")})\b`, "g");
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext) || insideOverlayOf(overlays, file, NATIVE_UI_PACKAGE)) continue;
    const code = file.code;
    const report = (name: string, at: number) => {
      const use = NATIVE_WRAPPED_PRIMITIVES[name].filter((c) => pkg.values.has(c));
      ctx.report({
        rule: "native-raw-primitive",
        file: file.path,
        line: lineAt(code, at),
        subject: name,
        message: `uses ${name} from react-native, which Genesis wraps; use ${use.length ? use.join(" or ") : "the Genesis wrapper"} from ${NATIVE_UI_PACKAGE}`,
      });
    };
    for (const re of named) {
      for (const m of code.matchAll(re)) {
        for (const name of wrappedPrimitivesIn(m[1].replace(/:/g, " as "))) report(name, m.index! + m[0].indexOf(name));
      }
    }
    for (const re of namespaces) {
      for (const m of code.matchAll(re)) {
        for (const use of code.matchAll(new RegExp(String.raw`\b${m[1].replace(/\$/g, "\\$")}\.(${wrapped.join("|")})\b`, "g"))) report(use[1], use.index!);
      }
    }
    for (const m of code.matchAll(member)) report(m[1], m.index!);
  }
}

/** A JSX element matching `re` that Genesis doesn't export and that isn't a section header: the app's own header or bar. */
function customElement(code: string, re: RegExp, pkg: PackageExports): { name: string; index: number } | null {
  for (const m of code.matchAll(re)) {
    const name = m[1];
    if (!pkg.values.has(name.split(".")[0]) && !PART_HEADER.test(name)) return { name, index: m.index! };
  }
  return null;
}

/** The screen's own header: a `<…Header>` of the app's own, or `style={styles.header}`. */
function ownHeader(code: string, pkg: PackageExports): { name: string; index: number } | null {
  const el = customElement(code, /<([A-Z][\w$]*Header)\b/g, pkg);
  if (el) return el;
  const style = /\bstyle=\{\s*styles\.header\s*\}/.exec(code);
  return style ? { name: "styles.header", index: style.index } : null;
}

/** `native-custom-header`: the navigator header turned off and a hand-drawn one rendered, or a hand-built tab bar. */
function checkCustomHeaders(ctx: DoctorContext, pkg: PackageExports): void {
  const layouts = nativeLayouts(pkg);
  if (layouts.length === 0) return;
  const headerWay = pkg.values.has("ScreenContainer")
    ? `ScreenContainer's header props${pkg.values.has("composeHeaderOptions") ? " (composeHeaderOptions)" : ""}`
    : `a Genesis layout's header (${layouts.join(", ")})`;
  const rootDir = routerRoot(ctx);
  const reported = new Set<string>();
  /** Folders whose _layout hides the header for the screens beside it. */
  const hidingLayouts = new Map<string, string>();
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext)) continue;
    const code = file.code;
    const hidden = HIDES_HEADER.exec(code);
    if (hidden && /(?:^|\/)_layout\.[jt]sx$/.test(file.path)) hidingLayouts.set(path.posix.dirname(file.path), file.path);
    const own = hidden ? ownHeader(code, pkg) : null;
    if (hidden && own) {
      reported.add(file.path);
      ctx.report({
        rule: "native-custom-header",
        level: "warn",
        file: file.path,
        line: lineAt(code, hidden.index),
        subject: own.name,
        message: `hides the navigator header and draws its own (${own.name}); use ${headerWay} so the title, back button and large-title behavior stay native`,
      });
    }
    const tabBarProp = /<Tabs\b/.test(code) ? /\btabBar\s*=\s*\{/.exec(code) : null;
    const tabBar = tabBarProp ? { name: "tabBar prop", index: tabBarProp.index } : customElement(code, /<([A-Z][\w$]*TabBar)\b/g, pkg);
    if (tabBar) {
      ctx.report({
        rule: "native-custom-header",
        level: "warn",
        file: file.path,
        line: lineAt(code, tabBar.index),
        subject: tabBar.name,
        message: `builds a tab bar by hand (${tabBar.name}); use the router's native <Tabs> bar, themed through Genesis screenOptions`,
      });
    }
  }
  // A layout that hides the header for its stack, and a screen in it that draws one.
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext) || reported.has(file.path) || !file.path.startsWith(`${rootDir}/`) || NON_SCREEN_ROUTE.test(file.path)) continue;
    const layout = hidingLayouts.get(path.posix.dirname(file.path));
    const own = layout ? ownHeader(file.code, pkg) : null;
    if (!layout || !own) continue;
    ctx.report({
      rule: "native-custom-header",
      level: "warn",
      file: file.path,
      line: lineAt(file.code, own.index),
      subject: own.name,
      message: `draws its own header (${own.name}) while ${layout} hides the navigator's; use ${headerWay} so the title, back button and large-title behavior stay native`,
    });
  }
}

/** Tags a route that is only a loading state may render next to it: its header options and fragments. */
const LOADING_ROUTE_COMPANIONS = new Set(["NativeLoadingState", "Stack.Screen", "Fragment", "React.Fragment"]);

/** A route whose only screen is a full-screen NativeLoadingState (a redirect or loading bridge). */
export function isLoadingOnlyRoute(code: string): boolean {
  const loading = [...code.matchAll(/<NativeLoadingState\b([^>]*)>/g)];
  if (loading.length === 0 || loading.some((m) => /\bfullScreen\s*=\s*\{\s*false\s*\}/.test(m[1] ?? ""))) return false;
  const tags = [...code.matchAll(/<([A-Z][\w.]*)/g)].map((m) => m[1] ?? "");
  return tags.every((t) => LOADING_ROUTE_COMPANIONS.has(t));
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
    ctx.report({ rule: "native-screen-layout", level: "warn", file: rootDir, message: `no Expo Router root at ${rootDir}; set doctor.native.routerRoot` });
    return;
  }
  const routes = ctx.files.filter((f) => f.path.startsWith(`${rootDir}/`));
  if (routes.length === 0) {
    ctx.report({
      rule: "native-screen-layout",
      level: "warn",
      file: rootDir,
      message: `no scanned file is under the router root ${rootDir}, so no screen was checked; add it to doctor.src`,
    });
    return;
  }
  // A redirect is a screen too, here or through an import.
  const renders = new RegExp(`<(?:${[...layouts, "Redirect"].join("|")})\\b`);
  // So is a route that is only a whole-screen loading state (it brings its own safe area): counted
  // in the route itself, never through an import, and not when it's a block (fullScreen={false}).
  const loadingOnly = pkg.values.has("NativeLoadingState") ? isLoadingOnlyRoute : () => false;
  const byPath = new Map(ctx.files.map((f) => [f.absolutePath, f]));
  for (const file of routes) {
    if (!JSX_EXTS.has(file.ext) || NON_SCREEN_ROUTE.test(file.path)) continue;
    // A route that only re-exports a screen, or renders no JSX, is judged where the screen lives.
    if (!/\bexport\s+default\b/.test(file.code) || !/<[A-Za-z]/.test(file.code)) continue;
    if (renders.test(file.code) || loadingOnly(file.code)) continue;
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

// ---- store-readiness ----

/**
 * Modules that need an iOS usage string: the Info.plist key, and the config-plugin
 * option that sets it (`false` opts out). `maybe`: the module works without that
 * permission (playback only, picking from the library), so the string may not be needed.
 */
const PERMISSIONS: ReadonlyArray<{ module: string; key: string; option: string; maybe?: string }> = [
  { module: "expo-camera", key: "NSCameraUsageDescription", option: "cameraPermission" },
  { module: "expo-image-picker", key: "NSPhotoLibraryUsageDescription", option: "photosPermission" },
  { module: "expo-image-picker", key: "NSCameraUsageDescription", option: "cameraPermission", maybe: "takes photos with the camera" },
  { module: "expo-media-library", key: "NSPhotoLibraryUsageDescription", option: "photosPermission" },
  { module: "expo-location", key: "NSLocationWhenInUseUsageDescription", option: "locationWhenInUsePermission" },
  { module: "expo-av", key: "NSMicrophoneUsageDescription", option: "microphonePermission", maybe: "records audio" },
  { module: "expo-audio", key: "NSMicrophoneUsageDescription", option: "microphonePermission", maybe: "records audio" },
  { module: "expo-contacts", key: "NSContactsUsageDescription", option: "contactsPermission" },
  { module: "expo-local-authentication", key: "NSFaceIDUsageDescription", option: "faceIDPermission" },
];
/** Packages that are a third-party sign-in (App Store guideline 4.8). */
const SOCIAL_SIGN_IN = ["@react-native-google-signin/google-signin", "react-native-fbsdk-next"];
/** Used for sign-in and for other OAuth flows alike: mentioned, never enough on its own. */
const WEAK_SOCIAL_SIGN_IN = ["expo-auth-session"];
const APPLE_SIGN_IN = ["expo-apple-authentication", "@invertase/react-native-apple-authentication"];
const EXPO_CONFIGS = ["app.json", "app.config.json", "app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"];
const SUPABASE_SIGN_IN = /\bsignInWith(?:OAuth|IdToken)\s*\(\s*\{\s*provider\s*:\s*["']([\w-]+)["']/g;
/** This package's Expo config plugin, as `plugins` lists it. */
const GENESIS_PLUGIN = "@marktiderman/genesis-cli";
const GENESIS_PLUGIN_TEXT = /["']@marktiderman\/genesis-cli(?:\/expo)?["']|\bwithGenesis\s*\(/;
/** `from "…genesis-cli…"`, `require("…")` and `import("…")` of the package: naming it there isn't listing the plugin. */
const GENESIS_PLUGIN_IMPORT = /\bfrom\s*["']@marktiderman\/genesis-cli[^"']*["']|\b(?:require|import)\s*\(\s*["']@marktiderman\/genesis-cli[^"']*["']\s*\)/g;

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

/** A config plugin's entry in `plugins`: its options (`{}` when listed without any), or null when it isn't listed. */
function pluginOptions(json: Record<string, unknown> | null, module: string): Record<string, unknown> | null {
  const plugins = json?.plugins;
  if (!Array.isArray(plugins)) return null;
  for (const p of plugins) {
    if (p === module) return {};
    if (Array.isArray(p) && p[0] === module) return p[1] && typeof p[1] === "object" ? (p[1] as Record<string, unknown>) : {};
  }
  return null;
}

function dependencies(root: string): Set<string> {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return new Set();
  const pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string> | undefined>;
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

/** `dependencies` only, as the config plugin reads them (dev tools ship nothing). */
function runtimeDependencies(root: string): Record<string, unknown> {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return {};
  return (JSON.parse(readFileSync(file, "utf8")) as { dependencies?: Record<string, unknown> }).dependencies ?? {};
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
  /**
   * This package's own config plugin (`withGenesis()`) is listed and its `option` isn't `false`, so
   * it sets that step when the config is evaluated. A dynamic config is read as text: the plugin's
   * name or `withGenesis(`, and no `option: false`.
   */
  const genesisPluginDoes = (option: string) =>
    configs.some((c) => {
      if (c.json) {
        const options = pluginOptions(c.json, GENESIS_PLUGIN) ?? pluginOptions(c.json, `${GENESIS_PLUGIN}/expo`);
        return options !== null && options[option] !== false;
      }
      // An import of the package (`import { withGenesis } from "@marktiderman/genesis-cli/expo"`)
      // doesn't list the plugin; calling `withGenesis(` or naming it in `plugins` does.
      const listed = c.text.replace(GENESIS_PLUGIN_IMPORT, "");
      return GENESIS_PLUGIN_TEXT.test(listed) && !new RegExp(`\\b${option}\\s*:\\s*false\\b`).test(c.text);
    });

  const exportCompliance =
    has(["ios", "config", "usesNonExemptEncryption"], "usesNonExemptEncryption") ||
    has(["ios", "infoPlist", "ITSAppUsesNonExemptEncryption"], "ITSAppUsesNonExemptEncryption") ||
    genesisPluginDoes("exportCompliance");
  if (!exportCompliance) {
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file,
      subject: "usesNonExemptEncryption",
      message: "sets neither ios.config.usesNonExemptEncryption nor ios.infoPlist.ITSAppUsesNonExemptEncryption; set it (false for HTTPS-only apps) so App Store Connect doesn't hold every build for the export-compliance question",
    });
  }

  // Sign in with Apple, or an equivalent privacy-focused login, beside third-party sign-in (guideline 4.8).
  const social = SOCIAL_SIGN_IN.filter((d) => deps.has(d));
  let apple = APPLE_SIGN_IN.some((d) => deps.has(d));
  for (const f of ctx.files) {
    for (const m of f.code.matchAll(SUPABASE_SIGN_IN)) {
      if (m[1] === "apple") apple = true;
      else if (!social.includes(`Supabase ${m[1]} sign-in`)) social.push(`Supabase ${m[1]} sign-in`);
    }
  }
  if (social.length > 0 && !apple) {
    const weak = WEAK_SOCIAL_SIGN_IN.filter((d) => deps.has(d));
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file: "package.json",
      subject: "sign-in-with-apple",
      message:
        `offers third-party sign-in (${[...social, ...weak].join(", ")}) and no Sign in with Apple. App Store guideline 4.8 asks for an equivalent login ` +
        "that limits data collection to name and email, lets people keep their email private and doesn't track them; Sign in with Apple " +
        "(expo-apple-authentication, or Supabase's apple provider) is the usual one. If another option qualifies, allow this with the reason.",
    });
  }

  const generic = new Map<string, string[]>();
  for (const p of PERMISSIONS) {
    if (!deps.has(p.module)) continue;
    const set = configs.some((c) => {
      if (!c.json) return new RegExp(`\\b(?:${p.key}|${p.option})\\b`).test(c.text);
      const plist = get(c.json, ["ios", "infoPlist", p.key]);
      const option = pluginOptions(c.json, p.module)?.[p.option];
      // A sentence, or `false`: Expo's documented opt-out for a permission the app doesn't use.
      return (typeof plist === "string" && plist.trim() !== "") || (typeof option === "string" && option.trim() !== "") || option === false;
    });
    if (!set) generic.set(p.key, [...(generic.get(p.key) ?? []), `${p.module}${p.maybe ? `, if the app ${p.maybe}` : ""}`]);
  }
  for (const [key, modules] of generic) {
    const opt = PERMISSIONS.find((p) => p.key === key)!.option;
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file,
      subject: key,
      message: `leaves ${key} to Expo's generic default string (${modules.join("; ")}), and App Review rejects generic purpose strings; set the plugin's ${opt} (or ios.infoPlist.${key}) to a sentence saying why the app needs it, or ${opt}: false if it doesn't`,
    });
  }

  // The plugin writes a manifest only for packages it knows need one (`privacyApisFor`).
  const pluginManifest = genesisPluginDoes("privacyManifest") && privacyApisFor(runtimeDependencies(ctx.root)).length > 0;
  if (!has(["ios", "privacyManifests"], "privacyManifests") && !pluginManifest) {
    ctx.report({
      rule: "store-readiness",
      level: "warn",
      file,
      subject: "privacyManifests",
      message: "has no ios.privacyManifests; declare the required-reason APIs the app uses (NSPrivacyAccessedAPITypes) so uploads aren't rejected for a missing privacy manifest",
    });
  }
}
