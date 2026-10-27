/** @feat:content-pack-install */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentPackProblems, type ContentPackDef } from "@marktiderman/genesis-features/blocks";
import { describe, expect, it } from "vitest";
import { workPacks } from "../packs";

const packs: readonly ContentPackDef[] = workPacks;

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const sql = (file: string) => readFileSync(join(migrations, file), "utf8");
/** The values a column's check constraint allows, read from the migration. */
const allowed = (file: string, constraint: string) => {
  const match = sql(file).match(new RegExp(`constraint ${constraint} check \\(\\w+ in \\(([^)]*)\\)\\)`));
  if (!match) throw new Error(`no ${constraint} in ${file}`);
  return (match[1] ?? "").split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
};

const blocks = ["pursuits", "metrics", "status-updates", "sessions", "custom-fields", "content-pack-install"];

describe("genesis-work's packs", () => {
  it.each(packs.map((p) => [p.id, p] as const))("%s installs where the work blocks are", (_id, pack) => {
    expect(contentPackProblems(pack, blocks)).toEqual([]);
    expect(pack.publisher).toBe("@marktiderman/genesis-work");
  });

  it.each(packs.map((p) => [p.id, p] as const))("%s passes the installer's own checks", (_id, pack) => {
    // install_content_pack's rules (0006), which are stricter than the TypeScript shape.
    expect(pack.id).toMatch(/^[a-z][a-z0-9-]{0,39}$/);
    expect(pack.id).not.toBe("tenant");
    expect(pack.version).toMatch(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/);
    const items = [...(pack.sessionTypes ?? []), ...(pack.metricTemplates ?? []), ...(pack.fieldDefinitions ?? [])];
    for (const item of items) expect(item.key).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
    for (const label of Object.keys(pack.labels ?? {})) expect(label).toMatch(/^[a-z][a-z0-9_.-]{0,79}$/);

    const kinds = allowed("0004_genesis_work_sessions.sql", "session_types_kind");
    for (const s of pack.sessionTypes ?? []) expect(kinds).toContain(s.kind);
    for (const m of pack.metricTemplates ?? []) {
      expect(allowed("0002_genesis_work_metrics.sql", "metrics_unit_type")).toContain(m.unitType);
      expect(allowed("0002_genesis_work_metrics.sql", "metrics_cadence")).toContain(m.cadence);
      expect(allowed("0002_genesis_work_metrics.sql", "metrics_goal_direction")).toContain(m.goalDirection);
    }
  });

  it("gives every pack its own id", () => {
    expect(new Set(packs.map((p) => p.id)).size).toBe(packs.length);
  });
});
