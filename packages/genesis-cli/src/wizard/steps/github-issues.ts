/**
 * `github.issues`: a fine-grained token scoped to Issues on one repository, kept as the Edge
 * Function secret GITHUB_TOKEN. Checked by reading the repository and its issues with that token.
 * Write access to Issues can't be checked without opening one, so the answer says it wasn't.
 */
import { defineSetupStep } from "./define.js";
import type { SecretVault } from "../../exec/secret-vault.js";
import { needsSecret, OFFLINE, printable, request, secretSetters, type StepContext, type StepRunner } from "./framework.js";

export const githubIssuesStep = defineSetupStep({
  id: "github.issues",
  title: "Open a GitHub issue for each report",
  package: "@marktiderman/genesis-support",
  tools: ["supabase"],
  needs: [{ name: "GITHUB_TOKEN", store: "edge", help: "The fine-grained token from the link above." }],
  fields: [{ name: "repo", label: "Repository (owner/name)", pattern: "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/(?!\\.\\.?$)[A-Za-z0-9._-]{1,100}", placeholder: "your-org/your-repo", setting: "githubRepo" }],
  links: [{ label: "New fine-grained token", url: "https://github.com/settings/personal-access-tokens/new" }],
  instructions: [
    "Open the token page. Resource owner: the repository's owner. Repository access: Only select repositories, then that one repository.",
    "Repository permissions: Issues, Read and write. Nothing else.",
    "Generate it and copy it. The step asks for it when it runs: it goes to the Supabase Edge Function secrets on stdin and is never shown again.",
  ],
});

async function readRepo(ctx: StepContext, secrets: SecretVault): Promise<{ ok: boolean; message: string }> {
  const repo = ctx.fields.repo!;
  const get = (url: string) =>
    secrets.use("GITHUB_TOKEN", (token) => request(ctx, url, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "genesis-cli" } }));
  const res = await get(`https://api.github.com/repos/${repo}`);
  if (res.status === 0) return { ok: false, message: `GitHub couldn't be reached: ${res.error ?? "no answer"}` };
  if (res.status === 401) return { ok: false, message: "GitHub refused the token (401): it's wrong or expired." };
  if (res.status === 404) return { ok: false, message: `The token can't see ${repo} (404): check the name, and that the token's repository access includes it.` };
  if (!res.ok) return { ok: false, message: `GitHub answered ${res.status} for ${repo}.` };
  const body = res.body as { has_issues?: unknown; full_name?: unknown } | null;
  if (body?.has_issues === false) return { ok: false, message: `${repo} has issues turned off (Settings → General → Features → Issues).` };
  const name = typeof body?.full_name === "string" && printable(body.full_name) ? printable(body.full_name) : repo;
  // Reading one issue needs the token's Issues permission (read at least); a token without it gets 403 or 404.
  const issues = await get(`https://api.github.com/repos/${repo}/issues?per_page=1&state=all`);
  if (issues.status === 0) return { ok: false, message: `GitHub couldn't be reached: ${issues.error ?? "no answer"}` };
  if (!issues.ok) return { ok: false, message: `The token reads ${name} but not its issues (${issues.status}): give it Issues, Read and write.` };
  return { ok: true, message: `The token reads ${name} and its issues, which are on. Write access to Issues wasn't checked (that would open an issue): the token needs Issues, Read and write.` };
}

export const githubIssues: StepRunner = {
  step: githubIssuesStep,
  plan(ctx) {
    const { commands, manual } = secretSetters(ctx.root, "GITHUB_TOKEN", "edge");
    return { summary: `keeps the GitHub token for ${ctx.fields.repo} as the Edge Function secret GITHUB_TOKEN`, commands, ...(manual.length ? { manual: manual.join("\n") } : {}) };
  },
  async verify(ctx, secrets) {
    if (!ctx.network) return OFFLINE;
    if (!secrets?.has("GITHUB_TOKEN")) return needsSecret("GITHUB_TOKEN");
    return readRepo(ctx, secrets);
  },
};
