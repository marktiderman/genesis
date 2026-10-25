// @feat:native-starter
import { describe, expect, it } from "@jest/globals";
import { normalizeLink } from "@marktiderman/genesis-native";
import { appSchemes, links } from "@/lib/links";

describe("deep links", () => {
  it("opens the check-in from its documented link, gym and all", () => {
    expect(normalizeLink("genesis-starter://check-in?gym=hilltop", links)).toBe("/check-in?gym=hilltop");
  });

  it("answers to every variant's scheme, whatever config Metro served", () => {
    const all = ["genesis-starter", "genesis-starter-dev", "genesis-starter-preview"];
    expect(appSchemes("genesis-starter", undefined)).toEqual(all);
    expect(appSchemes("genesis-starter", "genesis-starter")).toEqual(all);
    expect(appSchemes("genesis-starter", ["genesis-starter-preview"])).toEqual(all);
    expect(appSchemes("genesis-starter", "custom")).toEqual([...all, "custom"]);
    // The app's own map, as built in this test (no APP_VARIANT): a development build's link still opens.
    expect(normalizeLink("genesis-starter-dev://check-in?gym=hilltop", links)).toBe("/check-in?gym=hilltop");
    expect(normalizeLink("genesis-starter-preview://settings", links)).toBe("/settings");
  });

  it("still sends an unknown path home", () => {
    expect(normalizeLink("genesis-starter://nowhere", links)).toBe("/");
  });
});
