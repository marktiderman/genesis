/** Escapes every character a RegExp reads specially, so `s` matches itself literally. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
