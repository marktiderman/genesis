// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import { createNobleSha256, createSha256, sha256Stream } from "../hash";
import { MAX_PARTS, choosePartSize, formatContentDigest, parseContentDigest, partPlan, toHex } from "../protocol";

const MiB = 1024 * 1024;
const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start: (c) => (chunks.forEach((x) => c.enqueue(x)), c.close()) });

describe("part plan", () => {
  it("splits into equal parts and a shorter last one, with at least one part for an empty file", () => {
    const p = partPlan(10, 4);
    expect([p.count, p.sizeOf(1), p.sizeOf(2), p.sizeOf(3)]).toEqual([3, 4, 4, 2]);
    expect(partPlan(8, 4).sizeOf(2)).toBe(4);
    expect([partPlan(0, 4).count, partPlan(0, 4).sizeOf(1)]).toEqual([1, 0]);
  });

  it("chooses a part size that keeps the count at 10,000 or fewer, within the target's limits", () => {
    expect(choosePartSize(100 * MiB, { min: 8 * MiB, max: 32 * MiB })).toBe(8 * MiB);
    const big = 200 * 1024 * MiB; // 200 GiB
    const size = choosePartSize(big, { min: 8 * MiB, max: 5 * 1024 * MiB })!;
    expect(Math.ceil(big / size)).toBeLessThanOrEqual(MAX_PARTS);
    expect(size % MiB).toBe(0);
    expect(choosePartSize(400 * 1024 * MiB, { min: 8 * MiB, max: 32 * MiB })).toBeUndefined();
  });
});

describe("digests", () => {
  it("formats and reads RFC 9530 content-digest", async () => {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3])));
    const header = formatContentDigest(d);
    expect(header).toMatch(/^sha-256=:[A-Za-z0-9+/]{43}=:$/);
    expect(parseContentDigest(header)).toBe(header.slice(9, -1));
    expect(parseContentDigest(`md5=:abc=:, ${header}`)).toBe(header.slice(9, -1));
    for (const bad of [null, "", "sha-256=abc", "sha-512=:x:", "sha-256=:short=:"]) expect(parseContentDigest(bad)).toBeUndefined();
  });

  it("hashes a stream incrementally, the same with @noble/hashes and the runtime's own", async () => {
    const chunks = [new Uint8Array(70_000).fill(7), new Uint8Array(3).fill(1), new Uint8Array(0)];
    const whole = new Uint8Array(70_003);
    whole.fill(7, 0, 70_000);
    whole.fill(1, 70_000);
    const want = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", whole)));
    expect(await sha256Stream(stream(chunks))).toEqual({ sha256: want, size: 70_003 });
    expect(await sha256Stream(stream(chunks), createNobleSha256)).toEqual({ sha256: want, size: 70_003 });
    const h = createSha256();
    h.update(whole);
    expect(toHex(h.digest())).toBe(want);
  });
});
