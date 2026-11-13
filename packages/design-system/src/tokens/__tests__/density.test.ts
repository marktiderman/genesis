/**
 * @feat:shell-navigation-styles
 * One density vocabulary (ADR 0022): compact, comfortable, spacious; sites' older words as aliases.
 */
import { describe, expect, it } from "vitest";
import { DENSITY_LEVELS, resolveDensity } from "../density";
import { crispDesignSystem, resolveChoices, validateDesignSystemChoice } from "../../design-systems";

describe("resolveDensity", () => {
  it("keeps the three words and maps sites' older ones", () => {
    expect(DENSITY_LEVELS).toEqual(["compact", "comfortable", "spacious"]);
    for (const level of DENSITY_LEVELS) expect(resolveDensity(level)).toBe(level);
    expect(resolveDensity("normal")).toBe("comfortable");
    expect(resolveDensity("generous")).toBe("spacious");
    expect(resolveDensity("huge")).toBeUndefined();
    expect(resolveDensity(3)).toBeUndefined();
  });

  it("a design system choice takes the shared words as aliases of its own", () => {
    expect(validateDesignSystemChoice({ id: "crisp@1", density: "spacious" })).toEqual([]);
    expect(validateDesignSystemChoice({ id: "crisp@1", density: "huge" })).toHaveLength(1);
    const ds = crispDesignSystem;
    expect(resolveChoices(ds, { density: "comfortable" }).density).toBe("normal");
    expect(resolveChoices(ds, { density: "spacious" }).density).toBe("generous");
    expect(resolveChoices(ds, { density: "compact" }).density).toBe("compact");
  });
});
