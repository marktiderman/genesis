/**
 * The RN starter's feature switches (`starter.config.ts` `features`) and the
 * blocks they turn on. An app made with `genesis init --template native` says
 * which blocks it has there: a block whose switch is off isn't recorded in
 * genesis.lock.json by init, and `genesis upgrade`, `migrate` and the doctor's
 * `lock-files` rule leave it out.
 *
 * Which switch carries which block is the starter's to say, in its
 * genesis.config.json (`starter.blocks`); an app made before that key existed
 * uses the starter this CLI ships. The switches are read as text, never run.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { BlockManifest } from "./manifest.js";
import { starterDir } from "./templates.js";

export const STARTER_CONFIG = "starter.config.ts";
const GENESIS_CONFIG = "genesis.config.json";
const SWITCH = /^[a-zA-Z][a-zA-Z0-9]*$/;
const BLOCK_ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

/** The `features: { … }` object's text in a starter.config.ts, with where it starts. */
function featuresBody(text: string): { start: number; body: string } | null {
  const m = /\bfeatures:\s*\{/.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = text.indexOf("}", start);
  return end < 0 ? null : { start, body: text.slice(start, end) };
}

/** The switches a starter.config.ts sets, by name (comment lines skipped); null when it has no `features`. */
export function parseStarterFeatures(text: string): Record<string, boolean> | null {
  const found = featuresBody(text);
  if (!found) return null;
  const out: Record<string, boolean> = {};
  for (const line of found.body.split("\n")) {
    const m = /^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(true|false)\s*,?\s*(?:\/\/.*)?$/.exec(line);
    if (m) out[m[1]!] = m[2] === "true";
  }
  return out;
}

/** A starter.config.ts with these switches set; every name must already be a switch in it. */
export function setStarterFeatures(text: string, values: Record<string, boolean>): string {
  const found = featuresBody(text);
  if (!found) throw new Error(`${STARTER_CONFIG} has no features block`);
  let body = found.body;
  for (const [name, on] of Object.entries(values)) {
    const re = new RegExp(`^(\\s*${name}\\s*:\\s*)(true|false)`, "m");
    if (!re.test(body)) throw new Error(`${STARTER_CONFIG} has no features.${name}`);
    body = body.replace(re, `$1${on}`);
  }
  return text.slice(0, found.start) + body + text.slice(found.start + found.body.length);
}

/** `starter.blocks` from a genesis.config.json's text: switch → the block ids it carries. Null when it has none. */
export function parseStarterBlocks(json: string, source = GENESIS_CONFIG): Record<string, string[]> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(`${source} is not valid JSON: ${(err as Error).message}`);
  }
  const starter = (raw as { starter?: unknown } | null)?.starter;
  if (starter === undefined) return null;
  const blocks = (starter as { blocks?: unknown } | null)?.blocks;
  if (typeof blocks !== "object" || blocks === null || Array.isArray(blocks)) throw new Error(`${source}: starter.blocks must map each feature switch to a list of block ids`);
  const out: Record<string, string[]> = {};
  for (const [name, ids] of Object.entries(blocks)) {
    if (name === "$comment") continue;
    if (!SWITCH.test(name) || !Array.isArray(ids) || !ids.every((id) => typeof id === "string" && BLOCK_ID.test(id))) {
      throw new Error(`${source}: starter.blocks.${name} must be a list of block ids`);
    }
    out[name] = ids as string[];
  }
  return out;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Switch → blocks: the app's genesis.config.json `starter.blocks`, else the shipped starter's. */
export function starterBlockMap(root?: string): Record<string, string[]> {
  if (root) {
    const file = path.join(root, GENESIS_CONFIG);
    const text = readText(file);
    const own = text === null ? null : parseStarterBlocks(text, file);
    if (own) return own;
  }
  let dir: string;
  try {
    dir = starterDir();
  } catch {
    return {};
  }
  const text = readText(path.join(dir, GENESIS_CONFIG));
  return (text === null ? null : parseStarterBlocks(text)) ?? {};
}

/**
 * Of the app's blocks (`present`: the lock's, or what the starter carries), those switched off:
 * carried by a switch that is `false`, less any that a present block still on requires
 * (support-feedback keeps account). `switches` is a starter.config.ts reading; `manifests` say
 * what requires what.
 */
export function blocksSwitchedOff(
  switches: Record<string, boolean>,
  map: Record<string, string[]>,
  manifests: readonly Pick<BlockManifest, "id" | "requires">[],
  present: Iterable<string>,
): Map<string, string> {
  const ids = new Set(present);
  const off = new Map<string, string>();
  for (const [name, carried] of Object.entries(map)) if (switches[name] === false) for (const id of carried) if (ids.has(id)) off.set(id, name);
  // A present block that's on (switched on, or carried by no switch) keeps what it requires.
  const requires = new Map(manifests.map((m) => [m.id, m.requires]));
  const keep = [...ids].filter((id) => !off.has(id));
  for (let i = 0; i < keep.length; i++) {
    for (const r of requires.get(keep[i]!) ?? []) {
      off.delete(r);
      if (!keep.includes(r)) keep.push(r);
    }
  }
  return off;
}

/**
 * The blocks an app's starter.config.ts switches off, block id → the switch. Empty when the app
 * has no starter.config.ts (it isn't made from the starter) or names no switches.
 */
export function appBlocksSwitchedOff(root: string, manifests: readonly Pick<BlockManifest, "id" | "requires">[], present: Iterable<string>): Map<string, string> {
  const text = readText(path.join(root, STARTER_CONFIG));
  const switches = text === null ? null : parseStarterFeatures(text);
  if (!switches) return new Map();
  return blocksSwitchedOff(switches, starterBlockMap(existsSync(path.join(root, GENESIS_CONFIG)) ? root : undefined), manifests, present);
}

/** How a skipped block is reported. */
export function switchedOffNote(id: string, feature: string): string {
  return `${id}: features.${feature} is off in ${STARTER_CONFIG}, so it's left out (turn it on to have it again)`;
}

/**
 * The block an owned file came from, by its lock source (`<package>:<path>`): an Edge Function
 * file of a block's function, or a block migration's pgTAP test. Null for anything else (the
 * CLI's templates belong to no block).
 */
export function blockOfSource(source: string, manifests: readonly Pick<BlockManifest, "id" | "functions" | "migrations">[]): string | null {
  const at = source.indexOf(":");
  if (at < 1) return null;
  const pkg = source.slice(0, at);
  const rel = source.slice(at + 1);
  for (const m of manifests) {
    if (m.functions.some((fn) => fn.package === pkg && rel.startsWith(`${fn.dir}/`))) return m.id;
    if (m.migrations.some((mig) => mig.package === pkg && mig.test === rel)) return m.id;
  }
  return null;
}
