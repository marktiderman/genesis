// @feat:cli-upgrade
import { describe, expect, it } from "vitest";
import { codemodById, codemodsFor, CODEMODS, scopeNeutralNames } from "../src/upgrade/codemods.js";
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
    // practiceId still works in the open slot; the typed read is one augmentation, printed.
    expect(logs.join("\n")).toContain("interface ResourceScope { practiceId?: string }");

    // Run twice: nothing left to change.
    expect(await scopeNeutralNames.run({ root, dryRun: false, log: () => {} })).toEqual([]);
  });

  it("changes nothing on a dry run", async () => {
    const root = makeApp({ "src/sessions.view.ts": VIEW });
    expect(await scopeNeutralNames.run({ root, dryRun: true, log: () => {} })).toEqual(["src/sessions.view.ts"]);
    expect(read(root, "src/sessions.view.ts")).toBe(VIEW);
  });
});
