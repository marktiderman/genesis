/**
 * `genesis doctor --build`: run the app's typecheck and build after the checks.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { DoctorConfig, FindingInput } from "./types.js";

/** Set for build children, so a build that itself runs `genesis doctor --build` doesn't recurse. */
export const BUILD_GUARD_ENV = "GENESIS_DOCTOR_BUILDING";

/** The commands `--build` runs: config `build`, else the app's `typecheck` and `build` scripts. */
export function buildCommands(root: string, config: DoctorConfig): string[] {
  if (config.build) return config.build;
  const pkgFile = path.join(root, "package.json");
  const scripts: Record<string, string> = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")).scripts ?? {} : {};
  const pm = packageManager(root);
  return ["typecheck", "build"].filter((s) => scripts[s]).map((s) => `${pm} run ${s}`);
}

export function packageManager(root: string): string {
  let dir = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(dir, "bun.lock")) || existsSync(path.join(dir, "bun.lockb"))) return "bun";
    if (existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(dir, "package-lock.json"))) return "npm";
    const parent = path.dirname(dir);
    if (parent === dir) return "npm";
    dir = parent;
  }
}

/** Run each command in order; stop at the first failure and return it as a finding. */
export function runBuild(root: string, commands: string[], quiet: boolean): FindingInput | null {
  if (process.env[BUILD_GUARD_ENV]) return null;
  if (commands.length === 0) {
    return { rule: "build", level: "warn", file: "package.json", message: "--build found nothing to run: add typecheck/build scripts or doctor.build" };
  }
  for (const command of commands) {
    // Commands come from the app's own config or package.json, so a shell is fine.
    const r = spawnSync(command, {
      cwd: root,
      shell: true,
      stdio: quiet ? "pipe" : "inherit",
      env: { ...process.env, [BUILD_GUARD_ENV]: "1" },
    });
    if (r.status !== 0) {
      const tail = quiet ? `\n${String(r.stderr ?? "").trim().split("\n").slice(-20).join("\n")}` : "";
      return { rule: "build", file: command, message: `\`${command}\` failed (exit ${r.status ?? r.signal})${tail}` };
    }
  }
  return null;
}
