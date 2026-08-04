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

import { UserAvatar } from "../user-avatar";

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
});
