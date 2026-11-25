import { describe, expect, it } from "@jest/globals";
import { redirectSystemPath } from "@/app/+native-intent";

describe("deep links", () => {
  it("open a section and a screen at once, with no sign-in to wait for", () => {
    expect(redirectSystemPath({ path: "genesis-dev://components", initial: true })).toBe("/components");
    expect(redirectSystemPath({ path: "genesis://standards/header-large", initial: false })).toBe("/standards/header-large");
  });

  it("send an unknown path home", () => {
    expect(redirectSystemPath({ path: "genesis://settings", initial: true })).toBe("/");
  });
});
