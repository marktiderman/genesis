import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { DENY_RULES, SUBAGENT_HOOK_COMMAND, mergeAgentHooks, subagentContext, subagentHookOutput, writeAgentHooks } from "../src/doctor/agent-hooks.js";

const app = () => mkdtempSync(path.join(tmpdir(), "genesis-agent-hooks-"));

describe("agent hooks", () => {
  it("gives Explore and Plan subagents the Genesis rules and the installed package guides", () => {
    const root = app();
    const dir = path.join(root, "node_modules/@marktiderman/genesis-widgets");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "---\nname: genesis-widgets\ndescription: Widgets. Load before building any widget screen.\n---\n");
    const pkg = { name: "@marktiderman/genesis-widgets", version: "1.0.0", dir, namespace: "widgets", local: false, private: false, declaration: null };
    const text = subagentContext(root, [pkg]);
    expect(text).toContain("This is a Genesis app.");
    expect(text).toContain("Never copy an older screen");
    expect(text).toContain("- node_modules/@marktiderman/genesis-widgets/SKILL.md: Load before building any widget screen.");
    expect(JSON.parse(subagentHookOutput(root, [pkg]))).toEqual({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: text } });
  });

  it("adds the hook and deny rules, keeps the app's own settings, and is idempotent", () => {
    const root = app();
    mkdirSync(path.join(root, ".claude"));
    const own = {
      hooks: { SubagentStart: [{ matcher: "reviewer", hooks: [{ type: "command", command: "echo ours" }] }], Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }] },
      permissions: { deny: ["Read(./secrets/**)"], allow: ["Bash(pnpm test)"] },
      enabledPlugins: { "genesis@genesis": true },
    };
    writeFileSync(path.join(root, ".claude/settings.json"), JSON.stringify(own));
    expect(writeAgentHooks(root)).toEqual([".claude/settings.json"]);
    const after = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
    expect(after.enabledPlugins).toEqual(own.enabledPlugins);
    expect(after.hooks.Stop).toEqual(own.hooks.Stop);
    expect(after.hooks.SubagentStart).toEqual([
      own.hooks.SubagentStart[0],
      { matcher: "Explore|Plan", hooks: [{ type: "command", command: SUBAGENT_HOOK_COMMAND }] },
    ]);
    expect(after.permissions).toEqual({ deny: ["Read(./secrets/**)", ...DENY_RULES], allow: ["Bash(pnpm test)"] });
    expect(writeAgentHooks(root)).toEqual([]);
  });

  it("replaces its own hook rather than adding a second one", () => {
    const once = mergeAgentHooks({});
    expect(mergeAgentHooks(once)).toEqual(once);
  });

  it("refuses settings that aren't JSON instead of overwriting them", () => {
    const root = app();
    mkdirSync(path.join(root, ".claude"));
    writeFileSync(path.join(root, ".claude/settings.json"), "{ not json");
    expect(() => writeAgentHooks(root)).toThrow(/isn't valid JSON/);
    expect(readFileSync(path.join(root, ".claude/settings.json"), "utf8")).toBe("{ not json");
  });
});

describe("agent hooks: settings shapes", () => {
  it("keeps an app hook that shares an entry with Genesis's own", () => {
    const merged = mergeAgentHooks({
      hooks: { SubagentStart: [{ matcher: "Explore|Plan", hooks: [{ type: "command", command: "echo ours" }, { type: "command", command: SUBAGENT_HOOK_COMMAND }] }] },
    });
    expect(merged.hooks!.SubagentStart).toEqual([
      { matcher: "Explore|Plan", hooks: [{ type: "command", command: "echo ours" }] },
      { matcher: "Explore|Plan", hooks: [{ type: "command", command: SUBAGENT_HOOK_COMMAND }] },
    ]);
  });

  it("refuses null, a list, or a malformed hooks or deny value, and leaves the file as it was", () => {
    for (const bad of ["null", "[]", '{"hooks":{"SubagentStart":[{}]}}', '{"permissions":{"deny":"Read(./.env)"}}']) {
      const root = app();
      mkdirSync(path.join(root, ".claude"));
      writeFileSync(path.join(root, ".claude/settings.json"), bad);
      expect(() => writeAgentHooks(root)).toThrow(/fix it by hand/);
      expect(readFileSync(path.join(root, ".claude/settings.json"), "utf8")).toBe(bad);
    }
  });
});

describe("genesis agents --hook (the CLI)", () => {
  const cli = path.join(path.dirname(new URL(import.meta.url).pathname), "../dist/cli.js");
  const run = (args: string[], cwd: string) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  it.skipIf(!existsSync(cli))("prints the SubagentStart output and exits 0", () => {
    const root = app();
    const r = run(["agents", "--hook", "subagent-start", "--dir", root], root);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.hookEventName).toBe("SubagentStart");
  });
  it("points the hook at the project folder, so a session started in a subfolder still gets the guides", () => {
    expect(SUBAGENT_HOOK_COMMAND).toContain('--dir "$CLAUDE_PROJECT_DIR"');
  });
  it.skipIf(!existsSync(cli))("--check names what's wrong, passes a CLAUDE.md the app keeps without the import, and says to rename a misnamed one", () => {
    const root = app();
    expect(run(["agents", "--dir", root], root).status).toBe(0);
    expect(run(["agents", "--check", "--dir", root], root).status).toBe(0);
    rmSync(path.join(root, "CLAUDE.md"));
    let r = run(["agents", "--check", "--dir", root], root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("CLAUDE.md missing");
    expect(r.stderr).toContain("Run `genesis agents`");
    writeFileSync(path.join(root, "CLAUDE.md"), "# Ours\n");
    expect(run(["agents", "--check", "--dir", root], root).status).toBe(0);
    rmSync(path.join(root, "CLAUDE.md"));
    symlinkSync("nowhere.md", path.join(root, "CLAUDE.md"));
    r = run(["agents", "--check", "--dir", root], root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("CLAUDE.md misnamed");
    expect(r.stderr).toContain("rename it to CLAUDE.md");
  });
  it.skipIf(!existsSync(cli))("prints nothing and exits 0 for a hook it doesn't know, so a session never breaks", () => {
    const root = app();
    const r = run(["agents", "--hook", "no-such-hook", "--dir", root], root);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
