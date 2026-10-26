// rowPicture: what to draw for a row's picture (docs/RESOURCE-VIEW.md, "summary"). Pure, so web,
// native and the extension draw the same image or initials, behind the same URL check.

import { isSafeUrl } from "../urls";
import type { RowPicture, RowSummary } from "./types";

let segmenter: Intl.Segmenter | null | undefined;

// The first user-perceived character, so "😊 Jones" or "é" never splits into half a character.
function firstGrapheme(word: string): string {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  if (segmenter) {
    for (const { segment } of segmenter.segment(word)) return segment;
    return "";
  }
  return Array.from(word)[0] ?? "";
}

/** First and last initial of a name: "Ada Lovelace" → "AL", "Cher" → "C", "" → "". */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = firstGrapheme(words[0]!);
  return (words.length === 1 ? first : first + firstGrapheme(words[words.length - 1]!)).toUpperCase();
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
  if (isSafeUrl(image.src)) return { kind: "image", src: image.src.trim(), alt: image.alt ?? "", fallback: initials };
  return initials ? { kind: "initials", text: initials } : null;
}
