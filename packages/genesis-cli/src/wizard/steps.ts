/**
 * The guided setup steps an app has: every `setup` id the installed packages' settings declare
 * (`githubRepo: { …, setup: "github.issues" }`), with the keys each configures, the secrets they
 * need (by name) and whether the step is done. `genesis setup --step <id>` opens the wizard on one;
 * the `setup_steps` MCP tool lists them.
 *
 * A step is done when every key it configures has a value (not the `null` "not set" default).
 * The runners that walk an outside service and verify it (GitHub, Supabase, Sentry…) come with the
 * step framework; until then a step is set by its keys and secrets, here or with `genesis fix`.
 */
import { resolveSettings, type SecretStore, type SettingsCatalogue } from "@marktiderman/genesis-config/settings";
import { fileLayers, loadCatalogue } from "../mcp/settings.js";

export interface SetupStepKey {
  key: string;
  summary?: string;
  /** The key has a value (it isn't the "not set" default). */
  set: boolean;
}

export interface SetupStepSummary {
  /** `github.issues`. */
  id: string;
  /** The packages whose keys name it. */
  packages: string[];
  keys: SetupStepKey[];
  /** The secrets its keys need, by name and store. Never a value. */
  secrets: Array<{ name: string; store: SecretStore }>;
  done: boolean;
  /** How to open it. */
  command: string;
}

/** The setup steps in this catalogue, given the resolved values. Sorted by id. */
export function setupStepsOf(catalogue: SettingsCatalogue, values: { readonly [key: string]: unknown }, owners: ReadonlyMap<string, string> = new Map()): SetupStepSummary[] {
  const byId = new Map<string, SetupStepSummary>();
  for (const def of Object.values(catalogue.keys)) {
    if (!def.setup) continue;
    const step = byId.get(def.setup) ?? { id: def.setup, packages: [], keys: [], secrets: [], done: true, command: `genesis setup --step ${def.setup}` };
    const set = values[def.key] !== null && values[def.key] !== undefined;
    step.keys.push({ key: def.key, ...(def.summary ? { summary: def.summary } : {}), set });
    if (!set) step.done = false;
    if (def.secret && !step.secrets.some((s) => s.name === def.secret!.name && s.store === def.secret!.store)) step.secrets.push({ name: def.secret.name, store: def.secret.store });
    const owner = owners.get(def.namespace);
    if (owner && !step.packages.includes(owner)) step.packages.push(owner);
    byId.set(def.setup, step);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The app's setup steps, from its installed packages and genesis.config.json. */
export function setupSteps(root: string): SetupStepSummary[] {
  const { catalogue, declared } = loadCatalogue(root);
  const resolved = resolveSettings(catalogue, fileLayers(root));
  const owners = new Map(declared.map((d) => [d.declaration.namespace, d.package]));
  return setupStepsOf(catalogue, resolved.values, owners);
}
