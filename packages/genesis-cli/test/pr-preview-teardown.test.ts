// The teardown's shell, run for real against a stand-in eas-cli (npx) and an instant sleep.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const TEMPLATE = path.resolve(__dirname, "../../../templates/ci/pr-preview-teardown.yml");
const script = (parse(readFileSync(TEMPLATE, "utf8")) as { jobs: { teardown: { steps: { run: string }[] } } }).jobs.teardown.steps[0]!.run;

/**
 * `eas <command>` answers by the scenario: runs = what `workflow:runs` prints (one value, or a list
 * a call at a time), deleteFails / present = the kinds whose delete fails / whose list names pr-7.
 */
function run(scenario: { runs: string[]; deleteFails?: string[]; present?: string[]; badList?: boolean; swapped?: boolean; prState?: string }) {
  const bin = mkdtempSync(path.join(tmpdir(), "teardown-bin-"));
  const state = path.join(bin, "calls");
  writeFileSync(state, "0");
  writeFileSync(
    path.join(bin, "npx"),
    `#!/bin/sh
shift 2 # --yes eas-cli@…
cmd="$1"
case "$cmd" in
  workflow:runs)
    n=$(cat "${state}"); echo $((n + 1)) > "${state}"
    set -- ${scenario.runs.map((r) => `'${r}'`).join(" ")}
    i=$((n % $# + 1)); eval "printf '%s' \\"\\$$i\\""
    ;;
  channel:delete|branch:delete)
    case " ${(scenario.deleteFails ?? []).join(" ")} " in *" \${cmd%%:*} "*) echo "boom" >&2; exit 1 ;; esac
    ;;
  channel:list)
    ${scenario.badList ? "echo '{}'; exit 0" : ""}
    ${scenario.swapped ? "echo '[]'; exit 0" : ""}
    case " ${(scenario.present ?? []).join(" ")} " in *" channel "*) echo '{"currentPage":[{"name":"pr-7"}]}' ;; *) echo '{"currentPage":[]}' ;; esac
    ;;
  branch:list)
    ${scenario.badList ? "echo '{}'; exit 0" : ""}
    ${scenario.swapped ? "echo '{\"currentPage\":[]}'; exit 0" : ""}
    case " ${(scenario.present ?? []).join(" ")} " in *" branch "*) echo '[{"name":"pr-7"}]' ;; *) echo '[]' ;; esac
    ;;
esac
`,
  );
  writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n");
  writeFileSync(path.join(bin, "gh"), scenario.prState === "ERROR" ? "#!/bin/sh\necho 'HTTP 502' >&2\nexit 1\n" : `#!/bin/sh\necho "${scenario.prState ?? "CLOSED"}"\n`);
  chmodSync(path.join(bin, "gh"), 0o755);
  chmodSync(path.join(bin, "npx"), 0o755);
  chmodSync(path.join(bin, "sleep"), 0o755);
  // As GitHub runs a step: bash -e.
  const result = spawnSync("bash", ["-e", "-c", script], {
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, EXPO_TOKEN: "t", EAS_PROJECT_ID: "p", CHANNEL: "pr-7", PR_NUMBER: "7", HOME: process.env.HOME ?? "" },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("pr-preview-teardown", () => {
  it("deletes, waits for EAS to be quiet, deletes again, and passes", () => {
    const r = run({ runs: ["[]"] });
    expect(r.code).toBe(0);
    expect(r.out.match(/Deleted channel pr-7/g)).toHaveLength(2);
  });

  it("fails, asking for a re-run, when preview runs are still open after the wait", () => {
    const r = run({ runs: ['[{"id":"r1"}]'] });
    expect(r.code).toBe(1);
    // One open run per status queried, each of the 45 checks.
    expect(r.out).toMatch(/still had 4 preview run\(s\) open after 45 minutes; re-run this job/);
  }, 60_000);

  it("treats an answer that isn't a list as unknown, not as zero runs", () => {
    const r = run({ runs: ["{}"] });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/still had unknown preview run/);
  });

  it("passes when a failed delete is confirmed gone, and fails when the list still names it", () => {
    expect(run({ runs: ["[]"], deleteFails: ["channel", "branch"] }).code).toBe(0);
    const r = run({ runs: ["[]"], deleteFails: ["branch"], present: ["branch"] });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Couldn't delete the branch pr-7/);
  });

  it("keeps the preview when the pull request was reopened", () => {
    const r = run({ runs: ["[]"], prState: "OPEN" });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/open again: keeping pr-7/);
    expect(r.out).not.toMatch(/Deleted/);
  });

  it("deletes nothing and fails when GitHub can't say whether the pull request is open", () => {
    const r = run({ runs: ["[]"], prState: "ERROR" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Couldn't read pull request 7's state/);
    expect(r.out).not.toMatch(/Deleted/);
  });

  it("fails when a list answers the other command's shape (an empty array for channels, a page for branches)", () => {
    expect(run({ runs: ["[]"], deleteFails: ["channel"], swapped: true }).code).toBe(1);
    expect(run({ runs: ["[]"], deleteFails: ["branch"], swapped: true }).code).toBe(1);
  });

  it("fails when a delete failed and the list answers something that isn't a list", () => {
    const r = run({ runs: ["[]"], deleteFails: ["channel"], badList: true });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Couldn't delete the channel pr-7/);
  });
});
