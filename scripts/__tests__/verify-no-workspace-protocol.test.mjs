/**
 * Regression test for scripts/verify-no-workspace-protocol.mjs.
 *
 * THE 2.1.0 LESSON: @marktiderman/genesis-ui@2.1.0 (and five sibling
 * packages) were published to npm with a literal `"workspace:^"` /
 * `"workspace:*"` string in `dependencies`/`peerDependencies` — no consumer
 * can install a package like that. This tests the pure detector the release
 * gate (release.yml) and the PR gate (tarball-integrity.yml) both call
 * against a REAL packed tarball's package.json — see those workflows for the
 * end-to-end wiring, which this test does not exercise (it would require an
 * actual `pnpm pack`, which is covered manually in the PR that added this).
 */
import { describe, expect, it } from "vitest";
import { findWorkspaceProtocolDeps } from "../verify-no-workspace-protocol.mjs";

describe("findWorkspaceProtocolDeps", () => {
  it("flags a workspace: range in dependencies", () => {
    const problems = findWorkspaceProtocolDeps({
      dependencies: { "@marktiderman/genesis-core": "workspace:^" },
    });
    expect(problems).toEqual([
      'dependencies.@marktiderman/genesis-core = "workspace:^"',
    ]);
  });

  it("flags a workspace:* range, matching the genesis umbrella package's 0.5.2 defect", () => {
    const problems = findWorkspaceProtocolDeps({
      dependencies: { "@marktiderman/genesis-ui": "workspace:*" },
    });
    expect(problems).toEqual([
      'dependencies.@marktiderman/genesis-ui = "workspace:*"',
    ]);
  });

  it("flags a workspace: range in peerDependencies, matching genesis-switchboard's defect", () => {
    const problems = findWorkspaceProtocolDeps({
      peerDependencies: { "@marktiderman/genesis-core": "workspace:^" },
    });
    expect(problems).toEqual([
      'peerDependencies.@marktiderman/genesis-core = "workspace:^"',
    ]);
  });

  it("flags a workspace: range in optionalDependencies", () => {
    const problems = findWorkspaceProtocolDeps({
      optionalDependencies: { "@marktiderman/genesis-core": "workspace:~" },
    });
    expect(problems).toEqual([
      'optionalDependencies.@marktiderman/genesis-core = "workspace:~"',
    ]);
  });

  it("passes a real semver range — what pnpm pack produces after rewriting", () => {
    const problems = findWorkspaceProtocolDeps({
      dependencies: { "@marktiderman/genesis-core": "^1.1.2" },
    });
    expect(problems).toEqual([]);
  });

  it("does not false-positive on a package name or description merely containing the word workspace", () => {
    const problems = findWorkspaceProtocolDeps({
      description: "workspace: pluggable data layer",
      dependencies: { "some-workspace-tool": "^1.0.0" },
    });
    expect(problems).toEqual([]);
  });

  it("passes a package.json with no dependency fields at all", () => {
    expect(
      findWorkspaceProtocolDeps({ name: "@marktiderman/genesis-cli" }),
    ).toEqual([]);
  });

  it("reports every offending entry, not just the first", () => {
    const problems = findWorkspaceProtocolDeps({
      dependencies: {
        "@marktiderman/genesis-core": "workspace:^",
        "@marktiderman/genesis-ui": "workspace:*",
      },
      peerDependencies: {
        "@marktiderman/genesis-design-system": "workspace:^",
      },
    });
    expect(problems).toHaveLength(3);
  });
});
