// @feat:app-updates
/** `genesis build-stamp`: the build's metadata, from CI's environment first, then git. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBuildStamp, writeBuildStamp } from "../src/build-stamp";
import { removeTempDir } from "./temp.js";

const now = () => new Date("2026-11-19T10:00:00.000Z");
let dir = "";
afterEach(() => dir && removeTempDir(dir));

describe("genesis build-stamp", () => {
  it("takes the commit and branch from CI before git, the version from package.json and the channel from the flag", () => {
    dir = mkdtempSync(path.join(tmpdir(), "stamp-"));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "1.4.0" }));
    const git = () => "from-git";
    expect(resolveBuildStamp({ cwd: dir, env: { GITHUB_SHA: "abc123", GITHUB_REF_NAME: "main" }, channel: "production", now, git })).toEqual({
      version: "1.4.0",
      commit: "abc123",
      branch: "main",
      builtAt: "2026-11-19T10:00:00.000Z",
      channel: "production",
    });
    expect(resolveBuildStamp({ cwd: dir, env: { GENESIS_CHANNEL: "preview" }, now, git })).toMatchObject({ commit: "from-git", branch: "from-git", channel: "preview" });
  });

  it("writes nulls for what it can't know, and the file the app imports", () => {
    dir = mkdtempSync(path.join(tmpdir(), "stamp-"));
    const { file, stamp } = writeBuildStamp({ cwd: dir, env: {}, now, git: () => null });
    expect(stamp).toEqual({ version: null, commit: null, branch: null, builtAt: "2026-11-19T10:00:00.000Z", channel: null });
    expect(file).toBe(path.join(dir, "build-metadata.json"));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(stamp);
  });

  it("never names a detached HEAD as the branch", () => {
    expect(resolveBuildStamp({ cwd: "/nowhere", env: {}, version: "1.0.0", now, git: (args) => (args.includes("--abbrev-ref") ? "HEAD" : "sha") }).branch).toBeNull();
  });
});
