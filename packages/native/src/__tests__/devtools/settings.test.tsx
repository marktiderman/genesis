// @feat:devtools-overlay
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { settingsCatalogue, settingsFromManifest, resolveSettings } from "@marktiderman/genesis-config/settings";
import { createDevtools, DEVTOOLS_SETTING_SPECS, devtoolsSettings, devtoolsSettingValues } from "../../devtools";

describe("the devtools overlay's settings", () => {
  it("package.json declares exactly what the code declares", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf8")) as { genesis: { settings: unknown } };
    expect(pkg.genesis.settings).toEqual({ namespace: "devtools", keys: JSON.parse(JSON.stringify(DEVTOOLS_SETTING_SPECS)) });
    expect(Object.keys(settingsFromManifest(pkg.genesis.settings).keys)).toEqual(Object.keys(devtoolsSettings.keys));
  });

  it("is all on with no settings, and resolves without problems", () => {
    const resolved = resolveSettings(settingsCatalogue([devtoolsSettings]), { preset: "min" });
    expect(resolved.problems).toEqual([]);
    expect(devtoolsSettingValues(resolved)).toEqual({ overlay: true, shakeToOpen: true, hold: true, flags: true, signOut: true });
    expect(devtoolsSettingValues()).toEqual(devtoolsSettingValues(resolved));
  });

  it("only takes away: off hides the overlay, and nothing turns it on in a build that doesn't enable it", () => {
    expect(createDevtools({ enabled: true, appSettings: { "devtools.overlay": false } }).Root).toBeUndefined();
    expect(createDevtools({ enabled: false, appSettings: { "devtools.overlay": true } }).Root).toBeUndefined();
    const signOut = () => undefined;
    const devtools = createDevtools({ enabled: true, signOut, flags: { a: true }, hold: { fingers: 2 }, appSettings: { "devtools.signOut": false, "devtools.flags": false, "devtools.hold": false } });
    expect(devtools.options.signOut).toBeUndefined();
    expect(devtools.options.flags).toBeUndefined();
    expect(devtools.options.hold).toBe(false);
  });
});
