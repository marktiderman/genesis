// @feat:observability
// The iOS privacy manifest (genesis-cli's withGenesis) can't load this React Native block, so it
// keeps its own copy of what the block collects. This keeps the two the same.
import { describe, expect, it } from "vitest";
import { PRIVACY_BLOCKS } from "../../../../genesis-cli/src/expo";
import { createObservability, defineEvents } from "../../observability";

const sorted = (uses: readonly { type: string; purposes: readonly string[]; linked: boolean; tracking: boolean }[]) =>
  [...uses].map((u) => ({ ...u, purposes: [...u.purposes].sort() })).sort((a, b) => a.type.localeCompare(b.type));

describe("observability privacy", () => {
  it("is what genesis-cli declares in the privacy manifest, for the block with events", () => {
    const block = createObservability({ sinks: [], events: defineEvents({ "auth.signed_out": {} }) });
    expect(sorted(block.contributes?.privacy?.collects ?? [])).toEqual(sorted(PRIVACY_BLOCKS.observability!.collects));
  });

  it("declares no analytics without events", () => {
    const block = createObservability({ sinks: [] });
    const collects = block.contributes?.privacy?.collects ?? [];
    expect(collects.some((u) => u.purposes.includes("analytics"))).toBe(false);
  });
});
