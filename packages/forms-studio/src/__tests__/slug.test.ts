// @feat:forms-studio
// The app's tests for these (feedback-admin, feedback-duplicate, helpers), moved with the code.
import { describe, expect, it } from "vitest";
import { copyTitle, freeSlug, offersSubmitAnother, SLUG_PATTERN, slugFromTitle, validateSlug } from "../rules";

describe("slugFromTitle", () => {
  it("makes a valid link from a title", () => {
    for (const title of ["How was class?", "  New member — check-in!  ", "Café feedback 2026", "???", "a".repeat(80)]) {
      const slug = slugFromTitle(title);
      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
    expect(slugFromTitle("How was class?")).toBe("how-was-class");
    expect(slugFromTitle("Café feedback 2026")).toBe("cafe-feedback-2026");
    expect(slugFromTitle("???")).toBe("form");
    expect(slugFromTitle("???", "worksheet")).toBe("worksheet");
  });
});

describe("validateSlug", () => {
  it("accepts lowercase words joined by hyphens", () => {
    expect(validateSlug("how-was-class")).toBeUndefined();
    expect(validateSlug("How was class")).toMatch(/lowercase/);
    expect(validateSlug("how--was")).toMatch(/lowercase/);
  });
});

describe("duplicates", () => {
  it("names a copy and finds it a free link", () => {
    expect(copyTitle("How was class?")).toBe("Copy of How was class?");
    expect(copyTitle("x".repeat(200))).toHaveLength(120);
    expect(freeSlug("copy-of-a", new Set())).toBe("copy-of-a");
    expect(freeSlug("copy-of-a", new Set(["copy-of-a", "copy-of-a-2"]))).toBe("copy-of-a-3");
    expect(freeSlug("a".repeat(60), new Set(["a".repeat(60)]))).toBe(`${"a".repeat(58)}-2`);
  });
});

// The app's src/test/feedback-respondent.test.ts.
describe("offersSubmitAnother", () => {
  it("is on by default", () => {
    expect(offersSubmitAnother({ anonymous: false })).toBe(true);
    expect(offersSubmitAnother({ anonymous: true, submitAnother: true })).toBe(true);
  });

  it("is off when staff turn it off", () => {
    expect(offersSubmitAnother({ anonymous: false, submitAnother: false })).toBe(false);
  });

  it("is never offered on a one-response-per-person form", () => {
    expect(offersSubmitAnother({ anonymous: false, submitAnother: true, onePerPerson: true })).toBe(false);
  });

  it("ignores one per person on an anonymous form, which can't tell people apart", () => {
    expect(offersSubmitAnother({ anonymous: true, submitAnother: true, onePerPerson: true })).toBe(true);
  });
});
