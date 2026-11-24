// @feat:native-starter
import { describe, expect, it } from "@jest/globals";
import { normalizeLink } from "@marktiderman/genesis-native";
import { appSchemes, links } from "@/lib/links";

describe("deep links", () => {
  it("opens the check-in from its documented link, location and all", () => {
    expect(normalizeLink("genesis-workbench://check-in?location=hilltop", links)).toBe("/check-in?location=hilltop");
  });

  it("answers to every variant's scheme, whatever config Metro served", () => {
    const all = ["genesis-workbench", "genesis-workbench-dev", "genesis-workbench-preview"];
    expect(appSchemes("genesis-workbench", undefined)).toEqual(all);
    expect(appSchemes("genesis-workbench", "genesis-workbench")).toEqual(all);
    expect(appSchemes("genesis-workbench", ["genesis-workbench-preview"])).toEqual(all);
    expect(appSchemes("genesis-workbench", "custom")).toEqual([...all, "custom"]);
    // The app's own map, as built in this test (no APP_VARIANT): a development build's link still opens.
    expect(normalizeLink("genesis-workbench-dev://check-in?location=hilltop", links)).toBe("/check-in?location=hilltop");
    expect(normalizeLink("genesis-workbench-preview://settings", links)).toBe("/settings");
  });

  it("still sends an unknown path home", () => {
    expect(normalizeLink("genesis-workbench://nowhere", links)).toBe("/");
  });
});
