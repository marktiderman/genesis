// @feat:native-starter
// The template promise, checked here rather than in the starter's own tests: an app copied from
// apps/genesis-rn-starter is meant to turn features off, and its tests must not fail when it does.
import { describe, expect, it } from "vitest";
import starter from "../../apps/genesis-rn-starter/starter.config.ts";

describe("apps/genesis-rn-starter as a template", () => {
  it("ships with every universal feature on, except those that can't work before setup", () => {
    // googleSignIn needs Google client ids and the Universal sign-in module first (README).
    const needsSetup = ["googleSignIn"];
    const off = Object.entries(starter.features).filter(([, on]) => !on).map(([name]) => name);
    expect(off).toEqual(needsSetup);
  });
});
