/**
 * The files an app owns but Genesis ships: the starter (`apps/genesis-rn-starter`)
 * and the templates (`templates/eas`, `expo`, `maestro`, `ci`, `vercel`).
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
 * Where a template goes in an app. A template that says where (a `# Copy to <path>` line in its
 * opening comment, `# Copy to .github/workflows/ci.yml.`) goes there; otherwise eas/eas.json is
 * eas.json, vercel/vercel.json is vercel.json, expo/* goes to the app's root, eas/* under .eas/,
 * maestro/* under .maestro/ and ci/* under .github/workflows/.
 */
export function templateTarget(template: string, content: string): string {
  // The opening comment: the leading lines that are comments (a shebang first is fine).
  const opening: string[] = [];
  for (const line of content.split("\n").slice(0, 20)) {
    if (!/^#/.test(line)) break;
    opening.push(line);
  }
  const said = opening.map((line) => /^#\s*Copy to (\S+?)\.?(?:\s|$)/.exec(line)?.[1]).find(Boolean);
  if (said && /^[.A-Za-z0-9][\w./-]*$/.test(said) && !said.split("/").some((s) => s === ".." || s === "." || s.toLowerCase() === ".git")) return said;
  if (template === "eas/eas.json") return "eas.json";
  if (template === "vercel/vercel.json") return "vercel.json";
  const [dir, ...rest] = template.split("/");
  const tail = rest.join("/");
  if (dir === "expo") return tail;
  if (dir === "eas") return `.eas/${tail}`;
  if (dir === "maestro") return `.maestro/${tail}`;
  if (dir === "ci") return `.github/workflows/${tail}`;
  return template;
}
