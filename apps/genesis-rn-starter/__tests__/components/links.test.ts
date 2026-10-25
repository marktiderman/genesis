// @feat:native-starter
import { describe, expect, it } from "@jest/globals";
import { normalizeLink } from "@marktiderman/genesis-native";
import { appSchemes, links } from "@/lib/links";

describe("deep links", () => {
  it("opens the check-in from its documented link, gym and all", () => {
    expect(normalizeLink("genesis-starter://check-in?gym=hilltop", links)).toBe("/check-in?gym=hilltop");
  });

  it("answers to the scheme its variant registered, as well as the base", () => {
    expect(appSchemes("genesis-starter", "genesis-starter-dev")).toEqual(["genesis-starter", "genesis-starter-dev"]);
    expect(appSchemes("genesis-starter", ["genesis-starter-preview"])).toEqual(["genesis-starter", "genesis-starter-preview"]);
    expect(appSchemes("genesis-starter", "genesis-starter")).toEqual(["genesis-starter"]);
    expect(appSchemes("genesis-starter", undefined)).toEqual(["genesis-starter"]);
    const dev = { ...links, schemes: appSchemes("genesis-starter", "genesis-starter-dev") };
    expect(normalizeLink("genesis-starter-dev://check-in?gym=hilltop", dev)).toBe("/check-in?gym=hilltop");
  });

  it("still sends an unknown path home", () => {
    expect(normalizeLink("genesis-starter://nowhere", links)).toBe("/");
  });
});
