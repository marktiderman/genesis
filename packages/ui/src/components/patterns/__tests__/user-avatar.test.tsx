/**
 * UserAvatar accessible-name + initials contract.
 *
 * Both behaviours pinned here are invisible to the compiler: a fallback avatar
 * that announces "AL" instead of the person's name, and a name whose first
 * character is a UTF-16 surrogate half, are both perfectly valid TypeScript.
 * Reviewers (PR #369) flagged both.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DISTINCT_AVATAR_TINTS, UserAvatar } from "../user-avatar";

function hslToRgb(h: number, s: number, l: number): number[] {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("UserAvatar — accessible name", () => {
  it("exposes the full name as an image on the initials fallback path", () => {
    render(<UserAvatar name="Ada Lovelace" />);

    // role=img is what makes the author-supplied label reliable here; without
    // it the root is a generic span and AT can announce just the initials.
    const avatar = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(avatar.textContent).toBe("AL");
  });

  it("does not announce the name twice when an image is supplied", () => {
    render(<UserAvatar name="Grace Hopper" src="https://example.test/g.png" />);

    // Exactly one node carries the person's name.
    expect(screen.getAllByRole("img", { name: "Grace Hopper" })).toHaveLength(1);

    // Any nested <img> must be presentational (alt="") so it contributes no
    // second accessible name.
    for (const img of Array.from(document.querySelectorAll("img"))) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("applies testID to the avatar root", () => {
    render(<UserAvatar name="Ada Lovelace" testID="who" />);
    expect(screen.getByTestId("who")).toBe(screen.getByRole("img"));
  });
});

describe("UserAvatar — initials", () => {
  const initialsFor = (name: string): string => {
    const { unmount } = render(<UserAvatar name={name} />);
    const text = screen.getByRole("img").textContent ?? "";
    unmount();
    return text;
  };

  it("takes first + last initial of a multi-word name", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
  });

  it("takes a single initial of a one-word name", () => {
    expect(initialsFor("Cher")).toBe("C");
  });

  it("uses the first and LAST word, ignoring middle names", () => {
    expect(initialsFor("Ada King Lovelace")).toBe("AL");
  });

  it("collapses irregular whitespace", () => {
    expect(initialsFor("  Ada   Lovelace  ")).toBe("AL");
  });

  it("falls back to ? for a blank name", () => {
    expect(initialsFor("   ")).toBe("?");
  });

  it("keeps non-BMP initials intact rather than splitting a surrogate pair", () => {
    // U+10400 DESERET CAPITAL LETTER LONG I — charAt(0) would return a lone
    // high surrogate here and render as a replacement glyph.
    const initials = initialsFor("\u{10400} Smith");
    expect(initials).toBe("\u{10400}S");
    // Two user-perceived characters, not three UTF-16 halves.
    expect(Array.from(initials)).toHaveLength(2);
  });

  it("keeps emoji initials intact", () => {
    const initials = initialsFor("\u{1F60A} Jones");
    expect(initials).toBe("\u{1F60A}J");
    expect(Array.from(initials)).toHaveLength(2);
  });

  it("keeps a combining mark attached to its base letter", () => {
    // "e" + U+0301 COMBINING ACUTE. Code-point slicing keeps only the bare
    // "e" and drops the accent; grapheme segmentation keeps the pair.
    const initials = initialsFor("e\u0301lodie Durand");
    // Uppercasing yields a decomposed E + acute; compare in NFC so the
    // assertion is about the character, not the normalization form.
    expect(initials.normalize("NFC")).toBe("\u00C9D");
  });

  it("tells one-word names apart when distinct: two letters and a stable tint", () => {
    const shown = (name: string) => {
      const { unmount } = render(<UserAvatar name={name} distinct />);
      const el = screen.getByRole("img");
      const out = { text: el.textContent ?? "", tint: el.querySelector("span")?.className ?? "" };
      unmount();
      return out;
    };
    expect(shown("Probe").text).toBe("Pr");
    expect(shown("Polish").text).toBe("Po");
    expect(shown("Ada Lovelace").text).toBe("AL");
    expect(shown("Probe").tint).toBe(shown("Probe").tint);
    expect(shown("Probe").tint).not.toBe(shown("Polish").tint);
  });

  it("pairs every distinct tint with foreground text that passes 4.5:1 in light and dark", () => {
    // Each tint is a chart-colour wash behind the foreground text, never the chart colour as text.
    for (const tint of DISTINCT_AVATAR_TINTS) expect(tint).toMatch(/^bg-chart-[1-5]\/20 text-foreground$/);
    const css = readFileSync(createRequire(import.meta.url).resolve("@marktiderman/genesis-design-system/themes/genesis.css"), "utf8");
    const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
    for (const theme of [block(":root"), block(".dark")]) {
      const token = (name: string) => {
        const [h, s, l] = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(theme)!.slice(1).map(Number);
        return hslToRgb(h!, s!, l!);
      };
      const fg = token("foreground");
      const bg = token("background");
      for (const tint of DISTINCT_AVATAR_TINTS) {
        const chart = token(/bg-(chart-\d)/.exec(tint)![1]!);
        const wash = chart.map((c, i) => c * 0.2 + bg[i]! * 0.8);
        expect(contrast(fg, wash)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps one initial and no tint without distinct", () => {
    render(<UserAvatar name="Probe" />);
    const el = screen.getByRole("img");
    expect(el.textContent).toBe("P");
    expect(el.querySelector("span")?.className ?? "").not.toMatch(/chart-/);
  });
});
