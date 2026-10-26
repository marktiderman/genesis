/**
 * Public types for `genesis doctor` and its rule plugins.
 */

/** `info` is reported but never fails a run, `--strict` included. */
export type Level = "error" | "warn" | "info";

/** A rule's configured level: a level, or `"off"` to drop its findings. */
export type RuleSetting = Level | "off";

/** One problem the doctor found. */
export interface Finding {
  /** The rule that produced it, e.g. `raw-tag` or a pattern/plugin rule id. */
  rule: string;
  level: Level;
  /** Path relative to the app root, POSIX separators. */
  file: string;
  /** 1-based line, or 0 when the finding is about the whole file. */
  line: number;
  message: string;
  /**
   * What the finding is about (a tag, token, export name, import specifier).
   * An `allow` entry's `match` is compared against it.
   */
  subject?: string;
}

/** What a rule or plugin passes to `report`. `level` defaults to `"error"`. */
export interface FindingInput {
  rule: string;
  level?: Level;
  file: string;
  line?: number;
  message: string;
  subject?: string;
}

/** A justified exception. `reason` is required: an exception nobody can explain is a bug. */
export interface AllowEntry {
  rule: string;
  /** Glob relative to the app root. Omit to allow in every file. */
  file?: string;
  /** Exact subject (tag, token, export name, import specifier). Omit to allow any. */
  match?: string;
  reason: string;
}

/** A declarative check: which files it covers and the pattern they must (not) contain. */
export interface PatternRule {
  id: string;
  /** `guide` documents a convention and is never checked. Default `error`. */
  level?: Level | "guide";
  /** Globs the rule applies to. Required unless the level is `guide`. */
  files?: string[];
  exclude?: string[];
  /** Regular expression that must not appear (multiline). Prefix `(?i)` for case-insensitive. */
  forbid?: string;
  /** Regular expression every matching file must contain. */
  require?: string;
  /** Regular expression every matching file's path must fit. */
  path?: string;
  message?: string;
}

/** A plugin entry in config: a module path, or `[path, options]`. */
export type PluginSpec = string | [string, unknown];

/** An opt-in rule pack. */
export type DoctorPack = "native" | "supabase" | "packages";

/** Settings for the `packages` pack (the app's local packages). */
export interface PackagesPackConfig {
  /** The git ref the change gate compares against when `--base` isn't given. No default: without one the gate is skipped (info). */
  base?: string;
}

/** Settings for the `native` pack. */
export interface NativePackConfig {
  /** The Expo Router root, relative to the app. Default: `src/app`, else `app`. */
  routerRoot?: string;
}

/** Settings for the `supabase` pack. */
export interface SupabasePackConfig {
  /** The migrations folder. Default `supabase/migrations`. */
  migrations?: string;
  /** The git ref applied migrations are compared against. Default `origin/main`. */
  base?: string;
  /** Schemas the API exposes: their tables need row level security, and only their functions may be granted to anon/public. Default `["public"]`. */
  exposedSchemas?: string[];
  /**
   * A migration file name or timestamp prefix: files sorting before it are applied and
   * trusted by `migration-grants`. Without it, grants are checked only when git can
   * tell new migrations from applied ones.
   */
  since?: string;
}

/** The `doctor` block of genesis.config.json (or package.json `genesis.doctor`). */
export interface DoctorConfig {
  /** Opt-in rule packs: `native` (Expo apps) and `supabase` (migrations). Default none. */
  packs?: DoctorPack[];
  native?: NativePackConfig;
  supabase?: SupabasePackConfig;
  packages?: PackagesPackConfig;
  /** Folders to scan, relative to the app root. Default `["src"]` (`["app", "src", "components"]` with the native pack). */
  src?: string[];
  /** File extensions to scan. Default `.ts .tsx .js .jsx .mts .cts .css`. */
  extensions?: string[];
  /** Extra globs to skip, on top of the defaults (tests, fixtures, `.d.ts`, `*.gen.*`). */
  ignore?: string[];
  /** The component package. Default `@marktiderman/genesis-ui` (`@marktiderman/genesis-ui-native` with the native pack). */
  uiPackage?: string;
  /**
   * Theme stylesheet(s) whose custom properties are the defined tokens: one
   * or a list of package specifiers (`@scope/pkg/path.css`) or app-relative
   * paths. Default: every `.css` in the design system's `dist/themes/`
   * (genesis.css and the Tailwind v4 bridge genesis-tailwind4.css), plus
   * genesis-ui's styles.
   */
  themeCss?: string | string[];
  /**
   * App files whose custom-property declarations also count as defined
   * tokens (a brand bridge). Default: every scanned `.css` file.
   */
  tokenFiles?: string[];
  /** Token prefixes never reported as undefined. Default `--tw-`, `--radix-`. */
  ignoreTokenPrefixes?: string[];
  /** Extra raw-tag → component mappings (`{ "img": "Avatar" }`), or `false` to stop checking a tag. */
  rawTags?: Record<string, string | false>;
  /** Extra import specifiers to forbid: regular expression → message. Added to the defaults. */
  forbiddenImports?: Record<string, string>;
  /** Folders that must not exist (local design-system primitives). Default `["src/components/ui"]`. */
  localPrimitiveDirs?: string[];
  /** Per-rule level overrides, e.g. `{ "raw-color": "warn", "palette-color": "off" }`. `info` never fails a run. */
  rules?: Record<string, RuleSetting>;
  /** Justified exceptions. */
  allow?: AllowEntry[];
  /** Declarative app rules. */
  patterns?: PatternRule[];
  /** A markdown file of pattern rules (`### rule-id` blocks of `- key: value` lines). */
  rulesDoc?: string;
  /** Rule modules, resolved relative to the config file. */
  plugins?: PluginSpec[];
  /**
   * The web app's file-based routes folder, read by the structure rules
   * (`hand-rolled-sub-nav`, `resource-workspace`, `page-layout`). Default: the
   * first of `src/routes`, `src/app`, `app`, `src/pages`, `pages` that exists.
   */
  routesDir?: string;
  /**
   * Genesis packages besides `uiPackage` whose exported components an app
   * should reuse, not copy (`local-genesis-copy`). Default
   * `["@marktiderman/genesis-forms-studio"]`; packages not installed are skipped.
   */
  componentPackages?: string[];
  /** Commands `--build` runs, in order. Default: the app's `typecheck` then `build` scripts. */
  build?: string[];
}

/** Facts read from the installed Genesis packages. Nothing here is hardcoded. */
export interface GenesisFacts {
  uiPackage: string;
  uiVersion: string;
  /** Every name exported from the component package (all subpaths). */
  exports: ReadonlySet<string>;
  /** Exported values (not types): what an app could shadow. */
  values: ReadonlySet<string>;
  /** Exported components, sorted. */
  components: readonly string[];
  /** Custom properties the theme stylesheets define. */
  tokens: ReadonlySet<string>;
  /** Raw HTML tag → the Genesis component that replaces it. */
  rawTags: ReadonlyMap<string, string>;
  /** Tailwind palette color names (red, slate, …). */
  palette: readonly string[];
  /** The installed `componentPackages` (forms-studio by default) and the components each exports. */
  companions: ReadonlyArray<CompanionPackage>;
}

/** A Genesis component package read alongside the main one. */
export interface CompanionPackage {
  package: string;
  version: string;
  /** Exported components, sorted. */
  components: readonly string[];
}

/** One scanned file. */
export interface SourceFile {
  /** Path relative to the app root, POSIX separators. */
  path: string;
  absolutePath: string;
  /** Extension including the dot, e.g. `.tsx`. */
  ext: string;
  /** Raw contents. */
  text: string;
  /** Contents with comments blanked out (line numbers preserved). */
  code: string;
}

/** What a plugin's `check` receives. */
export interface DoctorContext {
  root: string;
  files: readonly SourceFile[];
  genesis: GenesisFacts;
  config: DoctorConfig;
  /** The git ref change checks compare against (`--base`), when given. */
  base?: string;
  /** Record a finding. Config `rules` levels and `allow` entries apply afterwards. */
  report(finding: FindingInput): void;
}

/** A rule module. Default-export one, an array, or a factory that takes the config options. */
export interface DoctorPlugin {
  name: string;
  check(context: DoctorContext): void | Promise<void>;
}

export interface DoctorResult {
  ok: boolean;
  root: string;
  genesis: GenesisFacts;
  findings: Finding[];
  /** Genesis components no scanned file imports. */
  unused: string[];
  /** Pattern rules plus plugins that ran. */
  ruleCount: number;
  errors: number;
  warnings: number;
  /** Findings at `info`: shown, never failing. */
  infos: number;
}
