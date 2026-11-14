/**
 * Public types for `genesis doctor` and its rule plugins.
 */
import type { OverlayMarker } from "@marktiderman/genesis-features";

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
  /**
   * Every rule that reported this finding, when more than one did (an app rule and a package rule
   * on the same element of the same line): reported once, with `rule` the first of them.
   */
  rules?: string[];
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

/**
 * A declared extension (`doctor.extend`): a file that builds on one of a package rule's declared
 * extension points (`extensible`) in a way the rule doesn't recognize, and says why. Unlike
 * `allow`, it is not debt: it never expires, and `allow-grew` doesn't count it; a new one is a
 * warning (`extension-added`) for the pull request's review. It covers the findings the file had
 * when it was declared: under `--base`, a count above the merge base's still fails. The doctor
 * checks that `file` still has a finding of `rule` (`stale-extension`), and that `buildsOn` is one
 * of the rule's points, imported from a Genesis package, and flagged by nothing (`extension-invalid`).
 */
export interface ExtensionEntry {
  /** The rule whose findings in `file` it covers. */
  rule: string;
  /** One app-relative file (no globs: each file is reviewed on its own). */
  file: string;
  /** The rule's extension point the file builds on: one of the rule's `extensible` entries (`useBoardColumns`, `ResourceView.slots`). */
  buildsOn: string;
  /** Why the rule's primitive doesn't fit here: a sentence a reviewer can check. */
  reason: string;
  /** Where the gap is written up for Genesis, when it is one (an issue or proposal link). */
  upstream?: string;
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
  /** Under `--base`, findings drop to `info` unless they are in a new file or their count in a file grew since the merge base. */
  newOnly?: boolean;
}

/**
 * An app's setting for one package rule (`doctor.packageRules["ui/lists-use-resource-view"]`).
 * `reason` is required: a package rule is never changed silently.
 */
export interface PackageRuleSetting {
  level?: RuleSetting;
  /** Replace the rule's own file globs (`{routes}` is the routes folder). */
  files?: string[];
  /** Replace the rule's own exclusions. */
  exclude?: string[];
  reason: string;
}

/** `doctor.contracts`: the generated contract the supabase pack keeps current (as `genesis introspect --check`). */
export interface ContractsConfig {
  /** The contract file, app-relative. Default `resources.genesis.ts`. */
  out?: string;
  /** Schemas to read. Default `["public"]`. */
  schemas?: string[];
  /** The environment variable holding the Postgres URL. Default `DATABASE_URL`. Without it the check is skipped (info). */
  databaseEnv?: string;
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
  /**
   * Whether Supabase's automatic branching (a branch per pull request) is on for this project.
   * `false` records that it's off, so `exposed-schema-created-later` stops flagging a schema
   * that a migration creates. Default: unknown, treated as on.
   */
  automaticBranching?: boolean;
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
  /**
   * Settings for package rules (the rules Genesis packages declare, ids like `ui/lists-use-resource-view`):
   * level, files and exclusions, each with a reason.
   */
  packageRules?: Record<string, PackageRuleSetting>;
  /**
   * With `--base`, a rule's findings drop to `info` unless they are in a new file or a file
   * now has more of them than at the merge base, so new code meets the rule and old code is
   * ratcheted. `true` for every rule, or a list of rule ids.
   * Rules declared `newOnly` (package rules, app patterns) ratchet without this.
   */
  ratchet?: boolean | string[];
  /** The generated contract the supabase pack checks is current. */
  contracts?: ContractsConfig;
  /** Per-rule level overrides, e.g. `{ "raw-color": "warn", "palette-color": "off" }`. `info` never fails a run. */
  rules?: Record<string, RuleSetting>;
  /** Justified exceptions: debt, which only shrinks under `--base`. */
  allow?: AllowEntry[];
  /** Declared extensions: files that build on Genesis in a way a rule doesn't recognize, reviewed, never expiring. */
  extend?: ExtensionEntry[];
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
  /**
   * The colour roles among them: tokens whose value is a colour (`--primary: 243 75% 59%`,
   * `--color-primary: hsl(var(--primary))`). Absent when not read.
   */
  colorTokens?: ReadonlySet<string>;
  /** The part names genesis-ui renders (`THEME_PARTS`), from the installed design system. Absent when not found. */
  themeParts?: readonly string[];
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
  /** The run treats warnings as failures (`--strict`). */
  strict?: boolean;
  /** The Genesis and local packages whose declared rules run, with their declarations. */
  packages: readonly DeclaringPackage[];
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
  /** Rules the installed packages declare, and how many packages declare them. */
  primitives: { rules: number; packages: number };
  errors: number;
  warnings: number;
  /** Findings at `info`: shown, never failing. */
  infos: number;
  /** Under `--base`: the declared extensions this branch adds, for the pull request's review (also `extension-added` findings). */
  extensionsAdded?: ExtensionEntry[];
}

/* Package rules (package-rules.ts): what a Genesis package declares in package.json `genesis.doctor`. */

/** One "use X instead of Y" rule, as a package declares it. */
export interface PreferRule {
  /** Local id; the doctor namespaces it by package (`ui/<id>`). Lower-case words and dashes. */
  id: string;
  /** The need it answers, for the primitives catalog ("a list screen"). */
  need?: string;
  /** Default `warn`. */
  level?: Level;
  /** Web apps only, native (Expo, the `native` pack) only, or both (default). */
  platform?: "web" | "native";
  /** App-relative globs. `{routes}` stands for the app's routes folder. Default: every scanned script file. */
  files?: string[];
  exclude?: string[];
  /** What the rule flags. At least one. Comments never count. */
  forbid: {
    /** JSX element names (`<DataTable`). */
    jsx?: string[];
    /** Import specifiers: exact, or ending in `*` for a prefix (`@supabase/*`). */
    imports?: string[];
    /** A regular expression (every match is reported). Prefix `(?i)` for case-insensitive. */
    pattern?: string;
  };
  /** A file that matches any of these is left alone (it is the primitive, or builds on it). */
  unless?: {
    /** The file renders one of these elements. */
    renders?: string[];
    /**
     * Not the whole file: a forbidden element nested inside one of these elements, or inside an app
     * component the file imports whose own body renders one, is left alone (a builder's own panels).
     */
    inside?: string[];
    /** The file contains this regular expression. */
    pattern?: string;
  };
  /** What to use instead. */
  use: string;
  /** Where it comes from. */
  import?: string;
  /** A link to the docs. */
  docs?: string;
  /** Why, in a sentence. */
  why: string;
  /** Under `--base`, findings drop to `info` unless they are in a new file or their count in a file grew since the merge base. */
  newOnly?: boolean;
  /**
   * The Genesis exports (or parts of one: `ResourceView.slots`) an app may build on in a way the
   * rule doesn't recognize, and declare as an extension (`doctor.extend`). A rule without them
   * can't be extended.
   */
  extensible?: string[];
}

/** A catalog entry with no rule behind it. */
export interface PrimitiveEntry {
  need: string;
  use: string;
  import?: string;
  docs?: string;
}

/** A package's validated `genesis.doctor` declaration. */
export interface PackageDeclaration {
  enforce: boolean;
  /** Why a package enforces nothing (required when `enforce` is false). */
  reason?: string;
  prefer: PreferRule[];
  primitives: PrimitiveEntry[];
  /** A rule module in the package (absolute path), loaded like an app plugin. */
  plugin?: string;
}

/** A package the doctor read declarations from. */
export interface DeclaringPackage {
  name: string;
  version: string;
  /** Absolute folder (as found, not resolved through links). */
  dir: string;
  /** The prefix of its rule ids (`ui` for genesis-ui). */
  namespace: string;
  local: boolean;
  /** Not published (`private: true`). */
  private: boolean;
  /** Null when the package declares nothing. */
  declaration: PackageDeclaration | null;
  /** Why its declaration was refused, when it was. */
  error?: string;
  /** What was left out of an accepted declaration (unknown keys, rules that don't validate), when anything was. */
  ignored?: string[];
  /** A local package's valid `genesis.overlay` marker: it is the app's copy of the Genesis package of that name. */
  overlay?: OverlayMarker;
}
