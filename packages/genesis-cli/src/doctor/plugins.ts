/**
 * Loads app rule modules listed in config `plugins`.
 *
 * A module default-exports a plugin, an array of plugins, or a function that
 * takes the options from `["./path.mjs", options]` and returns either.
 */
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { DoctorConfigError } from "./config.js";
import type { DoctorPlugin, PluginSpec } from "./types.js";

/** Identity helper that types a plugin. */
export function defineDoctorPlugin(plugin: DoctorPlugin): DoctorPlugin {
  return plugin;
}

export async function loadPlugins(specs: PluginSpec[] | undefined, configDir: string): Promise<DoctorPlugin[]> {
  const plugins: DoctorPlugin[] = [];
  for (const spec of specs ?? []) {
    const [id, options] = typeof spec === "string" ? [spec, undefined] : spec;
    const file = resolvePlugin(id, configDir);
    // The mtime query re-imports an edited module in a long-lived dev server.
    const url = `${pathToFileURL(file).href}?mtime=${statSync(file).mtimeMs}`;
    let mod: { default?: unknown };
    try {
      mod = await import(url);
    } catch (err) {
      throw new DoctorConfigError(`doctor.plugins: could not load ${id}: ${(err as Error).message}`);
    }
    let value = mod.default;
    if (typeof value === "function") value = await (value as (o: unknown) => unknown)(options);
    const list = Array.isArray(value) ? value : [value];
    for (const p of list) {
      if (!p || typeof p !== "object" || typeof (p as DoctorPlugin).check !== "function" || typeof (p as DoctorPlugin).name !== "string") {
        throw new DoctorConfigError(`doctor.plugins: ${id} must default-export { name, check(context) } (or an array, or a factory returning one)`);
      }
      plugins.push(p as DoctorPlugin);
    }
  }
  return plugins;
}

function resolvePlugin(id: string, configDir: string): string {
  try {
    if (id.startsWith(".") || path.isAbsolute(id)) return resolveFrom(path.resolve(configDir, id), configDir);
    return resolveFrom(id, configDir);
  } catch {
    throw new DoctorConfigError(`doctor.plugins: cannot find ${id} (relative paths resolve from ${configDir})`);
  }
}

function resolveFrom(id: string, from: string): string {
  return createRequire(path.join(from, "noop.js")).resolve(id);
}
