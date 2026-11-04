// @feat:native-components
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkUiParity, discover, nativeDataComponents, readParity, webDataComponents } from "../check-ui-parity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const empty = { twins: {}, webOnly: {}, nativeOnly: {} };
const run = (web, native, parity = {}) => checkUiParity(root, { web, native }, { ...empty, ...parity });

describe("check-ui-parity", () => {
  it("pairs X with NativeX, and a layout with its own name", () => {
    const { pairs, failures } = run(["Button", "SettingsPage"], ["NativeButton", "SettingsPage"]);
    expect(Object.fromEntries(pairs)).toEqual({ Button: "NativeButton", SettingsPage: "SettingsPage" });
    expect(failures).toEqual([]);
  });

  it("fails a gap nobody recorded, on either side", () => {
    const { failures } = run(["Button", "Menubar"], ["NativeButton", "NativeRefreshControl"]);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatch(/genesis-ui's Menubar has no genesis-ui-native twin/);
    expect(failures[1]).toMatch(/genesis-ui-native's NativeRefreshControl has no genesis-ui twin/);
  });

  it("accepts a gap with a reason, and a twin under another name", () => {
    const { pairs, failures } = run(["Menubar", "ToggleGroup"], ["NativeSegmentedControl", "NativeRefreshControl"], {
      twins: { ToggleGroup: "NativeSegmentedControl" },
      webOnly: { Menubar: "A desktop menu bar." },
      nativeOnly: { NativeRefreshControl: "Pull to refresh is a phone gesture." },
    });
    expect(pairs.get("ToggleGroup")).toBe("NativeSegmentedControl");
    expect(failures).toEqual([]);
  });

  it("fails a stale entry: a gap that has a twin now, or a name that's gone", () => {
    const { failures } = run(["Button", "Chip"], ["NativeButton", "NativeChip"], {
      webOnly: { Button: "notYet: no phone button.", Gone: "x" },
      nativeOnly: { NativeGone: "x" },
      twins: { Nope: "NativeChip", Chip: "NativeMissing" },
    });
    const text = failures.join("\n");
    expect(text).toMatch(/webOnly: "Button" has a twin now/);
    expect(text).toMatch(/webOnly: "Gone" isn't a genesis-ui component/);
    expect(text).toMatch(/nativeOnly: "NativeGone" isn't a genesis-ui-native component/);
    expect(text).toMatch(/twins: "Nope" isn't a genesis-ui component/);
    expect(text).toMatch(/twins: "Chip" → "NativeMissing", which isn't a genesis-ui-native component/);
  });

  it("fails an empty reason, a twin claimed twice, and a name in both lists", () => {
    const { failures } = run(["A", "B", "C"], ["NativeX"], {
      twins: { A: "NativeX", B: "NativeX" },
      webOnly: { A: "x", C: "  " },
    });
    const text = failures.join("\n");
    expect(text).toMatch(/"NativeX" is the twin of both "A" and "B"/);
    expect(text).toMatch(/"A" is in both twins and webOnly/);
    expect(text).toMatch(/webOnly: "C" needs a reason/);
  });

  it("a mapped twin wins over the name rule, so NativeX can pair with another web name", () => {
    const { pairs, failures } = run(["Alert", "AlertDialog"], ["NativeAlert"], {
      twins: { AlertDialog: "NativeAlert" },
      webOnly: { Alert: "x" },
    });
    expect(Object.fromEntries(pairs)).toEqual({ AlertDialog: "NativeAlert" });
    expect(failures).toEqual([]);
  });

  it("reads each data layer's components, leaving out parts and providers", () => {
    expect(webDataComponents([`export { ResourceView, useResourceView, type ResourceViewProps } from "./a";\nexport { RowAvatar } from "./b";\nexport { ResourceViewDefaultsProvider } from "./c";`])).toEqual(["ResourceView"]);
    expect(nativeDataComponents([`export { NativeResourceView, NativeResourceViewMessagesProvider } from "./a";\nexport { NativeRecordView, NativeRecordViewMenu } from "./b";`])).toEqual(["NativeResourceView", "NativeRecordView"]);
  });

  it("passes on this checkout: every gap is recorded and every entry still true", () => {
    const components = discover(root);
    expect(components.web).toContain("ResourceView");
    expect(components.native).toContain("NativeResourceView");
    const { pairs, failures } = checkUiParity(root, components, readParity(root));
    expect(failures).toEqual([]);
    expect(pairs.get("ResourceView")).toBe("NativeResourceView");
    expect(pairs.get("RecordView")).toBe("NativeRecordView");
  });
});
