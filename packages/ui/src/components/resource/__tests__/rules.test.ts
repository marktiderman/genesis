// @feat:resource-workspace
import * as core from "@marktiderman/genesis-core/resource";
import { describe, expect, it } from "vitest";
import * as rules from "../rules";
import * as resource from "..";

// The rules live in genesis-core (tested there); genesis-ui hands out the same functions.
describe("resource rules", () => {
  it("are genesis-core's, at /resource/rules and /resource", () => {
    for (const name of ["SAVE_STATE_LABEL", "readinessOf", "readinessChip", "dayLabel", "prefilledUrl", "embedSnippet"] as const) {
      expect(rules[name]).toBe(core[name]);
      expect(resource[name]).toBe(core[name]);
    }
  });
});
