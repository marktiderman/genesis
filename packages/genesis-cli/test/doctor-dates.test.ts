// @feat:cli-doctor
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const findings = async (files: Record<string, string>) =>
  (await runDoctor({ root: makeApp(null, { "package.json": '{"name":"app"}', ...files }) })).findings.filter((f) => f.rule === "iso-date-slice");

describe("iso-date-slice", () => {
  it("flags every way of cutting a day from an ISO timestamp", async () => {
    const found = await findings({
      "src/today.ts": [
        "export const a = new Date().toISOString().slice(0, 10);",
        "export const b = d.toISOString().substring(0,10);",
        "export const c = d.toISOString().split('T')[0];",
        'export const e = d.toISOString().split("T").at(0);',
        "export const f = d.toISOString()\n  .slice(0, 10);",
      ].join("\n"),
    });
    expect(found.map((f) => f.line)).toEqual([1, 2, 3, 4, 5]);
    expect(found[0]).toMatchObject({ level: "warn", file: "src/today.ts", subject: "toISOString" });
    expect(found[0]?.message).toContain("@marktiderman/genesis-core/dates");
  });

  it("leaves full timestamps, comments and tests alone", async () => {
    const found = await findings({
      "src/ok.ts": [
        "export const stamp = new Date().toISOString();",
        "export const minute = d.toISOString().slice(0, 16);",
        "// d.toISOString().slice(0, 10) is the UTC day",
      ].join("\n"),
      "src/today.test.ts": "expect(d.toISOString().slice(0, 10)).toBe('2026-10-26');",
    });
    expect(found).toEqual([]);
  });

  it("is allowed with a reason", async () => {
    const root = makeApp(null, {
      "package.json": '{"name":"app"}',
      "src/log.ts": "export const name = `log-${new Date().toISOString().slice(0, 10)}.txt`;",
      "genesis.config.json": JSON.stringify({ doctor: { allow: [{ rule: "iso-date-slice", file: "src/log.ts", reason: "Log files are named by the UTC day." }] } }),
    });
    expect((await runDoctor({ root })).findings.filter((f) => f.rule === "iso-date-slice")).toEqual([]);
  });
});
