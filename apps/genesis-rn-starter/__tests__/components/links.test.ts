// @feat:native-starter
import { describe, expect, it } from "@jest/globals";
import { normalizeLink } from "@marktiderman/genesis-native";
import { links } from "@/lib/links";

describe("deep links", () => {
  it("opens the check-in from its documented link, gym and all", () => {
    expect(normalizeLink("genesis-starter://check-in?gym=hilltop", links)).toBe("/check-in?gym=hilltop");
  });

  it("still sends an unknown path home", () => {
    expect(normalizeLink("genesis-starter://nowhere", links)).toBe("/");
  });
});
