// @feat:custom-views
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { colorRoles } from "../src/doctor/genesis.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const run = (files: Record<string, string>) => runDoctor({ root: makeApp(null, { "package.json": '{"name":"app"}', ...files }) });
const only = async (rule: string, files: Record<string, string>) => (await run(files)).findings.filter((f) => f.rule === rule);

const PARTS = 'var THEME_PARTS = Object.freeze([\n  p("button", "A button.", ["variant", "size"]),\n  p("card", "A card.")\n]);\n';
const DS_PARTS = { "node_modules/@marktiderman/genesis-design-system/dist/chunk-parts.js": PARTS };

describe("app-part-name", () => {
  it("asks an app's own data-slot to start app-, and names a clash with a Genesis part", async () => {
    const found = await only("app-part-name", {
      ...DS_PARTS,
      "src/leaderboard.tsx": [
        "export const A = () => <ol data-slot=\"leaderboard\" />;",
        "export const B = () => <div data-slot='card' />;",
        "export const C = () => <li data-slot=\"app-leaderboard-row\" />;",
      ].join("\n"),
    });
    expect(found.map((f) => [f.line, f.level, f.subject])).toEqual([
      [1, "warn", "leaderboard"],
      [2, "warn", "card"],
    ]);
    expect(found[0]?.message).toContain('"app-leaderboard"');
    expect(found[1]?.message).toContain("is a Genesis part");
  });
});

describe("app-part-colors", () => {
  it("flags a colour from a variable that isn't a colour role, in a custom view or an app part", async () => {
    const found = await only("app-part-colors", {
      "src/board.tsx": [
        'import { CustomView } from "@marktiderman/genesis-ui/data";',
        "export const Board = () => (",
        "  <CustomView view={v}>{() => <div style={{ color: \"hsl(var(--primary))\", backgroundColor: \"var(--brand-500)\" }} className=\"bg-[var(--my-red)] text-[hsl(var(--background))]\" />}</CustomView>",
        ");",
      ].join("\n"),
      // The app declares its own variables (so they aren't undefined tokens); they still aren't roles.
      "src/app.css": ":root { --brand-500: 10 80% 50%; --my-red: 0 80% 50%; --chip-ink: 0 0% 10%; }",
      "src/part.tsx": 'export const P = () => <span data-slot="app-chip" style={{ borderColor: "var(--color-border)", fill: "var(--chip-ink)" }} />;',
      // Neither a custom view nor an app part: the rule leaves it alone.
      "src/other.tsx": 'export const O = () => <span style={{ color: "var(--brand-500)" }} />;',
    });
    expect(found.map((f) => [f.file, f.subject])).toEqual([
      ["src/board.tsx", "--brand-500"],
      ["src/board.tsx", "--my-red"],
      ["src/part.tsx", "--chip-ink"],
    ]);
  });

  it("reads colour roles from the theme stylesheets, chains included", () => {
    const roles = colorRoles([":root { --primary: 243 75% 59%; --primary-text: var(--primary); --radius: 0.5rem; --ink: #123456; }", "@theme inline { --color-primary: hsl(var(--primary)); }"]);
    expect([...roles].sort()).toEqual(["--color-primary", "--ink", "--primary", "--primary-text"]);
  });
});

describe("custom-view-states", () => {
  it("flags a custom view that draws its own loading, empty or error state", async () => {
    const found = await only("custom-view-states", {
      "src/mine.tsx": [
        'import { useCustomView } from "@marktiderman/genesis-ui/data";',
        "export function Mine() {",
        "  const state = useCustomView({ view: v });",
        '  if (state.status === "loading") return <Spinner />;',
        "  if (state.status !== 'error') return <List rows={state.rows} />;",
        "  return null;",
        "}",
      ].join("\n"),
      // Its own status words outside a custom view are none of this rule's business.
      "src/fine.tsx": 'export const F = ({ status }) => (status === "loading" ? <p /> : null);',
    });
    expect(found.map((f) => [f.file, f.line, f.subject])).toEqual([
      ["src/mine.tsx", 4, "loading"],
      ["src/mine.tsx", 5, "error"],
    ]);
  });
});
