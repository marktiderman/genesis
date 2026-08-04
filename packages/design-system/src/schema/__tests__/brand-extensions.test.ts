/**
 * BrandExtensions type-test — covers the surface gap from the
 * acme-migration audit (PRD-07 cleanup-A).
 *
 * Acme's brand package ships a NESTED ColorScale extension
 * (`flowTemplate: { vital: ColorScale; flow: ColorScale; ... }`),
 * which previously failed to declaration-merge because the canonical
 * schema declared the fallback index signature as
 * `Record<string, ColorScale>`. After loosening to
 * `Record<string, unknown>`, both flat and nested shapes merge
 * cleanly.
 *
 * These are type-only assertions — they verify the shape compiles.
 * If the type widening regresses, this file fails at typecheck time,
 * not at vitest runtime.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { CanonicalBrand, ColorScale } from "../brand";

// Consumer-side declaration merge — extends BrandExtensions with a flat
// scale (`rank`) and a NESTED scale map (`flowTemplate`). This is the
// exact shape Acme's brand package ships.
//
// All keys are declared OPTIONAL because TypeScript module-augmentation
// merges globally across the program: making them required here would
// retroactively force every other test file in the package to provide
// these keys (e.g. `from-brand.test.ts` only sets `rank` + `gameMode`).
// Optionality preserves the augment-merge contract while letting other
// brand fixtures opt in to whichever extension keys they need.
declare module "../brand" {
  interface BrandExtensions {
    rank?: ColorScale;
    flowTemplate?: Record<string, ColorScale>;
  }
}

const sampleScale: ColorScale = {
  DEFAULT: "#737373",
  50: "#fafafa",
  100: "#f5f5f5",
  500: "#737373",
  900: "#171717",
};

describe("BrandExtensions declaration merging", () => {
  it("accepts a flat-ColorScale extension", () => {
    const brand: CanonicalBrand = {
      name: "test",
      neutral: { 50: "#fafafa", 900: "#0a0a0a" },
      surface: sampleScale,
      text: sampleScale,
      accent: sampleScale,
      status: {
        success: sampleScale,
        warning: sampleScale,
        error: sampleScale,
        info: sampleScale,
      },
      extensions: {
        rank: sampleScale,
      },
    };
    // After declaration merge with `rank?: ColorScale`, the consumer-typed
    // access narrows to `ColorScale | undefined` (optional from the augment
    // + optional from the parent `extensions?` chain).
    expectTypeOf(brand.extensions?.rank).toEqualTypeOf<
      ColorScale | undefined
    >();
  });

  it("accepts a nested ColorScale-map extension (e.g. Acme flowTemplate)", () => {
    // BEFORE the fix, this assignment failed with
    //   "Type Record<string, ColorScale> is not assignable to type ColorScale"
    // because the index signature `Record<string, ColorScale>` collided
    // with the consumer's nested-map declaration.
    const brand: CanonicalBrand = {
      name: "acme",
      neutral: { 50: "#fafafa", 900: "#0a0a0a" },
      surface: sampleScale,
      text: sampleScale,
      accent: sampleScale,
      status: {
        success: sampleScale,
        warning: sampleScale,
        error: sampleScale,
        info: sampleScale,
      },
      extensions: {
        rank: sampleScale,
        flowTemplate: {
          vital: sampleScale,
          flow: sampleScale,
          recovery: sampleScale,
        },
      },
    };
    expectTypeOf(brand.extensions?.flowTemplate).toEqualTypeOf<
      Record<string, ColorScale> | undefined
    >();
  });

  it("falls back to `unknown` for keys without a declaration", () => {
    // Keys not declared via module augmentation hit the index signature
    // and resolve to `unknown`. Consumers must narrow before use; this
    // is the looser-but-safer contract.
    const brand: CanonicalBrand = {
      name: "test",
      neutral: { 50: "#fafafa", 900: "#0a0a0a" },
      surface: sampleScale,
      text: sampleScale,
      accent: sampleScale,
      status: {
        success: sampleScale,
        warning: sampleScale,
        error: sampleScale,
        info: sampleScale,
      },
      extensions: {
        // `gameMode` was never declared above — index sig kicks in.
        gameMode: sampleScale,
      },
    };
    expectTypeOf(brand.extensions?.gameMode).toEqualTypeOf<unknown>();
  });
});
