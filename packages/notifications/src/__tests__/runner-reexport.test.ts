// @feat:notifications
// `/runner` is a deprecated re-export of genesis-supabase's engine: the same
// values, so code still importing it runs the one engine.
import * as engine from "@marktiderman/genesis-supabase/runner";
import { describe, expect, it } from "vitest";
import * as deprecated from "../runner/index";

describe("@marktiderman/genesis-notifications/runner (deprecated)", () => {
  it("re-exports every value of @marktiderman/genesis-supabase/runner, unchanged", () => {
    expect(Object.keys(deprecated).sort()).toEqual(Object.keys(engine).sort());
    for (const name of Object.keys(engine) as (keyof typeof engine)[]) expect(deprecated[name], name).toBe(engine[name]);
  });
});
