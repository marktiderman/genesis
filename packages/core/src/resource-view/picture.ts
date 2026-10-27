// rowPicture: what to draw for a row's picture (docs/RESOURCE-VIEW.md, "summary"). Pure, so web,
// native and the extension draw the same image or initials, behind the same URL check.

import { isSafeUrl } from "../urls";
import type { RowPicture, RowSummary } from "./types";

let segmenter: Intl.Segmenter | null | undefined;

// The first letter of a word, as a whole character: "é" keeps its accent, "李" is a letter, and
// punctuation, digits and emoji never count.
const LETTER = /^\p{L}/u;
function firstLetter(word: string): string {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  const parts = segmenter ? Array.from(segmenter.segment(word), (s) => s.segment) : Array.from(word);
  return parts.find((part) => LETTER.test(part)) ?? "";
}

/**
 * First and last initial of a name, from letters only: "Ada Lovelace" → "AL", "Ana-María López"
 * → "AL", "李 小龙" → "李小", "Cher" → "C". Empty when the name has no letters ("  ", "🎉🎉").
 */
export function initialsOf(name: string | undefined): string {
  const letters = (name ?? "").trim().split(/\s+/).map(firstLetter).filter(Boolean);
  if (letters.length === 0) return "";
  const pair = letters.length === 1 ? [letters[0]!] : [letters[0]!, letters[letters.length - 1]!];
  // One character each: "ß" stays "ß" rather than becoming "SS".
  return pair.map((l) => (l.toUpperCase().length === l.length ? l.toUpperCase() : l)).join("");
}

/** An image source: `isSafeUrl`, and only http(s) or a root-relative path (never mailto, tel or `#x`). */
function isImageSrc(src: unknown): src is string {
  if (!isSafeUrl(src)) return false;
  const value = src.trim();
  return value.startsWith("/") || /^https?:/i.test(value);
}

/**
 * What to draw for a summary's picture:
 *
 * ```ts
 * rowPicture({ title: "Ada", image: { src: "https://…/ada.png", name: "Ada Lovelace" } });
 * // { kind: "image", src: "https://…/ada.png", alt: "", fallback: "AL" }
 * rowPicture({ title: "Ada", image: { src: "javascript:x", name: "Ada Lovelace" } });
 * // { kind: "initials", text: "AL" }
 * ```
 *
 * `null` when the summary has no `image`, or neither a safe `src` nor a `name` with letters.
 */
export function rowPicture(summary: RowSummary): RowPicture | null {
  const image = summary.image;
  if (!image) return null;
  const initials = initialsOf(image.name);
  if (isImageSrc(image.src)) return { kind: "image", src: image.src.trim(), alt: image.alt ?? "", fallback: initials };
  return initials ? { kind: "initials", text: initials } : null;
}
