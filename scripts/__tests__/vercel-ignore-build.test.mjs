// @feat:ci-templates
// templates/vercel/ignore-build.sh, run as Vercel runs it: exit 0 skips the build, exit 1 builds.
// `curl` is a stub on PATH that records its arguments and answers with a canned body, so the label
// check never reaches GitHub.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../templates/vercel/ignore-build.sh");
const dir = mkdtempSync(path.join(tmpdir(), "genesis-ignore-build-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const bin = path.join(dir, "bin");
const log = path.join(dir, "curl.log");
const bodyFile = path.join(dir, "body.json");
mkdirSync(bin);
writeFileSync(
  path.join(bin, "curl"),
  `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${log}"\n[ "\${STUB_CURL_FAIL:-}" = 1 ] && exit 22\ncat "${bodyFile}"\n`,
);
chmodSync(path.join(bin, "curl"), 0o755);

const nodeDir = path.dirname(process.execPath);
const BASE_PATH = `${bin}:${nodeDir}:/usr/bin:/bin`;

/** A preview deployment of a feature branch on GitHub, no opt-in. */
const PREVIEW = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "acme",
  VERCEL_GIT_REPO_SLUG: "web",
  VERCEL_GIT_COMMIT_REF: "feat/thing",
  VERCEL_GIT_COMMIT_MESSAGE: "Add a thing",
  VERCEL_GIT_PULL_REQUEST_ID: "",
};

/** Run the script with `env` (and `body` as GitHub's answer); returns build/skip, the reason and curl's arguments. */
function run(env, { body = "{}", path: PATH = BASE_PATH } = {}) {
  writeFileSync(bodyFile, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  writeFileSync(log, "");
  const r = spawnSync("bash", [SCRIPT], { env: { PATH, HOME: dir, ...env }, encoding: "utf8" });
  return {
    decision: r.status === 1 ? "build" : r.status === 0 ? "skip" : `exit ${r.status}`,
    out: r.stdout + r.stderr,
    curl: readFileSync(log, "utf8").split("\n").filter(Boolean),
  };
}

const TOKEN = { GENESIS_PREVIEW_GITHUB_TOKEN: "t0ken" };
const labelled = (...names) => ({ number: 7, labels: names.map((name) => ({ name, color: "fff" })), head: { repo: { name: "preview" } } });

describe("templates/vercel/ignore-build.sh", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", SCRIPT]).status).toBe(0);
  });

  describe("production", () => {
    it("always builds, whatever GENESIS_PREVIEWS says", () => {
      for (const previews of ["on-demand", "off", "every-pr", "nonsense"]) {
        const r = run({ ...PREVIEW, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", GENESIS_PREVIEWS: previews });
        expect(r.decision, previews).toBe("build");
        expect(r.out).toContain("production");
      }
    });
  });

  describe("GENESIS_PREVIEWS", () => {
    it("off skips even an opted-in preview", () => {
      const r = run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "preview/x", VERCEL_GIT_COMMIT_MESSAGE: "x [preview]", GENESIS_PREVIEWS: "off" });
      expect(r.decision).toBe("skip");
      expect(r.out).toContain("GENESIS_PREVIEWS=off");
    });

    it("every-pr builds every preview", () => {
      expect(run({ ...PREVIEW, GENESIS_PREVIEWS: "every-pr" }).decision).toBe("build");
    });

    it("defaults to on-demand: no opt-in skips without calling GitHub", () => {
      const r = run(PREVIEW);
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("an unknown value falls back to on-demand and says so", () => {
      const r = run({ ...PREVIEW, GENESIS_PREVIEWS: "sometimes" });
      expect(r.decision).toBe("skip");
      expect(r.out).toContain('unknown GENESIS_PREVIEWS="sometimes"');
      expect(run({ ...PREVIEW, GENESIS_PREVIEWS: "sometimes", VERCEL_GIT_COMMIT_REF: "preview/a" }).decision).toBe("build");
    });
  });

  describe("branch prefix", () => {
    it("builds a preview/ branch", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "preview/new-onboarding" }).decision).toBe("build");
    });

    it("doesn't match the prefix elsewhere in the name", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "feat/preview/x" }).decision).toBe("skip");
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "previewx" }).decision).toBe("skip");
    });

    it("GENESIS_PREVIEW_BRANCH_PREFIX overrides it, and empty turns it off", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "demo/x", GENESIS_PREVIEW_BRANCH_PREFIX: "demo/" }).decision).toBe("build");
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "preview/x", GENESIS_PREVIEW_BRANCH_PREFIX: "demo/" }).decision).toBe("skip");
      // An empty prefix turns the branch check off rather than matching every branch.
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "feat/x", GENESIS_PREVIEW_BRANCH_PREFIX: "" }).decision).toBe("skip");
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "preview/x", GENESIS_PREVIEW_BRANCH_PREFIX: "" }).decision).toBe("skip");
    });

    it("a glob character in the prefix is literal", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "feat/x", GENESIS_PREVIEW_BRANCH_PREFIX: "*" }).decision).toBe("skip");
    });
  });

  describe("commit message", () => {
    it("builds with [preview] anywhere in it, any case", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_MESSAGE: "Try the new list [preview]" }).decision).toBe("build");
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_MESSAGE: "[Preview] try\n\nbody" }).decision).toBe("build");
    });

    it("needs the brackets", () => {
      expect(run({ ...PREVIEW, VERCEL_GIT_COMMIT_MESSAGE: "preview the list" }).decision).toBe("skip");
    });
  });

  describe("pull request label", () => {
    it("without a token, skips without calling GitHub", () => {
      const r = run({ ...PREVIEW, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: labelled("preview") });
      expect(r.decision).toBe("skip");
      expect(r.out).toContain("no GENESIS_PREVIEW_GITHUB_TOKEN");
      expect(r.curl).toEqual([]);
    });

    it("with the label on the pull request, builds", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: labelled("bug", "preview") });
      expect(r.decision).toBe("build");
      expect(r.curl).toContain("https://api.github.com/repos/acme/web/pulls/7");
      expect(r.curl).toContain("Authorization: Bearer t0ken");
    });

    it("matches the label in any case (the EAS template's label is Preview)", () => {
      expect(run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: labelled("Preview") }).decision).toBe("build");
    });

    it("without the label, skips; a repository or user named like the label doesn't count", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: labelled("previews", "bug") });
      expect(r.decision).toBe("skip");
    });

    it("GENESIS_PREVIEW_LABEL overrides the label", () => {
      const env = { ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", GENESIS_PREVIEW_LABEL: "needs: preview" };
      expect(run(env, { body: labelled("needs: preview") }).decision).toBe("build");
      expect(run(env, { body: labelled("preview") }).decision).toBe("skip");
    });

    it("an empty GENESIS_PREVIEW_LABEL turns the label check off", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", GENESIS_PREVIEW_LABEL: "" }, { body: labelled("") });
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("before the pull request has a number, reads the open pull request for the branch", () => {
      const r = run({ ...PREVIEW, ...TOKEN }, { body: [labelled("preview")] });
      expect(r.decision).toBe("build");
      expect(r.curl).toContain("https://api.github.com/repos/acme/web/pulls");
      expect(r.curl).toContain("head=acme:feat/thing");
      expect(r.curl).toContain("state=open");
    });

    it("no open pull request for the branch skips", () => {
      expect(run({ ...PREVIEW, ...TOKEN }, { body: [] }).decision).toBe("skip");
    });

    it("a failed request skips (fails closed)", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", STUB_CURL_FAIL: "1" }, { body: labelled("preview") });
      expect(r.decision).toBe("skip");
      expect(r.out).toContain("couldn't read pull request #7");
    });

    it("an answer that isn't JSON skips", () => {
      expect(run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: "<html>rate limited</html>" }).decision).toBe("skip");
    });

    it("a pull request id that isn't a number skips without calling GitHub", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7/../../x" });
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("a repository that isn't on GitHub skips", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", VERCEL_GIT_PROVIDER: "gitlab" }, { body: labelled("preview") });
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("without the repository's owner or name skips", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", VERCEL_GIT_REPO_OWNER: "" }, { body: labelled("preview") });
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("without a branch or a pull request number skips", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_COMMIT_REF: "" }, { body: [labelled("preview")] });
      expect(r.decision).toBe("skip");
      expect(r.curl).toEqual([]);
    });

    it("without node to read the answer skips", () => {
      // PATH without Node's folder: only the curl stub and the system tools.
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7" }, { body: labelled("preview"), path: `${bin}:/usr/bin:/bin` });
      if (spawnSync("bash", ["-c", "command -v node"], { env: { PATH: `${bin}:/usr/bin:/bin` } }).status === 0) return; // node is a system tool here
      expect(r.decision).toBe("skip");
      expect(r.out).toContain("no node");
    });

    it("GENESIS_GITHUB_API_URL points the check at another API (GitHub Enterprise)", () => {
      const r = run({ ...PREVIEW, ...TOKEN, VERCEL_GIT_PULL_REQUEST_ID: "7", GENESIS_GITHUB_API_URL: "https://ghe.example/api/v3" }, { body: labelled("preview") });
      expect(r.decision).toBe("build");
      expect(r.curl).toContain("https://ghe.example/api/v3/repos/acme/web/pulls/7");
    });
  });
});
