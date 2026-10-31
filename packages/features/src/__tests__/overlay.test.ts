// @feat:app-overlays
import { describe, expect, it } from "vitest";
import { overlayUpstream, readOverlayMarker } from "../overlay";
import { readPackageMeta } from "../packages";

const NAME = "@marktiderman/genesis-support";
const MARKER = { upstream: `${NAME}@0.2.6`, since: "2026-10-30", owner: "web team", reason: "inbox filters, to promote upstream" };

describe("readOverlayMarker", () => {
  it("accepts a complete marker, a prerelease upstream and a $comment", () => {
    expect(readOverlayMarker(NAME, MARKER)).toEqual(MARKER);
    expect(readOverlayMarker(NAME, { ...MARKER, upstream: `${NAME}@1.0.0-beta.2`, $comment: "x" })).not.toBeNull();
    expect(overlayUpstream(MARKER)).toEqual({ name: NAME, version: "0.2.6" });
  });

  it("names each problem: upstream, since, owner, reason and unknown keys", () => {
    const problems: string[] = [];
    expect(readOverlayMarker(NAME, { upstream: "genesis-support", since: "30/10/2026", owner: " ", until: "x" }, problems)).toBeNull();
    expect(problems).toEqual([
      expect.stringMatching(/unknown key "until"/),
      expect.stringMatching(/\.upstream: must be "@marktiderman\/genesis-<name>@<version>"/),
      expect.stringMatching(/\.since: must be the day/),
      expect.stringMatching(/\.owner: say who/),
      expect.stringMatching(/\.reason: say why/),
    ]);
  });

  it("refuses a range, a non-Genesis upstream, another package's upstream and an impossible date", () => {
    for (const upstream of [`${NAME}@^0.2.6`, `${NAME}@latest`, "@acme/support@0.2.6"]) {
      expect(readOverlayMarker(NAME, { ...MARKER, upstream })).toBeNull();
    }
    const problems: string[] = [];
    readOverlayMarker(NAME, { ...MARKER, upstream: "@marktiderman/genesis-ui@1.0.0" }, problems);
    expect(problems).toEqual([expect.stringMatching(/names @marktiderman\/genesis-ui, but the package is/)]);
    expect(readOverlayMarker(NAME, { ...MARKER, since: "2026-02-30" })).toBeNull();
    expect(readOverlayMarker(NAME, "yes")).toBeNull();
  });

  it("is checked as part of a package's genesis metadata", () => {
    const problems: string[] = [];
    readPackageMeta(NAME, { layer: "primitive", group: "collaboration", overlay: { ...MARKER, since: "soon" } }, problems);
    expect(problems).toEqual([expect.stringMatching(/genesis\.overlay\.since/)]);
    expect(readPackageMeta(NAME, { layer: "primitive", group: "collaboration", overlay: MARKER })?.overlay).toEqual(MARKER);
  });
});
