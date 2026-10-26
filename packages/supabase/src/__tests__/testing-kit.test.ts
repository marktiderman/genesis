import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The CI fixture app runs the pgTAP kit and its self-test (`supabase test db` in
// ci-templates-self-test.yml). Its copies must be the package's files, byte for byte.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "../..");
const fixture = join(pkg, "../../.github/ci-fixture/supabase/tests/database");
const read = (path: string) => readFileSync(path, "utf8");

describe("the genesis_testing pgTAP kit", () => {
  it("the CI fixture runs the package's own kit", () => {
    expect(read(join(fixture, "000_genesis_testing.test.sql"))).toBe(
      read(join(pkg, "sql/testing/genesis_testing.sql")),
    );
  });

  it("the CI fixture runs the package's own self-test", () => {
    expect(read(join(fixture, "genesis_testing_selftest.test.sql"))).toBe(
      read(join(pkg, "sql/testing/tests/genesis_testing.test.sql")),
    );
  });

  it("grants by name, never on all functions", () => {
    expect(read(join(pkg, "sql/testing/genesis_testing.sql"))).not.toMatch(
      /on all functions/i,
    );
  });

  it("uses the shared fixture ids", () => {
    const sql = read(join(pkg, "sql/testing/genesis_testing.sql"));
    for (const [who, n] of [
      ["owner", 1],
      ["staff", 2],
      ["client", 3],
      ["stranger", 4],
    ] as const) {
      expect(sql).toContain(
        `when '${who}' then '00000000-0000-4000-8000-00000000000${n}'::uuid`,
      );
    }
  });
});
