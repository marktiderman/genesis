/**
 * Agent hooks that `genesis agents --hooks` writes into an app's `.claude/settings.json`.
 *
 * - A `SubagentStart` hook for Claude Code's Explore and Plan subagents, which start without the
 *   app's CLAUDE.md and AGENTS.md: it gives them the same Genesis rules and package guides the
 *   main agent reads (`genesis agents --hook subagent-start` prints them as hook output).
 * - `permissions.deny` rules for secret files, which apply in cloud sessions too, with no install.
 *
 * Everything else in the settings file is the app's own and is left as it is.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { DeclaringPackage } from "./package-rules.js";
import { agentRules, packageGuides } from "./primitives.js";

export const SETTINGS_PATH = ".claude/settings.json";

/** The command the hook runs. It fails open: with no install, the subagent simply starts without the rules. */
export const SUBAGENT_HOOK_COMMAND = '"$CLAUDE_PROJECT_DIR"/node_modules/.bin/genesis agents --hook subagent-start 2>/dev/null || true';

/** The subagents that start without CLAUDE.md, so they need the rules handed to them. */
export const SUBAGENT_MATCHER = "Explore|Plan";

/** Secret files no agent should read: the deny rules apply everywhere, cloud sessions included. */
export const DENY_RULES = ["Read(./.env)", "Read(./.env.*)"];

/** The text a subagent receives: the rules, then where each installed package's guide is. */
export function subagentContext(root: string, packages: readonly DeclaringPackage[]): string {
  const guides = packageGuides(root, packages);
  return [
    "This is a Genesis app. Follow these rules (the app's AGENTS.md has the full guide):",
    ...agentRules().map((r) => `- ${r}`),
    ...(guides.length ? ["", "Package guides (they match the installed versions):", ...guides.map((g) => `- ${g.path}: ${g.when}`)] : []),
  ].join("\n");
}

/** `genesis agents --hook subagent-start`: the hook's JSON output. */
export function subagentHookOutput(root: string, packages: readonly DeclaringPackage[]): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: subagentContext(root, packages) } });
}

type Settings = {
  hooks?: Record<string, { matcher?: string; hooks: { type: string; command?: string }[] }[]>;
  permissions?: { deny?: string[]; [k: string]: unknown };
  [k: string]: unknown;
};

const ownsEntry = (e: { hooks: { command?: string }[] }) => e.hooks.some((h) => h.command?.includes("genesis agents --hook"));

/** The settings with Genesis's hook and deny rules in place; nothing of the app's own is removed. */
export function mergeAgentHooks(settings: Settings): Settings {
  const out: Settings = structuredClone(settings);
  const hooks = (out.hooks ??= {});
  const entry = { matcher: SUBAGENT_MATCHER, hooks: [{ type: "command", command: SUBAGENT_HOOK_COMMAND }] };
  const others = (hooks["SubagentStart"] ?? []).filter((e) => !ownsEntry(e));
  hooks["SubagentStart"] = [...others, entry];
  const permissions = (out.permissions ??= {});
  const deny = permissions.deny ?? [];
  permissions.deny = [...deny, ...DENY_RULES.filter((r) => !deny.includes(r))];
  return out;
}

/** `genesis agents --hooks`: write the hook and deny rules into `.claude/settings.json`. Returns the files it changed. */
export function writeAgentHooks(root: string): string[] {
  const file = path.join(root, SETTINGS_PATH);
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;
  let current: Settings = {};
  if (before !== null) {
    try {
      current = JSON.parse(before) as Settings;
    } catch {
      throw new Error(`${SETTINGS_PATH} isn't valid JSON; fix it by hand, then run genesis agents --hooks again.`);
    }
  }
  const after = `${JSON.stringify(mergeAgentHooks(current), null, 2)}\n`;
  if (before !== null && JSON.stringify(JSON.parse(before)) === JSON.stringify(JSON.parse(after))) return [];
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, after);
  return [SETTINGS_PATH];
}
