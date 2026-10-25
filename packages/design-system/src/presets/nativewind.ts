/**
 * Tailwind v3 preset for NativeWind v4 apps, the one Genesis React Native
 * components (`@marktiderman/genesis-ui-native`) need:
 *
 *   import { fileURLToPath } from "node:url";
 *   import nativewindPreset from "nativewind/preset";
 *   import { genesisNativewindContent, genesisNativewindPreset } from "@marktiderman/genesis-design-system/presets/nativewind";
 *   export default {
 *     content: ["./src/**\/*.{ts,tsx}", ...genesisNativewindContent({ root: fileURLToPath(new URL(".", import.meta.url)) })],
 *     presets: [nativewindPreset, genesisNativewindPreset],
 *   };
 *
 * On top of {@link genesisPreset} it adds the theme's role colors
 * (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as
 * `hsl(var(--primary))`) and declares their variables, light on `:root` and
 * dark under `prefers-color-scheme: dark`, the same values as
 * `themes/genesis.css`. NativeWind v4 can't import that stylesheet, so
 * without this preset those classes aren't generated at all and the
 * components render unstyled (default black borders, buttons with no fill).
 *
 * The radius scale stays `calc(var(--radius) - 2px)` and friends: NativeWind
 * resolves `calc()` and `var()` at runtime (with its 14px rem).
 *
 * NativeWind v5 / Tailwind v4 apps import the CSS instead (see
 * `presets/tailwind`).
 *
 * @stability Beta
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { genesisPreset } from "./tailwind";
import { GENESIS_THEME_BRAND, tailwindColorVariables, themeVariables } from "../tokens/theme-css";

type ColorValue = string | Readonly<Record<string, string>>;

const roleColors = tailwindColorVariables();
const baseColors = genesisPreset.theme.extend.colors as Readonly<Record<string, ColorValue>>;

// A key in both (success, warning, info) keeps its scale and takes the theme variable as DEFAULT,
// as the Tailwind v4 bridge does on web.
const colors: Record<string, ColorValue> = { ...baseColors };
for (const [key, value] of Object.entries(roleColors)) {
  const base = baseColors[key];
  colors[key] = base && typeof base === "object" ? { ...base, DEFAULT: value } : value;
}

const variables = themeVariables(GENESIS_THEME_BRAND);

interface AddBase {
  addBase: (base: Record<string, unknown>) => void;
}

export const genesisNativewindPreset = {
  theme: {
    extend: {
      ...genesisPreset.theme.extend,
      colors,
    },
  },
  plugins: [
    ({ addBase }: AddBase) => {
      addBase({
        ":root": variables.light,
        "@media (prefers-color-scheme: dark)": { ":root": variables.dark },
      });
    },
  ],
};

/** @stability Beta */
export interface GenesisNativewindContentOptions {
  /** The app's folder (where its package.json is). Default `process.cwd()`, where Tailwind runs. */
  root?: string;
  /**
   * Packages to start from besides the app's own `@marktiderman/genesis-*`
   * dependencies, such as your own wrapper around ui-native. Their Genesis
   * dependencies are followed too.
   */
  packages?: readonly string[];
}

const GENESIS_SCOPE = "@marktiderman/genesis-";

/**
 * Tailwind `content` globs for every Genesis React Native package the app
 * uses, so the classes inside them are generated:
 *
 *   content: ["./src/**\/*.{ts,tsx}", ...genesisNativewindContent({ root: fileURLToPath(new URL(".", import.meta.url)) })],
 *
 * Starting from the `@marktiderman/genesis-*` packages in the app's
 * package.json, and following theirs, it keeps the ones that peer on React
 * Native and lists their `src` and `dist`, wherever they are installed:
 * the app's node_modules, a hoisted workspace root, or a workspace link.
 * A hand-written `./node_modules/@marktiderman/genesis-ui-native/…` glob
 * finds nothing when the package is hoisted above the app.
 *
 * @stability Beta
 */
export function genesisNativewindContent(options: GenesisNativewindContentOptions = {}): string[] {
  const root = path.resolve(options.root ?? process.cwd());
  const globs: string[] = [];
  const visited = new Set<string>();
  const direct = [...genesisDependencies(readJson(path.join(root, "package.json")), true), ...(options.packages ?? [])];
  const queue: { name: string; from: string; direct: boolean }[] = direct.map((name) => ({ name, from: root, direct: true }));
  while (queue.length > 0) {
    const { name, from, direct: isDirect } = queue.shift()!;
    const dir = packageDir(name, from);
    if (!dir) {
      // A package the app lists but that isn't installed: its components would render unstyled.
      if (isDirect) console.warn(`genesisNativewindContent: ${name} is in the app's package.json but isn't installed; run the install.`);
      continue;
    }
    // By folder: two copies of a package are both scanned.
    if (visited.has(dir)) continue;
    visited.add(dir);
    const manifest = readJson(path.join(dir, "package.json"));
    const peers = (manifest.peerDependencies ?? {}) as Record<string, string>;
    if ("react-native" in peers || "nativewind" in peers) {
      const posix = dir.split(path.sep).join("/");
      globs.push(`${posix}/src/**/*.{ts,tsx}`, `${posix}/dist/**/*.js`);
    }
    for (const next of genesisDependencies(manifest)) queue.push({ name: next, from: dir, direct: false });
  }
  return globs;
}

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

function readJson(file: string): Manifest {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

/** The app's own devDependencies count; a package's (its tests' tooling) don't. */
function genesisDependencies(manifest: Manifest, withDev = false): string[] {
  const names = Object.keys({ ...manifest.dependencies, ...(withDev ? manifest.devDependencies : {}), ...manifest.peerDependencies });
  return names.filter((name) => name.startsWith(GENESIS_SCOPE));
}

/** The installed folder of `name` as Node would find it from `from`, without going through its `exports`. */
function packageDir(name: string, from: string): string | null {
  const lookup = createRequire(path.join(from, "package.json")).resolve.paths(name) ?? [];
  for (const nodeModules of lookup) {
    const dir = path.join(nodeModules, name);
    if (existsSync(path.join(dir, "package.json"))) return realpathSync(dir);
  }
  return null;
}
