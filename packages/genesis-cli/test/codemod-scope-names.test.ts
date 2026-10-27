// @feat:cli-upgrade
import { describe, expect, it } from "vitest";
import { codemodById, codemodsFor, CODEMODS, scopeNeutralNames } from "../src/upgrade/codemods.js";
import { findRemovedScopeNames } from "../src/upgrade/scope-names.js";
import { makeApp, read } from "./blocks-helpers.js";

const VIEW = `import { defineView } from "@marktiderman/genesis-core/resource-view";
export const sessions = defineView(contract, {
  fields: { starts_at: { timeZone: "practice" }, ends_at: { timeZone: 'practice' }, sent_at: { timeZone: "viewer" } },
});
`;
const SCREEN = `import { NativeResourceView, resolveZone } from "@marktiderman/genesis-ui-native";
export const Screen = ({ zone }: { zone: string }) => (
  <NativeResourceView view={sessions} practiceTimeZone={zone} />
);
export const at = resolveZone("practice", zones);
`;
/** The app's own names, in a file that imports no Genesis package: never touched. */
const OWN = `export const practiceTimeZone = "Europe/Berlin";
export const field = { timeZone: "practice" };
`;
const SCOPE = `import { ViewerScope } from "@marktiderman/genesis-core";
export const Root = () => <ViewerScope viewer="ann" scope={{ practiceId: "p1" }}>{null}</ViewerScope>;
`;

const ZONES = `import { DisplayTimeZonesProvider, useDisplayTimeZones, type DisplayTimeZones, type NativeResourceViewProps } from "@marktiderman/genesis-ui-native";
export const own: DisplayTimeZones = { viewer: "UTC", practice: "Europe/Berlin" };
export function Clock() {
  const zones = useDisplayTimeZones();
  return <DisplayTimeZonesProvider value={{ viewer: zones.viewer, practice: zones.practice }}>{zones?.practice}</DisplayTimeZonesProvider>;
}
export const props: Partial<NativeResourceViewProps> = { practiceTimeZone: "Asia/Tokyo" };
// A practice of the app's own, not a zone: left alone.
export const team = { practice: "Tuesday" };
`;

describe("genesis-core-2-scope-names", () => {
  it("is registered for genesis-core 2.0.0, and runs when core crosses it", () => {
    expect(codemodById("genesis-core-2-scope-names")).toBe(scopeNeutralNames);
    expect(CODEMODS).toContain(scopeNeutralNames);
    expect(codemodsFor([{ file: "package.json", name: "@marktiderman/genesis-core", from: "^1.17.0", to: "^2.0.0" }])).toEqual([scopeNeutralNames]);
    expect(codemodsFor([{ file: "package.json", name: "@marktiderman/genesis-core", from: "^2.0.0", to: "^2.1.0" }])).toEqual([]);
  });

  it("renames the practice clock and prop in files that import Genesis, and nothing else", async () => {
    const root = makeApp({
      "src/sessions.view.ts": VIEW,
      "app/screen.tsx": SCREEN,
      "src/own.ts": OWN,
      "src/root.tsx": SCOPE,
      "node_modules/x/index.ts": VIEW,
    });
    const logs: string[] = [];
    const changed = await scopeNeutralNames.run({ root, dryRun: false, log: (m) => logs.push(m) });
    expect(changed).toEqual(["app/screen.tsx", "src/sessions.view.ts"]);
    expect(read(root, "src/sessions.view.ts")).toBe(VIEW.replace('timeZone: "practice"', 'timeZone: "scope"').replace("timeZone: 'practice'", "timeZone: 'scope'"));
    expect(read(root, "app/screen.tsx")).toContain("scopeTimeZone={zone}");
    expect(read(root, "app/screen.tsx")).toContain('resolveZone("scope", zones)');
    expect(read(root, "src/own.ts")).toBe(OWN);
    expect(read(root, "src/root.tsx")).toBe(SCOPE);
    expect(read(root, "node_modules/x/index.ts")).toBe(VIEW);
    // Passing practiceId in the open slot needs nothing, and nothing reads it typed here.
    expect(logs).toEqual([]);

    // Run twice: nothing left to change.
    expect(await scopeNeutralNames.run({ root, dryRun: false, log: () => {} })).toEqual([]);
  });

  it("renames DisplayTimeZones' practice and the prop as an object key, and leaves an app's own practice alone", async () => {
    const root = makeApp({ "app/clock.tsx": ZONES });
    expect(await scopeNeutralNames.run({ root, dryRun: false, log: () => {} })).toEqual(["app/clock.tsx"]);
    const out = read(root, "app/clock.tsx");
    expect(out).toContain('{ viewer: "UTC", scope: "Europe/Berlin" }');
    expect(out).toContain("{ viewer: zones.viewer, scope: zones.scope }");
    expect(out).toContain("{zones?.scope}");
    expect(out).toContain('{ scopeTimeZone: "Asia/Tokyo" }');
    expect(out).toContain('{ practice: "Tuesday" }');
    expect(findRemovedScopeNames(out)).toEqual([]);
  });

  it("rewrites only Genesis API usage: an app's own timeZone, prop and resolveZone in the same file stay", async () => {
    const mixed = [
      'import { defineView, type ViewField, type ViewDefinition } from "@marktiderman/genesis-core/resource-view";',
      'import { NativeResourceView } from "@marktiderman/genesis-ui-native";',
      "// The app's own settings and components, beside Genesis's:",
      'export const reminder = { timeZone: "practice", label: "Practice clock" };',
      'export const typedOwn: Reminder = { timeZone: "practice" };',
      'export const Mine = () => <MyClock practiceTimeZone={zone} />;',
      'const resolveZone = (z: string) => z;',
      'export const mine = resolveZone("practice");',
      "// Genesis's:",
      'export const opens: ViewField = { timeZone: "practice" };',
      'export const fields = { fields: { closes_at: { timeZone: "practice" } } } satisfies ViewDefinition<typeof c>;',
      'export const v = defineView(c, { fields: { starts_at: { timeZone: "practice" } } });',
      "export const S = () => <NativeResourceView view={v} practiceTimeZone={zone} />;",
    ].join("\n");
    const root = makeApp({ "src/mixed.tsx": mixed });
    expect(await scopeNeutralNames.run({ root, dryRun: false, log: () => {} })).toEqual(["src/mixed.tsx"]);
    const out = read(root, "src/mixed.tsx").split("\n");
    expect(out[3]).toBe('export const reminder = { timeZone: "practice", label: "Practice clock" };');
    expect(out[4]).toBe('export const typedOwn: Reminder = { timeZone: "practice" };');
    expect(out[5]).toBe("export const Mine = () => <MyClock practiceTimeZone={zone} />;");
    expect(out[7]).toBe('export const mine = resolveZone("practice");');
    expect(out[9]).toBe('export const opens: ViewField = { timeZone: "scope" };');
    expect(out[10]).toContain('closes_at: { timeZone: "scope" }');
    expect(out[11]).toContain('starts_at: { timeZone: "scope" }');
    expect(out[12]).toBe("export const S = () => <NativeResourceView view={v} scopeTimeZone={zone} />;");
  });

  it("reports nothing left after it runs, on a Growth90-shaped view", async () => {
    const view = [
      'import { defineView } from "@marktiderman/genesis-core/resource-view";',
      "export const formsView = defineView(contracts.forms, {",
      '  fields: { opens_at: { timeZone: "practice" }, closes_at: { timeZone: "practice" as const } },',
      "});",
    ].join("\n");
    expect(findRemovedScopeNames(view).map((h) => h.what)).toEqual(["timeZone-practice", "timeZone-practice"]);
    const root = makeApp({ "src/shared/views/forms.view.ts": view });
    await scopeNeutralNames.run({ root, dryRun: false, log: () => {} });
    expect(read(root, "src/shared/views/forms.view.ts")).toContain('closes_at: { timeZone: "scope" as const }');
    expect(findRemovedScopeNames(read(root, "src/shared/views/forms.view.ts"))).toEqual([]);
  });

  it("prints the ResourceScope augmentation only when scope.practiceId is read and nothing augments it", async () => {
    const reads = 'import { useViewerScope } from "@marktiderman/genesis-core";\nexport const id = () => useViewerScope().scope.practiceId;\n';
    const logs: string[] = [];
    await scopeNeutralNames.run({ root: makeApp({ "src/id.ts": reads }), dryRun: true, log: (m) => logs.push(m) });
    expect(logs.join("\n")).toContain("interface ResourceScope { practiceId?: string }");
    const quiet: string[] = [];
    await scopeNeutralNames.run({
      root: makeApp({ "src/id.ts": reads, "src/genesis.d.ts": 'declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }' }),
      dryRun: true,
      log: (m) => quiet.push(m),
    });
    expect(quiet).toEqual([]);
  });

  it("changes nothing on a dry run", async () => {
    const root = makeApp({ "src/sessions.view.ts": VIEW });
    expect(await scopeNeutralNames.run({ root, dryRun: true, log: () => {} })).toEqual(["src/sessions.view.ts"]);
    expect(read(root, "src/sessions.view.ts")).toBe(VIEW);
  });
});
