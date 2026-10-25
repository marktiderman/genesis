/**
 * The files an app owns but Genesis ships: the starter (`apps/genesis-rn-starter`)
 * and the templates (`templates/eas`, `templates/maestro`, `templates/ci`).
 * The CLI's build copies both into `dist/`, so a published CLI carries the
 * versions it was released with; in a Genesis checkout they're read live.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { cliPackageDir, workspacePackagesDir } from "./discover.js";

export { STARTER_EXCLUDE, walk } from "./walk.js";

export function starterDir(): string {
  const workspace = workspacePackagesDir();
  const live = workspace && path.join(workspace, "..", "apps", "genesis-rn-starter");
  if (live && existsSync(path.join(live, "package.json"))) return live;
  const packaged = path.join(cliPackageDir(), "dist", "starter");
  if (existsSync(path.join(packaged, "package.json"))) return packaged;
  throw new Error("This genesis-cli has no starter (dist/starter is missing): reinstall @marktiderman/genesis-cli.");
}

export function templatesDir(cliDir = cliPackageDir()): string {
  const workspace = workspacePackagesDir();
  const live = workspace && cliDir === cliPackageDir() ? path.join(workspace, "..", "templates") : null;
  if (live && existsSync(path.join(live, "eas"))) return live;
  const packaged = path.join(cliDir, "dist", "templates");
  if (existsSync(packaged)) return packaged;
  throw new Error(`${cliDir} has no templates (dist/templates is missing).`);
}

/**
 * Where a template goes in an app. A template that says where (its first line,
 * `# Copy to .github/workflows/ci.yml.`) goes there; otherwise eas/eas.json is
 * eas.json, eas/* goes under .eas/, maestro/* under .maestro/ and ci/* under
 * .github/workflows/.
 */
export function templateTarget(template: string, content: string): string {
  const said = /^#\s*Copy to (\S+?)\.?(?:\s|$)/.exec(content)?.[1];
  if (said && /^[.A-Za-z0-9][\w./-]*$/.test(said) && !said.split("/").some((s) => s === ".." || s === "." || s.toLowerCase() === ".git")) return said;
  if (template === "eas/eas.json") return "eas.json";
  const [dir, ...rest] = template.split("/");
  const tail = rest.join("/");
  if (dir === "eas") return `.eas/${tail}`;
  if (dir === "maestro") return `.maestro/${tail}`;
  if (dir === "ci") return `.github/workflows/${tail}`;
  return template;
}
